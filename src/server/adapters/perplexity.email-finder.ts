import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { isPlausibleEmail } from "@/server/lib/email-extract";
import { parseJsonLoosely } from "@/server/adapters/openrouter.client";
import type { EmailFinder, EmailFinderResult, RateLimiter } from "@/server/ports";

/**
 * Last rung in the waterfall — the only one able to search *beyond* the
 * business's own website (SiteScrape/Firecrawl only read the business's own
 * domain; Hunter/Snov/Apollo query their own datasets). Uses
 * PERPLEXITY_API_KEY (the "real-time web search" budget). WaterfallEmailFinder
 * now continues PAST a merely-generic (info@/contact@) find rather than
 * stopping at the first hit, so this rung is reached not just on a total
 * miss but whenever nothing better than a shared inbox has been found yet —
 * its job is specifically to try to find the actual named person or
 * decision-maker (founder, owner, principal, HR) upstream sources couldn't.
 *
 * Never throws (matches EmailFinder's hard contract) — a null result here
 * becomes the lead's final "no_email" status (or, if a generic address was
 * already found upstream, that generic address is what gets used).
 */

const CHAT_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const GLOBAL_WINDOW_SECONDS = 21_600; // 6h, matches the campaign cron cadence
const GLOBAL_BUDGET = 400;
const PER_CAMPAIGN_BUDGET = 20;

const SYSTEM_PROMPT =
  "You are helping find the email of a REAL, NAMED person at a specific " +
  "business — the founder, owner, principal, director, or a clear " +
  "decision-maker role (HR, admissions, management) — NOT a generic " +
  "shared inbox. Search the live web: the business's own site (About/Team/" +
  "Leadership/Staff pages), LinkedIn, Google Business/Maps listing, and " +
  "business directories. Strongly prefer a named individual's own email " +
  "over info@/contact@/hello@-style addresses — only fall back to a " +
  "generic business email if you can find no named person or " +
  "decision-maker role at all. Only return an email you have genuine " +
  "search evidence belongs to THIS exact business — never guess or " +
  "construct one from a name/domain pattern, and never return an email " +
  "belonging to a different organization (even a similarly-named one) or " +
  "a private individual with no connection to this business. If you " +
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

      // emailConfidence is an integer column, 0-100 scale (matching Hunter's
      // convention — see automated_leads.email_confidence) — the model is
      // prompted for a 0-1 score, so it must be rescaled here. Passing the
      // raw 0-1 float through was a real production bug: the INSERT/UPDATE
      // failed outright ("invalid input syntax for type integer"), which
      // flipped the whole campaign to "error" on its very first enriched
      // lead.
      const confidence =
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(100, Math.round(parsed.confidence * 100)))
          : undefined;
      return { email, source: "perplexity", confidence };
    } catch (err) {
      logger.warn({ err }, "perplexity_email_finder_failed");
      return null;
    }
  }
}
