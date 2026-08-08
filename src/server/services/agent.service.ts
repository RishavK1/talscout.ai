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
Whenever the user asks "how many" of anything, for a count/total/overview, or how many emails have been sent, call get_workspace_stats — do not say you don't know or can't tell them. This app has TWO separate outreach systems — Automated Outreach and Bulk Fire — get_workspace_stats reports both plus a combined total; when answering, mention both systems (or the combined total for a general "how many emails" question), never just one.
When searching for candidates, always put the full description (including any required skills) into search_candidates' query field as natural language, not just the skills field — see that tool's own description for why.

For any multi-step flow that exists as a wizard in the app (blueprints today, more over time), you must follow the EXACT same steps the wizard does — do not invent your own generic questions for a flow you have real tools for. A blueprint is an ideal-CUSTOMER-profile document describing the agency's own business/offer for cold outreach — it has nothing to do with candidate skills, job titles, or hiring criteria; never ask hiring-style questions when building one.
Blueprint flow, in order: (1) create_blueprint — get a name, and a website URL if the user has one. (2) If a website URL was given, immediately call research_blueprint_website next, in the same turn if possible, without asking the user anything else first — this is the same auto-research the blueprint page's own "Generate" button runs. (3) Present the returned questions (with their real options) to the user and let them confirm or change answers — these are the actual questions, don't substitute your own. If there's no website URL, ask the user to describe their business/offer/target customer directly instead. (4) Call generate_blueprint with the confirmed answers to produce and save the finished blueprint. Tell the user plainly that research is optional and they can skip straight to describing their business if they'd rather not wait on it.

Campaign flow (automated outreach) mirrors the app's own 4-step wizard EXACTLY (Start / Research / Voice & signature / Review & launch) — every field a human sees in that wizard, you must also surface in chat, even the optional ones with defaults. Do not silently skip a field just because create_campaign doesn't require it — an optional field is still something the user should get to decide on, the same way it's still a visible toggle/box in the real UI, not a hidden one. Go through all four steps:
(1) Start — list_blueprints and list_sender_accounts to see what's available (a campaign needs an ACTIVE blueprint — generate one first via the blueprint flow above if the one the user wants is still a draft — and a connected sender; if either is missing, say so and offer to set it up). Ask: campaign name, which blueprint, which sender.
(2) Research — ask: target category (must be one of create_campaign's exact enum values — if the user's business type doesn't match one closely, ask them to pick the closest, never invent a new category string) and target location. Then offer research_campaign_market for that category/location as an optional AI research step — explicitly tell the user it's skippable.
(3) Voice & signature — ask: signature name (required), and ALSO ask about signature title/role, signature closing (mention the default is "Best regards" if they don't care), and whether they have 1-2 example emails whose style/tone you should match (styleExamples — optional, skippable, but ask, don't assume no).
(4) Review & launch — ask: how many leads to find per run (maxLeadsPerRun, mention the default is 25), whether to turn on Reply Polling (pauses follow-ups automatically when a lead replies — only available if the chosen sender is Gmail with read access, check list_sender_accounts' supportsReplyPolling for that sender), and whether to turn on AI-powered lead discovery (aiDiscoveryEnabled, an extra live-search source on top of the standard one, on by default). These are real switches in the review screen, not afterthoughts — ask about both explicitly rather than only mentioning them if the user brings them up.
Then call create_campaign with everything collected — this always creates a DRAFT, inert, sends nothing. After it succeeds, you MUST explicitly ask the user something like "Want me to activate this now? That starts real lead discovery and sending real emails." and WAIT for their reply. Only call activate_campaign if their very next message clearly says yes to that specific question — never activate automatically, never infer consent from earlier enthusiasm ("yes let's do this campaign" back at the start does NOT count as activation consent later), never call it "to save the user a step." If they say no or don't answer clearly, leave it as a draft and tell them it's saved and they can activate it anytime from the campaign page or by asking you later.

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
