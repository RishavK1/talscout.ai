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
): Promise<void> {
  const backoffMs = [0, 1000, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt]) {
      await new Promise((r) => setTimeout(r, backoffMs[attempt]));
    }
    try {
      await mailer.send(creds, message);
      return;
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

  let errorReason: string | null = null;
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
      const subject = resolveSpintaxAndPlaceholders(
        template.subject,
        lead,
        sender.fromName ?? "",
        sender.email,
      );
      const text = resolveSpintaxAndPlaceholders(
        template.body,
        lead,
        sender.fromName ?? "",
        sender.email,
      );
      await sendWithRetry(services.outreachMailer, creds, {
        from: sender.email,
        fromName: sender.fromName ?? undefined,
        to: lead.email,
        subject,
        text,
        replyTo: sender.email,
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
      await outreachSendRepo.markSent(ctx, sendId);
      await outreachLeadRepo.setStatus(ctx, lead.id, "sent");
    }
  });
}

export const SEND_OUTREACH_EMAIL_JOB = "sendOutreachEmail";
