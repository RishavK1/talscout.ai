import { getEnv } from "@/server/config/env";

/**
 * The public, unauthenticated unsubscribe link embedded in every automated-
 * outreach email — both as the plain-text footer line (signEmail in
 * run-automated-campaign.ts) and as the RFC 8058 List-Unsubscribe/
 * List-Unsubscribe-Post headers (send-automated-email.ts). Keyed on `leadId`
 * rather than the individual send: the lead row already exists at copy-
 * generation time (well before a send row's own id would), and "unsubscribe
 * this LEAD" is the semantically correct scope anyway — the suppression it
 * creates is per (tenant, email), not per send. See the route itself:
 * src/app/api/automated-campaigns/unsubscribe/[leadId]/route.ts (same
 * top-level namespace every other automated-outreach API route already
 * uses — not a new "automated-outreach" prefix).
 *
 * `leadId` is an unguessable UUID and thus doubles as the capability token —
 * same pattern as the public tracking-pixel route
 * (/api/track/open/[kind]/[id]), no separate signed token needed.
 */
export function buildUnsubscribeUrl(leadId: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}/api/automated-campaigns/unsubscribe/${leadId}`;
}
