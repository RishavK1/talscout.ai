/**
 * Shared email-extraction helpers for automated-outreach's email-finder
 * waterfall — used by any finder that scans raw HTML for a contact address
 * (site-scrape, firecrawl). Automated-outreach-only; never imported by
 * Bulk Fire code.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const GENERIC_LOCAL_PARTS = new Set(["example", "test", "noreply", "no-reply", "donotreply"]);
const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|svg|webp)$/i;

export function isPlausibleEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (IMAGE_EXTENSION_RE.test(lower)) return false; // e.g. an image filename that happens to look email-shaped
  const localPart = lower.split("@")[0];
  if (GENERIC_LOCAL_PARTS.has(localPart)) return false;
  return true;
}

export function extractMailtoEmails(html: string): string[] {
  const matches = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)];
  return matches.map((m) => decodeURIComponent(m[1])).filter(isPlausibleEmail);
}

export function extractTextEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) ?? [];
  return matches.filter(isPlausibleEmail);
}

export function findContactPageUrl(html: string, baseUrl: string): string | null {
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

/** A page listing named staff — "who is actually behind this business" is
 *  exactly where a real human's email (not a shared inbox) tends to live.
 *  Matched against a broad, language-agnostic set of common English link
 *  labels; a site with none of these simply yields no team-page candidate,
 *  same as any other free-source miss. */
export function findTeamPageUrl(html: string, baseUrl: string): string | null {
  const linkMatches = [...html.matchAll(/href=["']([^"']+)["']/gi)];
  for (const m of linkMatches) {
    if (!/team|leadership|staff|management|our-people|meet-the|about-us|\babout\b/i.test(m[1])) continue;
    try {
      return new URL(m[1], baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

/** Best email found in a page's markup: mailto links first (highest signal),
 *  then a bounded regex scan of visible text. */
export function bestEmailFromHtml(html: string): string | null {
  return extractMailtoEmails(html)[0] ?? extractTextEmails(html)[0] ?? null;
}

/** EVERY plausible email found in a page's markup, mailto and text scan
 *  combined, de-duped — unlike `bestEmailFromHtml`, which stops at the
 *  first hit. Used where the caller wants to rank several candidates against
 *  each other (see email-identity.ts's contact tiering) rather than
 *  blindly accepting whichever email happens to appear first in the HTML,
 *  which is very often a generic front-desk address, not a named person. */
export function allEmailsFromHtml(html: string): string[] {
  return [...new Set([...extractMailtoEmails(html), ...extractTextEmails(html)])];
}
