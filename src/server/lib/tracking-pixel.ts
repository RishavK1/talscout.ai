import { getEnv } from "@/server/config/env";

/**
 * Shared open-tracking pixel — one 1x1 transparent GIF served for both
 * Bulk Fire (`outreach_sends`) and Automated Outreach (`automated_sends`)
 * emails. The URL encodes which table to update (`kind`) plus the send's
 * own id (already an unguessable UUID — no separate token needed) so the
 * public route can record the open with zero tenant context, the same way
 * the WhatsApp delivery webhook has none.
 */
export type TrackingKind = "bf" | "ao";

const TRANSPARENT_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export const TRANSPARENT_GIF = Buffer.from(TRANSPARENT_GIF_BASE64, "base64");

export function buildOpenTrackingUrl(kind: TrackingKind, sendId: string): string {
  const env = getEnv();
  return `${env.APP_URL.replace(/\/$/, "")}/api/track/open/${kind}/${sendId}`;
}

/** Wraps plain-text email body as minimal HTML (paragraphs on blank lines,
 *  `<br>` on single newlines) plus an invisible tracking pixel at the end —
 *  used as the `text/html` alternative alongside the unmodified `text/plain`
 *  body, never as a replacement for it. */
export function buildTrackedHtmlBody(text: string, pixelUrl: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!DOCTYPE html><html><body>${paragraphs}<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" /></body></html>`;
}
