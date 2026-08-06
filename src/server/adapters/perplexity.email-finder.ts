import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { isPlausibleEmail } from "@/server/lib/email-extract";
import { parseJsonLoosely } from "@/server/adapters/openrouter.client";
import type { EmailFinder, EmailFinderResult, RateLimiter } from "@/server/ports";

/**
 * Last-resort email finder: the only rung in the waterfall able to search
 * *beyond* the business's own website (SiteScrape/Firecrawl only read the
 * business's own domain; Hunter/Snov/Apollo query their own datasets). Uses
 * PERPLEXITY_API_KEY (the "real-time web search" budget). Appended as the
 * LAST entry in the waterfall — see container.ts — so it only ever runs
 * after every free rung has already missed.
 *
 * Never throws (matches EmailFinder's hard contract) — a null result here
 * becomes the lead's final "no_email" status.
 */

const CHAT_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const GLOBAL_WINDOW_SECONDS = 21_600; // 6h, matches the campaign cron cadence
const GLOBAL_BUDGET = 400;
const PER_CAMPAIGN_BUDGET = 20;

const SYSTEM_PROMPT =
  "You are helping find a real, currently-valid public contact email for a " +
  "specific business, by searching the live web (their own site if given, " +
  "Google Business/Maps listing, business directories, social profiles). " +
  "Only return an email you have genuine search evidence belongs to this " +
  "exact business — never guess or construct one from a pattern. If you " +
  "can't find one with real evidence, say so.\n\n" +
  'Respond with ONLY a JSON object: {"email": "..." or null, "confidence": ' +
  "0 to 1}. No prose outside the JSON.";

export class PerplexityEmailFinder implements EmailFinder {
  constructor(private limiter: RateLimiter) {}

  async find(args: {
    website?: string;
    businessName: string;
    budgetScopeId?: string;
  }): Promise<EmailFinderResult | null> {
    const key = getEnv().PERPLEXITY_API_KEY;
    if (!key) return null;

    const global = await this.limiter.limit(
      "ai-email-finder:tick",
      GLOBAL_BUDGET,
      GLOBAL_WINDOW_SECONDS,
    );
    if (!global.success) {
      logger.warn({}, "perplexity_email_finder_global_budget_exhausted");
      return null;
    }
    if (args.budgetScopeId) {
      const perCampaign = await this.limiter.limit(
        `ai-email-finder:tick:${args.budgetScopeId}`,
        PER_CAMPAIGN_BUDGET,
        GLOBAL_WINDOW_SECONDS,
      );
      if (!perCampaign.success) {
        logger.warn({}, "perplexity_email_finder_campaign_budget_exhausted");
        return null;
      }
    }

    const context =
      `Business name: ${args.businessName}` + (args.website ? `\nWebsite: ${args.website}` : "");

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          temperature: 0.1,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: context },
          ],
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "perplexity_email_finder_non_ok");
        return null;
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = parseJsonLoosely<{ email?: unknown; confidence?: unknown }>(content);
      if (typeof parsed.email !== "string" || !parsed.email.trim()) return null;
      const email = parsed.email.trim();
      if (!isPlausibleEmail(email)) return null;

      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : undefined;
      return { email, source: "perplexity", confidence };
    } catch (err) {
      logger.warn({ err }, "perplexity_email_finder_failed");
      return null;
    }
  }
}
