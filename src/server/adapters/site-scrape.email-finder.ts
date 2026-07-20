import { fetchSiteHtml, normalizeUrl } from "@/server/lib/safe-fetch";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Free, always-available email discovery: reads a business's own website and
 * looks for a public contact email — `mailto:` links first (highest signal),
 * then a bounded regex scan of visible markup, falling back to a linked
 * Contact page if the homepage has nothing. Reuses the shared SSRF-safe
 * fetch (safe-fetch.ts). Primary link in the email-finder waterfall.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const GENERIC_LOCAL_PARTS = new Set(["example", "test", "noreply", "no-reply", "donotreply"]);
const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|svg|webp)$/i;

function isPlausibleEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (IMAGE_EXTENSION_RE.test(lower)) return false; // e.g. an image filename that happens to look email-shaped
  const localPart = lower.split("@")[0];
  if (GENERIC_LOCAL_PARTS.has(localPart)) return false;
  return true;
}

function extractMailtoEmails(html: string): string[] {
  const matches = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)];
  return matches.map((m) => decodeURIComponent(m[1])).filter(isPlausibleEmail);
}

function extractTextEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) ?? [];
  return matches.filter(isPlausibleEmail);
}

function findContactPageUrl(html: string, baseUrl: string): string | null {
  const linkMatches = [...html.matchAll(/href=["']([^"']+)["']/gi)];
  for (const m of linkMatches) {
    if (!/contact/i.test(m[1])) continue;
    try {
      return new URL(m[1], baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

export class SiteScrapeEmailFinder implements EmailFinder {
  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    if (!args.website) return null;
    const normalized = normalizeUrl(args.website);
    if (!normalized) return null;

    const homepageHtml = await fetchSiteHtml(normalized);
    if (!homepageHtml) return null;

    let email = extractMailtoEmails(homepageHtml)[0] ?? extractTextEmails(homepageHtml)[0] ?? null;

    if (!email) {
      const contactUrl = findContactPageUrl(homepageHtml, normalized);
      if (contactUrl) {
        const contactHtml = await fetchSiteHtml(contactUrl);
        if (contactHtml) {
          email = extractMailtoEmails(contactHtml)[0] ?? extractTextEmails(contactHtml)[0] ?? null;
        }
      }
    }

    if (!email) return null;
    return { email, source: "site_scrape" };
  }
}
