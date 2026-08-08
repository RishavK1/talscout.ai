import { z } from "zod";
import { withAuth } from "@/server/http/with-api";
import { resolveSession } from "@/server/auth/session";
import { assertRole } from "@/server/auth/rbac";
import { getServices } from "@/server/container";
import { getEnv } from "@/server/config/env";
import { agentService } from "@/server/services/agent.service";
import { AppError } from "@/server/http/errors";
import { uuidOr404 } from "@/server/validation/common";
import type { UIMessage } from "ai";

/** GET /api/agent/conversations/[id]/messages — load a conversation's
 *  history (used to hydrate the chat UI on open/refresh). viewer+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Conversation not found");
    return { data: await agentService.getMessages(ctx, id) };
  },
  { role: "viewer" },
);

const bodySchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
});

/**
 * POST /api/agent/conversations/[id]/messages — runs one streamed agent
 * turn. Deliberately NOT `withAuth`: that wrapper always serializes a JSON
 * body, but this route streams (Vercel AI SDK's UI message stream) — see
 * the system design doc's "Streaming route" section for why this is a
 * documented, isolated exception rather than a precedent. Auth/rate-limit/
 * capability checks are done by hand below instead, same checks `withAuth`
 * would otherwise apply. recruiter+ (matches every other AI-writing action
 * in this app, not viewer — running the agent has real cost and can take
 * real actions, unlike read-only search).
 */
export async function POST(req: Request, routeCtx?: { params?: Promise<Record<string, string>> }) {
  try {
    const session = await resolveSession(req);
    assertRole(session.role, "recruiter");

    const params = routeCtx?.params ? await routeCtx.params : {};
    const id = uuidOr404(params.id, "Conversation not found");

    // Per-USER, not per-tenant: a shared tenant-wide budget meant three
    // recruiters actively using the agent in the same workspace would
    // exhaust one 20/hour pool between them and see confusing rate-limit
    // errors that had nothing to do with their own usage.
    const rl = await getServices().limiter.limit(
      `rl:tenant:${session.tenantId}:user:${session.userId}:agent_message`,
      getEnv().AGENT_RATE_LIMIT_PER_HOUR,
      3600,
    );
    if (!rl.success) {
      return Response.json(
        { error: { code: "rate_limited", message: "Too many agent messages — try again shortly." } },
        { status: 429 },
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return Response.json({ error: { code: "bad_request", message: "Malformed JSON body" } }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: { code: "bad_request", message: "Invalid message payload" } }, { status: 400 });
    }

    return await agentService.runTurn(
      { tenantId: session.tenantId, userId: session.userId },
      id,
      parsed.data.messages as unknown as UIMessage[],
      req.signal,
      new URL(req.url).origin,
    );
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return Response.json({ error: { code: "internal_error", message: "Something went wrong" } }, { status: 500 });
  }
}
