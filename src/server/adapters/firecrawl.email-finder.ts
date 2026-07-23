import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { normalizeUrl } from "@/server/lib/safe-fetch";
import { bestEmailFromHtml } from "@/server/lib/email-extract";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Firecrawl free tier (1,000 credits/month, no card) — constructed only when
 * FIRECRAWL_API_KEY is configured. Sits right after SiteScrapeEmailFinder in
 * the waterfall: same "read the business's own website" idea, but Firecrawl
 * renders JS before returning HTML, catching contact emails that only
 * appear after client-side rendering (our own plain fetch never executes
 * JS). Still free-forever, still email-required — a miss here just falls
 * through to Hunter/Snov/Apollo like any other rung.
 */
const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: { html?: string };
}

export class FirecrawlEmailFinder implements EmailFinder {
  private apiKey: string;

  constructor() {
    const key = getEnv().FIRECRAWL_API_KEY;
    if (!key) throw new Error("FIRECRAWL_API_KEY is required for FirecrawlEmailFinder");
    this.apiKey = key;
  }

  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    if (!args.website) return null;
    const normalized = normalizeUrl(args.website);
    if (!normalized) return null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const res = await fetch(FIRECRAWL_SCRAPE_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ url: normalized, formats: ["html"] }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "firecrawl_find_non_ok");
        return null;
      }
      const data = (await res.json()) as FirecrawlScrapeResponse;
      const html = data.data?.html;
      if (!html) return null;
      const email = bestEmailFromHtml(html);
      if (!email) return null;
      return { email, source: "firecrawl" };
    } catch (err) {
      logger.warn({ err }, "firecrawl_find_failed");
      return null;
    }
  }
}
