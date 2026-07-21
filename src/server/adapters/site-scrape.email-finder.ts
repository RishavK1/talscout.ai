import { fetchSiteHtml, normalizeUrl } from "@/server/lib/safe-fetch";
import { bestEmailFromHtml, findContactPageUrl } from "@/server/lib/email-extract";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Free, always-available email discovery: reads a business's own website and
 * looks for a public contact email — `mailto:` links first (highest signal),
 * then a bounded regex scan of visible markup, falling back to a linked
 * Contact page if the homepage has nothing. Reuses the shared SSRF-safe
 * fetch (safe-fetch.ts). Primary link in the email-finder waterfall.
 */

export class SiteScrapeEmailFinder implements EmailFinder {
  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    if (!args.website) return null;
    const normalized = normalizeUrl(args.website);
    if (!normalized) return null;

    const homepageHtml = await fetchSiteHtml(normalized);
    if (!homepageHtml) return null;

    let email = bestEmailFromHtml(homepageHtml);

    if (!email) {
      const contactUrl = findContactPageUrl(homepageHtml, normalized);
      if (contactUrl) {
        const contactHtml = await fetchSiteHtml(contactUrl);
        if (contactHtml) email = bestEmailFromHtml(contactHtml);
      }
    }

    if (!email) return null;
    return { email, source: "site_scrape" };
  }
}
