import { withTenantTx } from "@/server/db/tx";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
  type SequenceStep,
} from "@/server/repositories/outreach.repo";
import {
  getOutreachTemplates,
  resolveSpintaxAndPlaceholders,
  type SequenceStepKey,
} from "@/server/lib/spintax";
import { decryptSecret } from "@/server/lib/secret-box";
import { logger } from "@/server/observability/logger";
import type {
  Services,
  SenderAccountCredentials,
  OutreachSendArgs,
  OutreachSendResult,
} from "@/server/ports";
import type { senderAccounts } from "@/server/db/schema";

export interface SendOutreachEmailPayload {
  tenantId: string;
  sendId: string;
}

const STEP_KEYS: SequenceStepKey[] = ["day0", "day3", "day7"];

interface Template {
  subject: string;
  body: string;
}

/** A lead's own docx-embedded copy wins; `campaign.sequence` is the fallback
 *  for leads that don't carry one (e.g. manually added, not docx-imported). */
function resolveTemplate(
  notes: string | null,
  sequence: unknown,
  stepIndex: number,
): Template | null {
  const stepKey = STEP_KEYS[stepIndex];
  const leadTemplates = stepKey ? getOutreachTemplates(notes) : null;
  const own = stepKey ? leadTemplates?.[stepKey] : undefined;
  if (own?.body) return own;

  const steps = Array.isArray(sequence) ? (sequence as SequenceStep[]) : [];
  const fallback = steps.find((s) => s.stepIndex === stepIndex);
  if (fallback?.bodyTemplate) {
    return { subject: fallback.subjectTemplate, body: fallback.bodyTemplate };
  }
  return null;
}

// A one-off network blip (SMTP connection reset, DNS hiccup, transient 4xx
// from Gmail's API) shouldn't cost a lead its one shot at this sequence
// step — permanently marking the send/lead "failed" for something that
// would have succeeded on the next attempt. Nodemailer tags these with a
// `code` (ETIMEDOUT/ESOCKET/ECONNECTION/ECONNRESET); the Gmail API client
// (googleapis/gaxios) surfaces a `code`/`status` that's a 429 or 5xx for the
// equivalent "try again" cases. Anything else (bad credentials, invalid
// recipient, 4xx other than 429) is permanent — retrying it would just waste
// three send attempts arriving at the same failure.
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
  if (typeof code === "string" && TRANSIENT_NODEMAILER_CODES.has(code)) {
    return true;
  }
  const status =
    (e as { status?: number }).status ??
    (e as { responseCode?: number }).responseCode;
  if (typeof status === "number" && (status === 429 || status >= 500)) {
    return true;
  }
  return false;
}

/** Up to 3 attempts total, with a short backoff between — bounded so one
 *  stubborn transient failure can't stall a send job indefinitely (this runs
 *  inside a single Inngest step, which has its own outer timeout). A
 *  non-transient error (bad creds, invalid recipient) is rethrown on the
 *  first attempt without wasting the retries. */
async function sendWithRetry(
  mailer: Services["outreachMailer"],
  creds: SenderAccountCredentials,
  message: OutreachSendArgs,
): Promise<OutreachSendResult> {
  const backoffMs = [0, 1000, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt]) {
      await new Promise((r) => setTimeout(r, backoffMs[attempt]));
    }
    try {
      return await mailer.send(creds, message);
    } catch (e) {
      lastErr = e;
      if (!isTransientSendError(e)) throw e;
      logger.warn(
        { err: e, attempt: attempt + 1 },
        "outreach_send_transient_failure_retrying",
      );
    }
  }
  throw lastErr;
}

/** RFC 5322 Message-ID, generated BEFORE the send so it can be both stamped
 *  on the outgoing mail and persisted — no provider read-back (and thus no
 *  extra OAuth scope) needed. Domain-part matches the sending mailbox so the
 *  id looks legitimate to receiving MTAs. */
function generateMessageId(senderEmail: string): string {
  const domain = senderEmail.includes("@")
    ? senderEmail.split("@")[1]
    : "talscout.local";
  return `<${crypto.randomUUID()}@${domain}>`;
}

function toCredentials(
  sender: typeof senderAccounts.$inferSelect,
): SenderAccountCredentials {
  if (sender.type === "gmail") {
    if (!sender.gmailRefreshTokenEnc) {
      throw new Error("gmail_account_missing_refresh_token");
    }
    return {
      type: "gmail",
      refreshToken: decryptSecret(sender.gmailRefreshTokenEnc),
      hasReadScope: sender.gmailHasReadScope,
    };
  }
  if (
    !sender.smtpHost ||
    !sender.smtpPort ||
    !sender.smtpUsername ||
    !sender.smtpPasswordEnc
  ) {
    throw new Error("smtp_account_missing_credentials");
  }
  return {
    type: "smtp",
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure ?? true,
    username: sender.smtpUsername,
    password: decryptSecret(sender.smtpPasswordEnc),
  };
}

/**
 * Sends one scheduled `outreachSends` row. Triggered by the Inngest function
 * in `src/app/api/inngest/route.ts` only after `step.sleepUntil` durably
 * waits out the send's scheduled block — the durable replacement for the
 * old CRM's browser `setTimeout` loop (see server/lib/spintax.ts).
 *
 * Re-checks campaign status on every run (not just at schedule time) so
 * Pause/Stop take effect even for sends already queued in Inngest: a paused
 * campaign causes this run to mark the send `skipped` and return instead of
 * sending.
 */
export async function sendOutreachEmail(
  payload: SendOutreachEmailPayload,
  services: Services,
): Promise<void> {
  const { tenantId, sendId } = payload;

  const snapshot = await withTenantTx({ tenantId }, async (ctx) => {
    const send = await outreachSendRepo.getById(ctx, sendId);
    if (!send) return null;
    const [lead, campaign, sender] = await Promise.all([
      outreachLeadRepo.getById(ctx, send.leadId),
      outreachCampaignRepo.getById(ctx, send.campaignId),
      senderAccountRepo.getById(ctx, send.senderAccountId),
    ]);
    return { send, lead, campaign, sender };
  });

  if (!snapshot) return; // send deleted mid-flight
  const { send, lead, campaign, sender } = snapshot;
  if (send.status !== "scheduled") return; // idempotent — already processed

  if (!campaign || campaign.status !== "running") {
    await withTenantTx({ tenantId }, async (ctx) => {
      await outreachSendRepo.markSkipped(ctx, sendId, "campaign_not_running");
    });
    return;
  }

  if (!lead || !lead.email) {
    await withTenantTx({ tenantId }, async (ctx) => {
      await outreachSendRepo.markSkipped(ctx, sendId, "lead_missing_email");
      if (lead) await outreachLeadRepo.setStatus(ctx, lead.id, "skipped");
    });
    return;
  }

  if (!sender || !sender.isActive) {
    await withTenantTx({ tenantId }, async (ctx) => {
      await outreachSendRepo.markSkipped(ctx, sendId, "sender_inactive");
    });
    return;
  }

  // Follow-up steps (Day 3/Day 7) reply INTO the step-0 thread — never a
  // fresh mail. That requires the step-0 send to (a) exist, (b) have gone
  // out successfully, and (c) carry its threading anchors. Anything else
  // skips this follow-up rather than falling back to a new-thread send,
  // matching the product rule "same thread or nothing".
  let anchor: {
    rfc822MessageId: string;
    gmailThreadId: string | null;
    sentSubject: string | null;
  } | null = null;
  if (send.stepIndex > 0) {
    const day0 = await withTenantTx({ tenantId }, (ctx) =>
      outreachSendRepo.getByLeadAndStep(ctx, send.campaignId, lead.id, 0),
    );
    if (!day0 || day0.status !== "sent" || !day0.rfc822MessageId) {
      await withTenantTx({ tenantId }, async (ctx) => {
        await outreachSendRepo.markSkipped(ctx, sendId, "day0_not_sent");
      });
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
  const template = resolveTemplate(
    lead.notes,
    campaign.sequence,
    send.stepIndex,
  );
  if (!template) {
    errorReason = "missing_template";
  } else {
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
          await withTenantTx({ tenantId }, async (ctx) => {
            await outreachSendRepo.markSkipped(ctx, sendId, "lead_replied");
          });
          return;
        }
      }

      const stepSubject = resolveSpintaxAndPlaceholders(
        template.subject,
        lead,
        sender.fromName ?? "",
        sender.email,
      );
      // Follow-ups reuse the subject that actually went out on Day 0 (as
      // "Re: …") — Gmail requires the subject to match the thread's, and the
      // step's own template may differ or spintax-resolve differently.
      const subject = anchor
        ? `Re: ${(anchor.sentSubject ?? stepSubject).replace(/^(Re:\s*)+/i, "")}`
        : stepSubject;
      const text = resolveSpintaxAndPlaceholders(
        template.body,
        lead,
        sender.fromName ?? "",
        sender.email,
      );
      messageId = generateMessageId(sender.email);
      sentSubject = subject;
      sendResult = await sendWithRetry(services.outreachMailer, creds, {
        from: sender.email,
        fromName: sender.fromName ?? undefined,
        to: lead.email,
        subject,
        text,
        replyTo: sender.email,
        messageId,
        inReplyTo: anchor?.rfc822MessageId ?? undefined,
        gmailThreadId: anchor?.gmailThreadId ?? undefined,
      });
    } catch (e) {
      errorReason = e instanceof Error ? e.message : "send_failed";
    }
  }

  await withTenantTx({ tenantId }, async (ctx) => {
    if (errorReason) {
      await outreachSendRepo.markFailed(ctx, sendId, errorReason);
      await outreachLeadRepo.setStatus(ctx, lead.id, "failed");
    } else {
      await outreachSendRepo.markSentWithThreading(ctx, sendId, {
        rfc822MessageId: messageId as string,
        // A follow-up stays in the Day 0 thread; a step-0 send records the
        // thread Gmail just created (SMTP sends have none — header-only
        // threading applies there).
        gmailThreadId:
          anchor?.gmailThreadId ?? sendResult?.gmailThreadId ?? undefined,
        sentSubject: sentSubject as string,
      });
      await outreachLeadRepo.setStatus(ctx, lead.id, "sent");
    }
  });
}

export const SEND_OUTREACH_EMAIL_JOB = "sendOutreachEmail";
