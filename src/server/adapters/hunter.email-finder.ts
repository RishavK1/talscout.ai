import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { domainFromWebsite } from "@/server/lib/safe-fetch";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Hunter.io free tier (50 credits/month, no card) domain-search email
 * finder — constructed only when HUNTER_API_KEY is configured. Second link
 * in the waterfall, tried after the free site-scrape.
 */
const HUNTER_ENDPOINT = "https://api.hunter.io/v2/domain-search";

interface HunterEmail {
  value: string;
  confidence?: number;
}

export class HunterEmailFinder implements EmailFinder {
  private apiKey: string;

  constructor() {
    const key = getEnv().HUNTER_API_KEY;
    if (!key) throw new Error("HUNTER_API_KEY is required for HunterEmailFinder");
    this.apiKey = key;
  }

  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    const domain = domainFromWebsite(args.website);
    if (!domain) return null;
    const params = new URLSearchParams({ domain, api_key: this.apiKey, limit: "5" });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${HUNTER_ENDPOINT}?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "hunter_find_non_ok");
        return null;
      }
      const data = (await res.json()) as { data?: { emails?: HunterEmail[] } };
      const emails = data.data?.emails ?? [];
      if (emails.length === 0) return null;
      const best = [...emails].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      return { email: best.value, source: "hunter", confidence: best.confidence };
    } catch (err) {
      logger.warn({ err }, "hunter_find_failed");
      return null;
    }
  }
}
