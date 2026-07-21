import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";

/**
 * Shared OpenRouter calling helper for the four AI-writing ports (blueprint
 * research/generation, campaign copywriting, reply drafting). OpenRouter is
 * a last-resort fallback tier BELOW Gemini — see fallback-ai.ts, which only
 * reaches these adapters once Gemini's primary AND fallback model both fail
 * (e.g. the free daily quota is exhausted).
 *
 * Free-tier models each carry their own independent rate limit, so a single
 * exhausted model doesn't mean the whole tier is down — this walks a list of
 * genuinely free (`:free` suffix) models in order, treating ANY failure
 * (HTTP error, rate limit, empty response, or a response that fails the
 * caller's own parse/validate step) as a signal to try the next model rather
 * than giving up.
 */

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Long-standing free-tier model families on OpenRouter, tried in this
 *  order. Free-model availability shifts over time — a model that's been
 *  retired or renamed simply fails fast (404/400) and the loop moves on, so
 *  this list doesn't need to be perfectly current to be useful. */
export const OPENROUTER_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "google/gemma-2-9b-it:free",
  "mistralai/mistral-7b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "microsoft/phi-3-mini-128k-instruct:free",
];

export interface OpenRouterCallArgs<T> {
  systemPrompt: string;
  userContent: string;
  temperature: number;
  /** Parse + validate the raw text content into the expected shape. Throw
   *  to reject a model's response (malformed JSON, missing required
   *  fields) — that's treated exactly like an HTTP-level failure and the
   *  next free model in the list is tried. */
  parse: (raw: string) => T;
}

/** Calls OpenRouter's OpenAI-compatible chat-completions endpoint, walking
 *  OPENROUTER_FREE_MODELS in order until one produces a response that
 *  passes `parse`. Throws only once every model in the list has failed. */
export async function callOpenRouterWithFallback<T>(args: OpenRouterCallArgs<T>): Promise<T> {
  const apiKey = getEnv().OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for OpenRouter adapters");

  let lastErr: unknown;
  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          // Attribution headers OpenRouter uses for its public app rankings —
          // optional, but good practice and harmless to include.
          "http-referer": "https://talscout.ai",
          "x-title": "TalScout",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: args.userContent },
          ],
          temperature: args.temperature,
          response_format: { type: "json_object" },
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        // 429 = this specific free model is rate-limited right now; other
        // 4xx/5xx = model unavailable/retired/errored. Either way, the next
        // model in the chain is a fresh, independent quota.
        logger.warn({ status: res.status, model }, "openrouter_model_non_ok_trying_next");
        lastErr = new Error(`OpenRouter ${model} returned HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        logger.warn({ model }, "openrouter_model_empty_response_trying_next");
        lastErr = new Error(`OpenRouter ${model} returned an empty response`);
        continue;
      }
      return args.parse(content);
    } catch (err) {
      logger.warn({ err, model }, "openrouter_model_failed_trying_next");
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All OpenRouter free models failed");
}

/** Open-weight free models are more prone than Gemini to wrapping JSON in
 *  markdown code fences or adding stray commentary despite `response_format:
 *  json_object` — strip a leading/trailing ```json fence before parsing. */
export function parseJsonLoosely<T>(raw: string): T {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(stripped) as T;
}
