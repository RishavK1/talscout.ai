import { withTenantTx } from "@/server/db/tx";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
  type WhatsAppSequenceStep,
} from "@/server/repositories/outreach.repo";
import { whatsappTemplateRepo } from "@/server/repositories/whatsapp-template.repo";
import { resolveWhatsAppTemplateParam } from "@/server/lib/spintax";
import { decryptSecret } from "@/server/lib/secret-box";
import { logger } from "@/server/observability/logger";
import type { Services, WhatsAppSenderCredentials } from "@/server/ports";

export interface SendOutreachWhatsAppPayload {
  tenantId: string;
  sendId: string;
}

function resolveStep(
  sequence: unknown,
  stepIndex: number,
): WhatsAppSequenceStep | null {
  const steps = Array.isArray(sequence)
    ? (sequence as Partial<WhatsAppSequenceStep>[])
    : [];
  const step = steps.find((s) => s.stepIndex === stepIndex);
  if (!step || !step.templateId) return null;
  return {
    stepIndex: step.stepIndex as number,
    dayOffset: step.dayOffset as number,
    templateId: step.templateId,
    templateParams: Array.isArray(step.templateParams) ? step.templateParams : [],
  };
}

// Meta Graph API error codes worth a retry rather than an immediate permanent
// failure: 80007 (rate limit — throughput/capacity), 4/32/613 (app/account
// level throttling), and generic 5xx-shaped transport errors. Everything else
// (bad template params, re-engagement-window 131047, invalid recipient) is
// permanent — retrying would just waste attempts landing on the same error.
const TRANSIENT_META_CODES = new Set([80007, 4, 32, 613]);

function isTransientSendError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: number }).code;
  if (typeof code === "number" && TRANSIENT_META_CODES.has(code)) return true;
  const status = (e as { status?: number }).status;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  return false;
}

async function sendWithRetry(
  sender: Services["whatsappSender"],
  creds: WhatsAppSenderCredentials,
  message: Parameters<Services["whatsappSender"]["send"]>[1],
): Promise<{ providerMessageId: string }> {
  const backoffMs = [0, 1000, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt]) {
      await new Promise((r) => setTimeout(r, backoffMs[attempt]));
    }
    try {
      return await sender.send(creds, message);
    } catch (e) {
      lastErr = e;
      if (!isTransientSendError(e)) throw e;
      logger.warn(
        { err: e, attempt: attempt + 1 },
        "outreach_whatsapp_send_transient_failure_retrying",
      );
    }
  }
  throw lastErr;
}

/**
 * Sends one scheduled `outreachSends` row over WhatsApp. Structural sibling
 * of `sendOutreachEmail` (same snapshot-fetch/idempotency/pause-check shell)
 * but forked because Meta's template-send shape, error codes, and retry
 * semantics don't map onto SMTP/Gmail's.
 */
export async function sendOutreachWhatsapp(
  payload: SendOutreachWhatsAppPayload,
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

  if (!lead || !lead.phone) {
    await withTenantTx({ tenantId }, async (ctx) => {
      await outreachSendRepo.markSkipped(ctx, sendId, "lead_missing_phone");
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

  const step = resolveStep(campaign.sequence, send.stepIndex);
  if (!step) {
    await withTenantTx({ tenantId }, async (ctx) => {
      await outreachSendRepo.markFailed(ctx, sendId, "missing_template_step");
      await outreachLeadRepo.setStatus(ctx, lead.id, "failed");
    });
    return;
  }

  let errorReason: string | null = null;
  let providerMessageId: string | null = null;

  const template = await withTenantTx({ tenantId }, (ctx) =>
    whatsappTemplateRepo.getById(ctx, step.templateId),
  );

  // Structural enforcement of "templates only, approved only" (plan §5) —
  // there is no free-text send path this can fall through to.
  if (!template || template.senderAccountId !== sender.id) {
    errorReason = "template_not_found";
  } else if (template.status !== "approved") {
    errorReason = "template_not_approved";
  } else if (!sender.whatsappPhoneNumberId || !sender.whatsappAccessTokenEnc) {
    errorReason = "whatsapp_account_missing_credentials";
  } else {
    try {
      const creds: WhatsAppSenderCredentials = {
        phoneNumberId: sender.whatsappPhoneNumberId,
        accessToken: decryptSecret(sender.whatsappAccessTokenEnc),
      };
      const bodyParams = step.templateParams.map((p) =>
        resolveWhatsAppTemplateParam(p, lead),
      );
      const result = await sendWithRetry(services.whatsappSender, creds, {
        to: lead.phone,
        templateName: template.metaTemplateName,
        language: template.language,
        bodyParams,
      });
      providerMessageId = result.providerMessageId;
    } catch (e) {
      errorReason = e instanceof Error ? e.message : "send_failed";
    }
  }

  await withTenantTx({ tenantId }, async (ctx) => {
    if (errorReason) {
      await outreachSendRepo.markFailed(ctx, sendId, errorReason);
      await outreachLeadRepo.setStatus(ctx, lead.id, "failed");
    } else {
      await outreachSendRepo.markSentWithProviderMessageId(
        ctx,
        sendId,
        providerMessageId as string,
      );
      await outreachLeadRepo.setStatus(ctx, lead.id, "sent");
    }
  });
}

export const SEND_OUTREACH_WHATSAPP_JOB = "sendOutreachWhatsapp";
