import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import type { MarketResearcher } from "@/server/ports";

/**
 * Real-time market research via Perplexity's Sonar models — powers the
 * automated-outreach campaign wizard's Research step. Distinct from
 * perplexity.blueprint.ts/perplexity.lead-qualifier.ts (which use the
 * separate PERPLEXITY_API_KEY_PRIMARY budget for structured-output
 * generation): this researches a MARKET SEGMENT (category + location), the
 * same real-time-search job as perplexity.web-researcher.ts, so it shares
 * that feature's key/budget (PERPLEXITY_API_KEY).
 *
 * Called ONCE per wizard research click, never per-lead/per-email — the
 * result is persisted on the campaign and reused for every generated email
 * (see OutreachCopyRequest.marketResearch).
 */

const SYSTEM_PROMPT =
  "You are a market-research analyst helping a business plan cold outreach. " +
  "Given a business category and a location, research: how competitive/" +
  "saturated this segment is in that specific area, what these businesses " +
  "typically look like online (do they usually have websites? are they " +
  "active on social/Google listings?), common pain points or gaps a vendor " +
  "could credibly speak to, and any locally-relevant context (regulations, " +
  "seasonality, notable local players) that would make an email sound like " +
  "it was written by someone who actually knows this market. Be strictly " +
  "factual — report only what search results actually show, and say so " +
  "plainly if you find little. Never invent details. Keep it under 250 words.";

export class PerplexityMarketResearcher implements MarketResearcher {
  async research(args: {
    category: string;
    location: string;
    whatWeOffer?: string;
    whoItsFor?: string;
  }): Promise<string | null> {
    const key = getEnv().PERPLEXITY_API_KEY;
    if (!key) return null;

    const context =
      `Business category: ${args.category}\nLocation: ${args.location}` +
      (args.whatWeOffer ? `\nWhat the outreach sender offers: ${args.whatWeOffer}` : "") +
      (args.whoItsFor ? `\nWho they typically sell to: ${args.whoItsFor}` : "");

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
            { role: "user", content: context },
          ],
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "perplexity_market_research_failed");
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      return typeof text === "string" && text.trim() ? text.trim() : null;
    } catch (err) {
      logger.warn({ err }, "perplexity_market_research_errored");
      return null;
    }
  }
}
