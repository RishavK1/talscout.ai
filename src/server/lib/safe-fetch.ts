import { logger } from "@/server/observability/logger";

/**
 * SSRF-safe outbound website fetch, shared by any adapter that reads a
 * user-supplied URL (Blueprint website research, automated-outreach email
 * scraping). Extracted from gemini.blueprint.ts — pure refactor, no behavior
 * change; only http/https absolute URLs, blocks obvious internal hosts,
 * bounded read + timeout.
 */

/** Only http/https absolute URLs — blocks file:, data:, and (best-effort)
 *  obvious internal hosts to reduce SSRF surface on a user-supplied URL. */
export function normalizeUrl(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return null;
  }
  return u.toString();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch a webpage and strip to plain-ish text. Free (no scraper). Bounded
 *  to ~60k chars like the resume extractor. Returns "" on failure so callers
 *  can degrade gracefully rather than hard-failing. */
export async function fetchSiteText(url: string): Promise<string> {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(normalized, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; TalScoutBot/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const html = await res.text();
    return htmlToText(html).slice(0, 60_000);
  } catch (err) {
    logger.warn({ err, url: normalized }, "safe_fetch_site_text_failed");
    return "";
  }
}

/** Extract a bare hostname (no "www.", no scheme) from a website URL, for
 *  callers that need a domain for a domain-based lookup (Hunter/Apollo).
 *  Returns null for an unparseable/unsafe URL. */
export function domainFromWebsite(website: string | undefined): string | null {
  if (!website) return null;
  const normalized = normalizeUrl(website);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Fetch a webpage's RAW html (not stripped to text), for callers that need
 *  to inspect markup directly (e.g. `mailto:` link extraction). Same
 *  SSRF/timeout/size discipline as fetchSiteText. Returns "" on failure. */
export async function fetchSiteHtml(url: string): Promise<string> {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(normalized, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; TalScoutBot/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const html = await res.text();
    return html.slice(0, 300_000);
  } catch (err) {
    logger.warn({ err, url: normalized }, "safe_fetch_site_html_failed");
    return "";
  }
}
