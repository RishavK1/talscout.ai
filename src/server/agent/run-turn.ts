import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
  type UIMessageChunk,
  type ToolSet,
} from "ai";
import { logger } from "@/server/observability/logger";
import type { AgentModelCandidate } from "@/server/agent/models";

/** Chunk types that mean "the model actually produced something" — once one
 *  of these arrives, we're committed to this provider's stream and can no
 *  longer silently swap to the next candidate (a tool may already be mid-
 *  execution). Anything before this point is safe to discard and retry. */
const COMMIT_CHUNK_TYPES = new Set([
  "text-start",
  "reasoning-start",
  "tool-input-start",
  "tool-input-available",
]);

/**
 * Runs one agent turn against the model fallback chain, retrying the WHOLE
 * turn on the next model only if the failure happens before any real output
 * (text or tool call) was produced — never mid-tool-loop. This is the
 * mitigation for the duplicate-side-effect risk flagged in the system
 * design doc: two different models both trying to finish "send this email"
 * because the first one failed halfway through would be a real correctness
 * bug, not just a UX hiccup. Once a provider is committed, its failures
 * surface to the user as a normal stream error instead of silently
 * switching providers.
 */
export function runAgentTurn(args: {
  candidates: AgentModelCandidate[];
  system: string;
  messages: UIMessage[];
  tools: ToolSet;
  /** Used for any candidate whose `fullToolsSafe` is false, instead of
   *  `tools` — falls back to `tools` if not given. Exists because
   *  Composio-published tool schemas (real third-party app actions, not
   *  ours) have been observed live to make OpenRouter's strict validator
   *  reject the ENTIRE request ("auto tool schema uses unsupported
   *  assertions or reserved metadata") — a different failure mode than the
   *  tool-COUNT cap this file's fallback logic already handles, and not
   *  something we can fix by rewriting a schema (it isn't ours). Gemini
   *  (primary or secondary key — see models.ts) has shown no such issue,
   *  so it gets the full tool set; an unsafe candidate gets the smaller,
   *  all-our-own-schemas set instead of failing outright — degraded (no
   *  connected-app tools) beats broken. */
  fallbackTools?: ToolSet;
  /** The incoming HTTP request's AbortSignal — closing the tab or
   *  navigating away aborts the underlying model call (and, since tool
   *  execution runs inside the same call, stops any not-yet-started tool
   *  from firing for a request nobody's watching anymore). Already-started
   *  tool calls still finish rather than being torn down mid-write, since
   *  the AI SDK doesn't guarantee a clean rollback point there either. */
  signal?: AbortSignal;
  onFinish?: (message: UIMessage) => Promise<void> | void;
}): Response {
  if (args.candidates.length === 0) {
    throw new Error("No agent model is configured (no AI provider key set)");
  }

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      const modelMessages = await convertToModelMessages(args.messages, { tools: args.tools });
      let lastError: unknown;
      for (const candidate of args.candidates) {
        if (args.signal?.aborted) return;
        const toolsForCandidate = candidate.fullToolsSafe ? args.tools : (args.fallbackTools ?? args.tools);
        const reader = streamText({
          model: candidate.model,
          system: args.system,
          messages: modelMessages,
          tools: toolsForCandidate,
          stopWhen: stepCountIs(8),
          abortSignal: args.signal,
        })
          .toUIMessageStream()
          .getReader();

        const buffered: UIMessageChunk[] = [];
        let committed = false;
        let failed = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (!committed && value.type === "error") {
              failed = true;
              lastError = new Error(value.errorText);
              break;
            }
            if (!committed && COMMIT_CHUNK_TYPES.has(value.type)) {
              committed = true;
              for (const b of buffered) writer.write(b);
              buffered.length = 0;
            }
            if (committed) {
              writer.write(value);
            } else {
              buffered.push(value);
            }
          }
        } catch (err) {
          if (args.signal?.aborted) return; // client disconnected — stop, don't burn the next candidate
          if (!committed) {
            failed = true;
            lastError = err;
          } else {
            throw err; // already committed to this provider — surface as-is
          }
        }

        if (!failed) {
          // Stream ended cleanly. If we never committed (e.g. the model
          // returned only scaffolding, no text/tool content — unusual but
          // not an error), flush whatever we buffered so the turn isn't
          // silently empty.
          for (const b of buffered) writer.write(b);
          return;
        }

        logger.error(
          { model: candidate.label, err: lastError instanceof Error ? lastError.message : String(lastError) },
          "agent_model_failed_before_output_trying_next",
        );
      }

      throw lastError instanceof Error ? lastError : new Error("Every agent model failed");
    },
    onError: (error) => {
      // Default behavior hides the real message entirely ("An error
      // occurred") — that's the right instinct (never leak stack traces or
      // internal provider errors to the client) but too opaque for a chat
      // UI that should tell the user *something* actionable. Every message
      // that reaches here has already been through AppError-aware handling
      // upstream where one existed; anything landing here is an
      // unstructured model/provider failure, so a fixed, honest, non-leaky
      // message is the right tradeoff.
      logger.error({ err: error instanceof Error ? error.message : String(error) }, "agent_turn_stream_error");
      return "The AI Agent ran into a problem and couldn't finish. Please try again.";
    },
    onEnd: async ({ responseMessage }) => {
      if (args.onFinish && responseMessage) {
        await args.onFinish(responseMessage);
      }
    },
    originalMessages: args.messages,
  });

  return createUIMessageStreamResponse({ stream });
}
