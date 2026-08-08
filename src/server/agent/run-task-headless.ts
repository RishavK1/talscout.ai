import { generateText, stepCountIs, type ToolSet } from "ai";
import { getAgentModelChain } from "@/server/agent/models";

/**
 * Runs one scheduled/background agent task to completion — no live SSE
 * consumer, so this uses `generateText` (not `streamText`) and returns the
 * final text once the whole tool loop finishes.
 *
 * Deliberately PRIMARY MODEL ONLY, no cross-model fallback — unlike
 * run-turn.ts's interactive path, which can safely retry the whole turn on
 * a different model because it tracks exactly when the first byte reached
 * a real user (see its `committed` flag) and only retries before that
 * point. A headless run has no such checkpoint to reason about: if the
 * primary model calls a side-effecting tool and then fails on a LATER
 * step, blindly retrying with a fallback model would replay the same
 * instruction from scratch and could double a real action (e.g. two
 * scheduled emails instead of one) with nobody watching to notice. Given
 * the choice between "occasionally a background task fails outright and
 * gets marked 'error' for the user to see" versus "a background task
 * silently does something twice," failing outright is the safe default —
 * the caller (run-agent-task.ts) surfaces the failure on the task row.
 */
export async function runAgentTaskHeadless(args: {
  system: string;
  instruction: string;
  tools: ToolSet;
}): Promise<{ text: string; toolCallCount: number }> {
  const candidates = getAgentModelChain();
  if (candidates.length === 0) {
    throw new Error("No agent model is configured (no AI provider key set)");
  }
  const result = await generateText({
    model: candidates[0].model,
    system: args.system,
    prompt: args.instruction,
    tools: args.tools,
    stopWhen: stepCountIs(8),
  });
  // Some models (seen with both a free OpenRouter model and, occasionally,
  // Gemini) finish a multi-step tool-call turn without emitting a closing
  // text summary — the tool calls still ran for real, there just isn't a
  // final sentence about them. toolCallCount lets the caller tell "ran
  // fine, no summary" apart from "did genuinely nothing."
  const toolCallCount = result.steps.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0);
  return { text: result.text, toolCallCount };
}
