import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";

/**
 * Shared Perplexity Sonar calling helper for the primary-tier AI-writing
 * ports (blueprint research/generation, lead qualification) — see
 * container.ts, where this is wired as the FIRST tier, ahead of Gemini and
 * OpenRouter (see fallback-ai.ts). Distinct from perplexity.web-researcher.ts
 * (PERPLEXITY_API_KEY), which stays a separate, always-on real-time-search
 * feature on its own key/budget; this helper uses PERPLEXITY_API_KEY_PRIMARY,
 * a second, metered account explicitly designated to front these ports.
 *
 * Sonar models are search-grounded chat-completions, still fully usable as a
 * general structured-output JSON generator — same discipline as the Gemini/
 * OpenRouter adapters it fronts: untrusted input stays untrusted, low
 * temperature, and a same-provider model-fallback (sonar-pro → sonar) before
 * ever escalating to the next provider tier.
 */

const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const PRIMARY_MODEL = "sonar-pro";
const FALLBACK_MODEL = "sonar";

export interface PerplexityCallArgs<T> {
  systemPrompt: string;
  userContent: string;
  temperature: number;
  /** Parse + validate the raw text content into the expected shape. Throw to
   *  reject a response (malformed JSON, missing required fields) — treated
   *  exactly like an HTTP-level failure, triggering the same-provider model
   *  fallback. */
  parse: (raw: string) => T;
}

async function callModel<T>(model: string, apiKey: string, args: PerplexityCallArgs<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(PERPLEXITY_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: args.temperature,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userContent },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Perplexity ${model} returned HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`Perplexity ${model} returned an empty response`);
    return args.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

/** Calls Perplexity's OpenAI-compatible chat-completions endpoint via
 *  sonar-pro, retrying once against the lighter `sonar` model on any failure
 *  (HTTP error, empty response, or a `parse` rejection) before throwing. */
export async function callPerplexityWithFallback<T>(args: PerplexityCallArgs<T>): Promise<T> {
  const apiKey = getEnv().PERPLEXITY_API_KEY_PRIMARY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY_PRIMARY is required for Perplexity-primary adapters");

  try {
    return await callModel(PRIMARY_MODEL, apiKey, args);
  } catch (err) {
    logger.warn({ err }, "perplexity_primary_model_failed_retrying_fallback_model");
    return callModel(FALLBACK_MODEL, apiKey, args);
  }
}
