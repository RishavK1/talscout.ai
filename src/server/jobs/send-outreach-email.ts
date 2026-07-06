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
import type { Services, SenderAccountCredentials } from "@/server/ports";
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

function toCredentials(
  sender: typeof senderAccounts.$inferSelect,
): SenderAccountCredentials {
  if (sender.type === "gmail") {
    if (!sender.gmailRefreshTokenEnc) {
      throw new Error("gmail_account_missing_refresh_token");
    }
    return { type: "gmail", refreshToken: decryptSecret(sender.gmailRefreshTokenEnc) };
  }
  if (!sender.smtpHost || !sender.smtpPort || !sender.smtpUsername || !sender.smtpPasswordEnc) {
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
  const template = resolveTemplate(lead.notes, campaign.sequence, send.stepIndex);
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
      await services.outreachMailer.send(creds, {
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
