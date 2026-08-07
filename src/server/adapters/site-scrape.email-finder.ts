import { fetchSiteHtml, normalizeUrl } from "@/server/lib/safe-fetch";
import { allEmailsFromHtml, findContactPageUrl, findTeamPageUrl } from "@/server/lib/email-extract";
import { assessContact, CONTACT_TIER_RANK } from "@/server/lib/email-identity";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Free, always-available email discovery: reads a business's own website and
 * looks for a public contact email. Reuses the shared SSRF-safe fetch
 * (safe-fetch.ts). Primary link in the email-finder waterfall.
 *
 * Collects candidates from the homepage, a linked team/leadership/about page,
 * AND a linked contact page (up to 3 fetches total — still free, still
 * bounded), then picks the BEST by contact tier (see email-identity.ts) —
 * NOT simply the first email that happens to appear in the markup. A
 * homepage's first mailto is very often a shared front-desk address; a
 * team/leadership page is where a named individual's own email tends to
 * live, and this now actively looks there rather than settling for whatever
 * came first.
 */

export class SiteScrapeEmailFinder implements EmailFinder {
  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    if (!args.website) return null;
    const normalized = normalizeUrl(args.website);
    if (!normalized) return null;

    const homepageHtml = await fetchSiteHtml(normalized);
    if (!homepageHtml) return null;

    const candidates = new Set(allEmailsFromHtml(homepageHtml));

    const teamUrl = findTeamPageUrl(homepageHtml, normalized);
    if (teamUrl) {
      const teamHtml = await fetchSiteHtml(teamUrl);
      if (teamHtml) for (const e of allEmailsFromHtml(teamHtml)) candidates.add(e);
    }

    const contactUrl = findContactPageUrl(homepageHtml, normalized);
    if (contactUrl) {
      const contactHtml = await fetchSiteHtml(contactUrl);
      if (contactHtml) for (const e of allEmailsFromHtml(contactHtml)) candidates.add(e);
    }

    if (candidates.size === 0) return null;

    let best: string | null = null;
    let bestRank = 0;
    for (const email of candidates) {
      const assessment = assessContact({ email, businessName: args.businessName, website: args.website });
      if (assessment.tier === "reject") continue;
      const rank = CONTACT_TIER_RANK[assessment.tier];
      if (rank > bestRank) {
        best = email;
        bestRank = rank;
      }
    }
    if (!best) return null;
    return { email: best, source: "site_scrape" };
  }
}
