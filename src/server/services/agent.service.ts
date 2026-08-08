import { generateText, type UIMessage } from "ai";
import { withTenantTx, type TenantContext } from "@/server/db/tx";
import { agentRepo } from "@/server/repositories/agent.repo";
import { billingService } from "@/server/services/billing.service";
import { NotFound, BadRequest } from "@/server/http/errors";
import { getAgentModelChain } from "@/server/agent/models";
import { buildInHouseTools } from "@/server/agent/tools";
import { runAgentTurn } from "@/server/agent/run-turn";
import { logger } from "@/server/observability/logger";

const SYSTEM_PROMPT = `You are the TalScout AI Agent, embedded in a recruiting/talent-sourcing app used by HR and recruiting teams — many of whom are not technical.
You can take real actions on the user's behalf using the tools available to you (searching candidates, creating blueprints, checking workspace numbers, and more over time). Prefer calling a tool over describing what the user could do manually — never guess or make up a number, name, or fact about the user's workspace; always call a tool to look it up.
Whenever the user asks "how many" of anything, or for a count/total/overview, call get_workspace_stats — do not say you don't know or can't tell them.
When searching for candidates, always put the full description (including any required skills) into search_candidates' query field as natural language, not just the skills field — see that tool's own description for why.
Ask brief, specific follow-up questions when you're missing required information for a tool — don't guess at destructive or costly actions (sending something, creating something permanent). Keep responses concise and friendly, written for a non-technical reader. Format responses in Markdown where it helps (short lists, a small table for multiple results) — it renders properly in this chat.`;

/** Generous but bounded — long enough for someone to paste a real job
 *  description, short enough that one message can't blow up token cost or
 *  the request body. */
const MAX_MESSAGE_CHARS = 8_000;

export const agentService = {
  async listConversations(ctx: TenantContext) {
    await billingService.assertCapability(ctx, "ai_agent");
    return await agentRepo.listConversations(ctx);
  },

  async createConversation(ctx: TenantContext) {
    await billingService.assertCapability(ctx, "ai_agent");
    return await agentRepo.createConversation(ctx);
  },

  async getMessages(ctx: TenantContext, conversationId: string) {
    const conv = await agentRepo.getConversation(ctx, conversationId);
    if (!conv) throw new NotFound("Conversation not found");
    const rows = await agentRepo.listMessages(ctx, conversationId);
    return { conversation: conv, messages: rows };
  },

  async setPinned(ctx: TenantContext, conversationId: string, pinned: boolean) {
    const conv = await agentRepo.getConversation(ctx, conversationId);
    if (!conv) throw new NotFound("Conversation not found");
    await agentRepo.setPinned(ctx, conversationId, pinned);
  },

  async archiveConversation(ctx: TenantContext, conversationId: string) {
    const conv = await agentRepo.getConversation(ctx, conversationId);
    if (!conv) throw new NotFound("Conversation not found");
    await agentRepo.archiveConversation(ctx, conversationId);
  },

  /** Runs one streamed turn. Persists the user's message immediately (so it
   *  survives even if the stream itself fails), and the assistant's
   *  finished message in `onFinish` — never before the stream completes, so
   *  a dropped connection doesn't leave a phantom half-written row.
   *
   *  `signal` (the incoming request's AbortSignal) is threaded through to
   *  the model call so that closing the tab / navigating away actually
   *  stops the turn server-side — without this, an abandoned request kept
   *  running to completion, including any tool calls with real side
   *  effects (e.g. a blueprint could get created for a request nobody was
   *  watching anymore). */
  async runTurn(
    identity: { tenantId: string; userId: string },
    conversationId: string,
    messages: UIMessage[],
    signal?: AbortSignal,
  ): Promise<Response> {
    await withTenantTx(identity, (ctx) => billingService.assertCapability(ctx, "ai_agent"));

    const conv = await withTenantTx(identity, (ctx) => agentRepo.getConversation(ctx, conversationId));
    if (!conv) throw new NotFound("Conversation not found");

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      throw new BadRequest("Expected the last message to be from the user");
    }
    const messageText = lastMessage.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim();
    if (!messageText) {
      throw new BadRequest("Message can't be empty");
    }
    if (messageText.length > MAX_MESSAGE_CHARS) {
      throw new BadRequest(`Message is too long (max ${MAX_MESSAGE_CHARS} characters)`);
    }

    const candidates = getAgentModelChain();
    if (candidates.length === 0) {
      throw new BadRequest("The AI Agent isn't configured yet — no model provider key is set.");
    }

    // DB truth, not the client-reported length of `messages` — a stale or
    // retried request could otherwise misfire a title regeneration on an
    // existing conversation, or skip it on a genuinely new one.
    const existingCount = await withTenantTx(identity, (ctx) => agentRepo.countMessages(ctx, conversationId));
    const isFirstMessage = existingCount === 0;

    await withTenantTx(identity, (ctx) =>
      agentRepo.addMessage(ctx, {
        conversationId,
        role: "user",
        parts: lastMessage.parts,
      }),
    );

    if (isFirstMessage) {
      // Fire-and-forget: a slow/failed title generation shouldn't delay or
      // break the actual chat turn. Falls back to a plain truncation if the
      // model call fails for any reason.
      void generateConversationTitle(candidates[0].model, lastMessage)
        .catch(() => truncateForTitle(lastMessage))
        .then((title) => withTenantTx(identity, (ctx) => agentRepo.renameConversation(ctx, conversationId, title)))
        .catch((err) => logger.warn({ err }, "agent_title_generation_failed"));
    } else {
      await withTenantTx(identity, (ctx) => agentRepo.touchConversation(ctx, conversationId));
    }

    const tools = buildInHouseTools(identity);

    return runAgentTurn({
      candidates,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      signal,
      onFinish: async (message) => {
        await withTenantTx(identity, (ctx) =>
          agentRepo.addMessage(ctx, { conversationId, role: "assistant", parts: message.parts }),
        );
        await withTenantTx(identity, (ctx) => agentRepo.touchConversation(ctx, conversationId));
      },
    });
  },
};

function truncateForTitle(message: UIMessage): string {
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text || "New chat";
}

async function generateConversationTitle(model: Parameters<typeof generateText>[0]["model"], message: UIMessage) {
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
  if (!text) return "New chat";

  const { text: title } = await generateText({
    model,
    system: "Generate a short chat title (max 6 words, no quotes, no punctuation at the end) summarizing the user's request.",
    prompt: text.slice(0, 500),
  });
  const cleaned = title.trim().replace(/^["']|["']$/g, "");
  return cleaned.length > 80 ? cleaned.slice(0, 80) : cleaned || truncateForTitle(message);
}
