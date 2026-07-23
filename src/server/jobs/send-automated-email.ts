import { withTenantTx } from "@/server/db/tx";
import {
  automatedCampaignRepo,
  automatedLeadRepo,
  automatedSendRepo,
} from "@/server/repositories/automated-outreach.repo";
import { senderAccountRepo } from "@/server/repositories/outreach.repo";
import { toCredentials, generateMessageId } from "@/server/lib/automated-mail-credentials";
import { buildOpenTrackingUrl } from "@/server/lib/tracking-pixel";
import { logger } from "@/server/observability/logger";
import type {
  Services,
  SenderAccountCredentials,
  OutreachSendArgs,
  OutreachSendResult,
} from "@/server/ports";

export interface SendAutomatedEmailPayload {
  tenantId: string;
  sendId: string;
}

// Same transient-vs-permanent classification as send-outreach-email.ts, kept
// as an independent copy — this file must never import from a
// bulk-fire-owned job file.
const TRANSIENT_NODEMAILER_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKET",
  "ECONNECTION",
  "ECONNRESET",
  "EDNS",
]);

function isTransientSendError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: string | number }).code;
  if (typeof code === "string" && TRANSIENT_NODEMAILER_CODES.has(code)) return true;
  const status =
    (e as { status?: number }).status ?? (e as { responseCode?: number }).responseCode;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  return false;
}

async function sendWithRetry(
  mailer: Services["outreachMailer"],
  creds: SenderAccountCredentials,
  message: OutreachSendArgs,
): Promise<OutreachSendResult> {
  const backoffMs = [0, 1000, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt]) await new Promise((r) => setTimeout(r, backoffMs[attempt]));
    try {
      return await mailer.send(creds, message);
    } catch (e) {
      lastErr = e;
      if (!isTransientSendError(e)) throw e;
      logger.warn({ err: e, attempt: attempt + 1 }, "automated_send_transient_failure_retrying");
    }
  }
  throw lastErr;
}

/**
 * Sends one scheduled `automated_sends` row. Triggered by the Inngest
 * function in src/app/api/inngest/route.ts only after `step.sleepUntil`
 * durably waits out the row's own staggered `scheduledAt` — the pacing
 * mechanism that keeps a mailbox looking human-paced instead of firing a
 * whole batch in the same minute (same block+jitter algorithm Bulk Fire
 * uses — see scheduleSends in server/lib/spintax.ts).
 *
 * Re-checks the campaign's status on every run, not just at schedule time —
 * pausing a campaign after sends are already queued must still stop them
 * from going out; this mirrors send-outreach-email.ts's Pause/Stop check.
 */
export async function sendAutomatedEmail(
  payload: SendAutomatedEmailPayload,
  services: Services,
): Promise<void> {
  const { tenantId, sendId } = payload;

  const snapshot = await withTenantTx({ tenantId }, async (ctx) => {
    const send = await automatedSendRepo.getById(ctx, sendId);
    if (!send) return null;
    const [lead, campaign] = await Promise.all([
      automatedLeadRepo.getById(ctx, send.leadId),
      automatedCampaignRepo.getById(ctx, send.campaignId),
    ]);
    const sender = campaign
      ? await senderAccountRepo.getById(ctx, campaign.senderAccountId)
      : null;
    return { send, lead, campaign, sender };
  });

  if (!snapshot) return; // send deleted mid-flight
  const { send, lead, campaign, sender } = snapshot;
  if (send.status !== "scheduled") return; // idempotent — already processed

  if (!campaign || campaign.status !== "active") {
    await withTenantTx({ tenantId }, (ctx) =>
      automatedSendRepo.markSkipped(ctx, sendId, "campaign_not_active"),
    );
    return;
  }

  if (!lead || !lead.email) {
    await withTenantTx({ tenantId }, async (ctx) => {
      await automatedSendRepo.markSkipped(ctx, sendId, "lead_missing_email");
      if (lead) await automatedLeadRepo.setStatus(ctx, lead.id, "skipped");
    });
    return;
  }

  if (!sender || sender.deletedAt || !sender.isActive) {
    await withTenantTx({ tenantId }, (ctx) =>
      automatedSendRepo.markSkipped(ctx, sendId, "sender_unavailable"),
    );
    return;
  }

  // Follow-up steps (Day 3/Day 7) reply INTO the Day 0 thread — never a
  // fresh mail. Requires the Day 0 send to (a) exist, (b) have gone out
  // successfully, and (c) carry its threading anchors — same "same thread
  // or nothing" rule Bulk Fire's send job uses (send-outreach-email.ts).
  let anchor: { rfc822MessageId: string; gmailThreadId: string | null; sentSubject: string | null } | null =
    null;
  if (send.stepIndex > 0) {
    const day0 = await withTenantTx({ tenantId }, (ctx) =>
      automatedSendRepo.getByLeadAndStep(ctx, send.campaignId, lead.id, 0),
    );
    if (!day0 || day0.status !== "sent" || !day0.rfc822MessageId) {
      await withTenantTx({ tenantId }, (ctx) => automatedSendRepo.markSkipped(ctx, sendId, "day0_not_sent"));
      return;
    }
    anchor = {
      rfc822MessageId: day0.rfc822MessageId,
      gmailThreadId: day0.gmailThreadId,
      sentSubject: day0.sentSubject,
    };
  }

  let errorReason: string | null = null;
  let sendResult: OutreachSendResult | null = null;
  let messageId: string | null = null;
  let sentSubject: string | null = null;
  try {
    const creds = toCredentials(sender);

    // Reply-stop: if the lead already replied in the Day 0 thread, a
    // scheduled follow-up would read as tone-deaf spam — skip it. Only a
    // definite "replied" stops the send; "unknown" (SMTP, send-only Gmail
    // token, transient API error) fails open and sends anyway.
    if (anchor?.gmailThreadId) {
      const replyState = await services.outreachMailer.threadHasReply(creds, {
        gmailThreadId: anchor.gmailThreadId,
        senderEmail: sender.email,
      });
      if (replyState === "replied") {
        await withTenantTx({ tenantId }, (ctx) => automatedSendRepo.markSkipped(ctx, sendId, "lead_replied"));
        return;
      }
    }

    // Follow-ups reuse the subject that actually went out on Day 0 (as
    // "Re: …") — Gmail requires the subject to match the thread's, and the
    // AI-drafted subject for this step may differ slightly.
    const subject = anchor
      ? `Re: ${(anchor.sentSubject ?? send.subject).replace(/^(Re:\s*)+/i, "")}`
      : send.subject;
    messageId = generateMessageId(sender.email);
    sentSubject = subject;
    sendResult = await sendWithRetry(services.outreachMailer, creds, {
      from: sender.email,
      fromName: sender.fromName ?? undefined,
      to: lead.email,
      subject,
      text: send.body,
      replyTo: sender.email,
      messageId,
      inReplyTo: anchor?.rfc822MessageId ?? undefined,
      gmailThreadId: anchor?.gmailThreadId ?? undefined,
      trackingPixelUrl: buildOpenTrackingUrl("ao", sendId),
    });
  } catch (e) {
    errorReason = e instanceof Error ? e.message : "send_failed";
  }

  await withTenantTx({ tenantId }, async (ctx) => {
    if (errorReason) {
      await automatedSendRepo.markFailed(ctx, sendId, errorReason);
      await automatedLeadRepo.setStatus(ctx, lead.id, "failed");
    } else {
      await automatedSendRepo.markSent(ctx, sendId, {
        sentAt: new Date(),
        rfc822MessageId: messageId as string,
        // A follow-up stays in the Day 0 thread; a Day 0 send records the
        // thread Gmail just created (SMTP sends have none — header-only
        // threading applies there).
        gmailThreadId: anchor?.gmailThreadId ?? sendResult?.gmailThreadId ?? undefined,
        sentSubject: sentSubject as string,
      });
      await automatedLeadRepo.setStatus(ctx, lead.id, "sent");
    }
  });
}

export const SEND_AUTOMATED_EMAIL_JOB = "sendAutomatedEmail";
