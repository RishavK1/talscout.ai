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
const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

/** OpenRouter's free-model catalog turns over completely every few months
 *  (the previous hardcoded list — llama-3.3, deepseek-chat, qwen-2.5,
 *  gemma-2-9b, mistral-7b, hermes-3, phi-3-mini — went 100% HTTP 404 without
 *  any signal, silently taking down every AI feature the moment Gemini's
 *  free daily quota ran out). Rather than re-hardcode a list that will just
 *  go stale the same way, the free-model list is fetched live from
 *  OpenRouter on each cold start and cached for a few hours — this list is
 *  ONLY the last-resort safety net for when that live fetch itself fails
 *  (network error, OpenRouter outage), verified working as of this
 *  writing. */
const STATIC_FALLBACK_FREE_MODELS = [
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

/** Model ids that ARE genuinely `:free` on OpenRouter but aren't
 *  general-purpose chat models — a moderation-only classifier would fail
 *  every real call, so it's excluded from the live-fetched list up front
 *  rather than burning a fallback slot discovering that at runtime. */
const EXCLUDED_FREE_MODEL_SUBSTRINGS = ["content-safety"];

let cachedFreeModels: { models: string[]; fetchedAt: number } | null = null;
const MODEL_LIST_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Live free-model list, cached in-process. Falls back to the static list
 *  above only if the live fetch itself fails — so a stale/retired model in
 *  OpenRouter's catalog is caught automatically instead of requiring a code
 *  change every time their free tier lineup changes. */
async function getFreeModels(apiKey: string): Promise<string[]> {
  if (cachedFreeModels && Date.now() - cachedFreeModels.fetchedAt < MODEL_LIST_CACHE_MS) {
    return cachedFreeModels.models;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}` },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OpenRouter models list returned HTTP ${res.status}`);
    const data = (await res.json()) as { data?: { id: string }[] };
    const live = (data.data ?? [])
      .map((m) => m.id)
      .filter(
        (id) => id.endsWith(":free") && !EXCLUDED_FREE_MODEL_SUBSTRINGS.some((s) => id.includes(s)),
      );
    if (live.length === 0) throw new Error("OpenRouter live catalog has no usable free models");
    cachedFreeModels = { models: live, fetchedAt: Date.now() };
    return live;
  } catch (err) {
    logger.warn({ err }, "openrouter_live_model_list_failed_using_static_fallback");
    return STATIC_FALLBACK_FREE_MODELS;
  }
}

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
 *  the live (or static-fallback) free-model list in order until one
 *  produces a response that passes `parse`. Throws only once every model in
 *  the list has failed. */
export async function callOpenRouterWithFallback<T>(args: OpenRouterCallArgs<T>): Promise<T> {
  const apiKey = getEnv().OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for OpenRouter adapters");

  const models = await getFreeModels(apiKey);
  let lastErr: unknown;
  for (const model of models) {
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
