import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import type { WebResearcher } from "@/server/ports";

/**
 * Real-time web research via Perplexity's Sonar models — called by
 * blueprintService.generate() (see blueprint.service.ts) to ground the
 * blueprint in more than a single scraped page: recent news, reviews,
 * reputation signals, competitive context. Output is fed into the
 * Gemini/OpenRouter blueprint generator as an untrusted <web_research> block
 * (see gemini.blueprint.ts), never used to write the blueprint directly —
 * Perplexity supplies raw grounded material, the structuring model still
 * owns turning it into BlueprintSections.
 *
 * Deliberately called ONCE per blueprint generate() call, not per-lead or
 * per-email — Sonar is a metered API, unlike every other adapter in this
 * pipeline, so this is the one place in the system sized to its actual
 * (rare, high-leverage) call frequency.
 */

const SYSTEM_PROMPT =
  "You are a business research analyst with real-time web search. Research " +
  "the given company and summarize: what they actually do, any recent news " +
  "or announcements, customer reviews/reputation signals, notable proof " +
  "points or credibility markers, and relevant competitive context. Be " +
  "strictly factual — report only what search results actually show, and " +
  "say so plainly if you find little to nothing. Never invent details. " +
  "Keep the summary under 300 words.";

export class PerplexityWebResearcher implements WebResearcher {
  async research(args: { businessName: string; websiteUrl?: string }): Promise<string | null> {
    const key = getEnv().PERPLEXITY_API_KEY;
    if (!key) return null;

    const query = args.websiteUrl
      ? `${args.businessName} (${args.websiteUrl})`
      : args.businessName;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Research this business: ${query}` },
          ],
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "perplexity_web_research_failed");
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      return typeof text === "string" && text.trim() ? text.trim() : null;
    } catch (err) {
      logger.warn({ err }, "perplexity_web_research_errored");
      return null;
    }
  }
}
