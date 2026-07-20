import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { domainFromWebsite } from "@/server/lib/safe-fetch";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Apollo.io free tier (50 credits/month, no card) — constructed only when
 * APOLLO_API_KEY is configured. Tried last in the waterfall: Apollo's core
 * product is finding a named PERSON's email gated behind per-contact credit
 * reveals, unlike Hunter's domain-wide harvest, so a business-level "any
 * contact for this domain" lookup is best-effort — many results come back
 * with the email locked/unrevealed on the free tier.
 */
const APOLLO_PEOPLE_SEARCH_ENDPOINT = "https://api.apollo.io/api/v1/mixed_people/search";

interface ApolloPerson {
  email?: string | null;
  email_status?: string;
}

export class ApolloEmailFinder implements EmailFinder {
  private apiKey: string;

  constructor() {
    const key = getEnv().APOLLO_API_KEY;
    if (!key) throw new Error("APOLLO_API_KEY is required for ApolloEmailFinder");
    this.apiKey = key;
  }

  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    const domain = domainFromWebsite(args.website);
    if (!domain) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(APOLLO_PEOPLE_SEARCH_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-api-key": this.apiKey },
        body: JSON.stringify({ q_organization_domains: domain, per_page: 5 }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "apollo_find_non_ok");
        return null;
      }
      const data = (await res.json()) as { people?: ApolloPerson[] };
      const withEmail = (data.people ?? []).find(
        (p) => p.email && p.email_status !== "locked" && !p.email.includes("not_unlocked"),
      );
      if (!withEmail?.email) return null;
      return { email: withEmail.email, source: "apollo" };
    } catch (err) {
      logger.warn({ err }, "apollo_find_failed");
      return null;
    }
  }
}
