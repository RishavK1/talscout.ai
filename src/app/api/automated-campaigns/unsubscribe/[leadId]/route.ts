import { NextResponse } from "next/server";
import { automatedLeadRepo, suppressedEmailRepo } from "@/server/repositories/automated-outreach.repo";
import { logger } from "@/server/observability/logger";

/**
 * GET/POST /api/automated-campaigns/unsubscribe/[leadId] — the public,
 * unauthenticated unsubscribe link embedded in every automated-outreach
 * email (see lib/unsubscribe-url.ts). No session, no tenant header — same
 * "arrives with zero auth context" shape as the public tracking-pixel route
 * (src/app/api/track/open/[kind]/[id]/route.ts), which this deliberately
 * mirrors: bypasses withAuth/withPublic entirely, `leadId` (an unguessable
 * UUID) is the capability token, and an unknown/malformed id is treated
 * exactly like success rather than leaking whether it exists.
 *
 * Two verbs for the two ways this gets hit:
 *  - GET: a human clicking the visible footer link in their mail client —
 *    returns a small confirmation page.
 *  - POST: Gmail/Yahoo's RFC 8058 one-click unsubscribe — the mailbox
 *    provider POSTs here directly with no user-visible page; must respond
 *    fast with no meaningful body. See List-Unsubscribe-Post's doc comment
 *    in outreach.mailer.ts for the header pairing that triggers this.
 *
 * Suppression is added at the TENANT level (see schema.ts's suppressedEmails
 * doc comment) — this one click stops every campaign in the workspace from
 * ever emailing this address again, not just the one that sent this email.
 */

async function unsubscribe(leadId: string): Promise<void> {
  try {
    const lead = await automatedLeadRepo.getByIdAdmin(leadId);
    if (!lead || !lead.email) return; // unknown/malformed id — nothing to do, not an error
    await suppressedEmailRepo.addAdmin(lead.tenantId, lead.email, "unsubscribed via email link");
    await automatedLeadRepo.setStatusAdmin(leadId, "suppressed");
  } catch (err) {
    // Never let an unsubscribe request fail loudly — worst case it's
    // retried by the mail client, and a failed suppression insert must not
    // surface as a broken link to a real person trying to opt out.
    logger.warn({ err, leadId }, "automated_outreach_unsubscribe_failed");
  }
}

const CONFIRMATION_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem; color: #1a1a1a;">
  <h1 style="font-size: 1.25rem;">You've been unsubscribed</h1>
  <p>You won't receive any further emails from us. This may take a few minutes to fully take effect.</p>
</body>
</html>`;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leadId: string }> },
): Promise<Response> {
  const { leadId } = await params;
  await unsubscribe(leadId);
  return new NextResponse(CONFIRMATION_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leadId: string }> },
): Promise<Response> {
  const { leadId } = await params;
  await unsubscribe(leadId);
  return new NextResponse(null, { status: 200 });
}
