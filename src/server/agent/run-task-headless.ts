import { streamText, stepCountIs, type ToolSet } from "ai";
import { getAgentModelChain, type AgentModelCandidate } from "@/server/agent/models";
import { logger } from "@/server/observability/logger";

/** Same commit point as run-turn.ts's UI-message-stream version, translated
 *  to streamText's raw `fullStream` chunk names (`tool-input-available` on
 *  the UI stream corresponds to `tool-call` here — the point a tool call is
 *  fully resolved, not just starting to stream in). Once one of these
 *  arrives, real work may already be underway and switching models stops
 *  being safe. */
const COMMIT_CHUNK_TYPES = new Set(["text-start", "reasoning-start", "tool-input-start", "tool-call"]);

/**
 * Runs one scheduled/background agent task to completion — no live SSE
 * consumer, so results are accumulated internally rather than streamed to a
 * UI, but the model-fallback logic is now the SAME safe mechanism
 * run-turn.ts uses for interactive chat: retry the WHOLE run on the next
 * candidate (secondary Gemini key, then OpenRouter) only if the failure
 * happens before any real output (text or tool call) — never mid-run.
 *
 * This replaces an earlier "primary model only, zero fallback" version.
 * That version was deliberately conservative to avoid a duplicate-action
 * risk (retrying a whole task with a different model after a tool already
 * fired could double a real action) — but it turned out too conservative in
 * practice: Gemini's free-tier quota (20 req/day, shared across every
 * Gemini-backed feature in this app, not just scheduled tasks) is easy to
 * exhaust, and with zero fallback every recurring task then fails on every
 * single run until the quota resets, which a live user hit for real. The
 * actual unsafe case is narrower than "any failure" — it's specifically a
 * failure AFTER a tool already started, which this file can now detect and
 * guard against directly (same `committed` tracking run-turn.ts already
 * proved out), instead of refusing to ever retry at all.
 */
export async function runAgentTaskHeadless(args: {
  system: string;
  instruction: string;
  tools: ToolSet;
  /** Same purpose as run-turn.ts's fallbackTools — used for any candidate
   *  whose fullToolsSafe is false (OpenRouter), since Composio-published
   *  tool schemas have been observed to make it reject the whole request.
   *  Now that this file actually falls back to OpenRouter (it never did
   *  before), it needs the same guard. */
  fallbackTools?: ToolSet;
}): Promise<{ text: string; toolCallCount: number }> {
  const candidates = getAgentModelChain();
  if (candidates.length === 0) {
    throw new Error("No agent model is configured (no AI provider key set)");
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    const result = await runOneCandidate(candidate, args);
    if (result.ok) return { text: result.text, toolCallCount: result.toolCallCount };
    if (result.committed) {
      // Real work may already have happened on this candidate — surface the
      // failure as-is rather than risk a fallback model repeating it.
      throw result.error;
    }
    lastError = result.error;
    logger.error(
      { model: candidate.label, err: lastError instanceof Error ? lastError.message : String(lastError) },
      "agent_task_headless_model_failed_before_output_trying_next",
    );
  }

  throw lastError instanceof Error ? lastError : new Error("Every agent model failed");
}

async function runOneCandidate(
  candidate: AgentModelCandidate,
  args: { system: string; instruction: string; tools: ToolSet; fallbackTools?: ToolSet },
): Promise<
  | { ok: true; text: string; toolCallCount: number }
  | { ok: false; committed: boolean; error: unknown }
> {
  const tools = candidate.fullToolsSafe ? args.tools : (args.fallbackTools ?? args.tools);
  const result = streamText({
    model: candidate.model,
    system: args.system,
    prompt: args.instruction,
    tools,
    stopWhen: stepCountIs(8),
  });

  let committed = false;
  let text = "";
  let toolCallCount = 0;

  try {
    for await (const chunk of result.fullStream) {
      if (!committed && chunk.type === "error") {
        return { ok: false, committed: false, error: new Error(String((chunk as { error: unknown }).error)) };
      }
      if (!committed && COMMIT_CHUNK_TYPES.has(chunk.type)) committed = true;
      if (chunk.type === "text-delta") text += chunk.text;
      if (chunk.type === "tool-call") toolCallCount += 1;
    }
    return { ok: true, text, toolCallCount };
  } catch (err) {
    return { ok: false, committed, error: err };
  }
}
