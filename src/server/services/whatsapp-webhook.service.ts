import { createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "@/server/config/env";
import { outreachSendRepo } from "@/server/repositories/outreach.repo";
import { whatsappTemplateRepo } from "@/server/repositories/whatsapp-template.repo";
import { logger } from "@/server/observability/logger";
import { BadRequest } from "@/server/http/errors";

interface StatusEvent {
  id: string; // wamid — matches outreachSends.providerMessageId
  status: "sent" | "delivered" | "read" | "failed";
}

interface WebhookChange {
  field: string;
  value: {
    statuses?: StatusEvent[];
    message_template_id?: string;
    event?: string;
    reason?: string;
  };
}

interface WebhookEntry {
  changes?: WebhookChange[];
}

interface WebhookPayload {
  entry?: WebhookEntry[];
}

function metaEventToDeliveryStatus(
  status: string,
): "sent" | "delivered" | "read" | "failed" | null {
  if (status === "sent" || status === "delivered" || status === "read" || status === "failed") {
    return status;
  }
  return null;
}

function metaEventToTemplateStatus(
  event: string,
): "pending" | "approved" | "rejected" | "disabled" | null {
  const normalized = event.toLowerCase();
  if (
    normalized === "approved" ||
    normalized === "rejected" ||
    normalized === "disabled" ||
    normalized === "pending"
  ) {
    return normalized;
  }
  return null;
}

export const whatsappWebhookService = {
  /** Meta's one-time subscription handshake — verified against a shared
   *  secret configured in the Meta App Dashboard, distinct from the HMAC
   *  signature used on POST bodies below. */
  verifyHandshake(mode: string | null, token: string | null): boolean {
    const env = getEnv();
    if (!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      throw new BadRequest("WhatsApp webhook is not configured on this server");
    }
    return mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  },

  /** Signature is computed over the raw request body — verify before
   *  parsing/trusting anything in it (mirrors the Stripe webhook pattern). */
  verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    const env = getEnv();
    if (!env.WHATSAPP_APP_SECRET || !signatureHeader) return false;
    const expected = createHmac("sha256", env.WHATSAPP_APP_SECRET)
      .update(rawBody, "utf8")
      .digest("hex");
    const provided = signatureHeader.replace(/^sha256=/, "");
    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(provided, "hex");
    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  },

  /**
   * Business logic for inbound webhook events. Not tenant-scoped by URL —
   * Meta sends one event stream per App covering every connected WABA, so
   * tenant is resolved per-event from an admin-scoped lookup (mirrors
   * webhookRepo/tenantRepo.getByIdAdmin's use of the RLS-bypassing
   * connection). Always resolves without throwing on an unknown id — an
   * unrecognized wamid/template just means "nothing to update", not an
   * error; Meta disables webhooks after sustained non-200s so this must
   * never surface a 4xx/5xx for a benign lookup miss.
   */
  async handleEvent(rawBody: string): Promise<{ received: true }> {
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { received: true };
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === "messages" && change.value.statuses) {
          for (const status of change.value.statuses) {
            await this.applyDeliveryStatus(status);
          }
        } else if (change.field === "message_template_status_update") {
          await this.applyTemplateStatus(change.value);
        }
      }
    }

    return { received: true };
  },

  async applyDeliveryStatus(status: StatusEvent): Promise<void> {
    const deliveryStatus = metaEventToDeliveryStatus(status.status);
    if (!deliveryStatus) return;
    const send = await outreachSendRepo.getByProviderMessageId(status.id);
    if (!send) {
      logger.warn({ providerMessageId: status.id }, "whatsapp_webhook_unknown_message_id");
      return;
    }
    await outreachSendRepo.updateDeliveryStatusAdmin(send.id, deliveryStatus);
  },

  async applyTemplateStatus(value: WebhookChange["value"]): Promise<void> {
    if (!value.message_template_id || !value.event) return;
    const status = metaEventToTemplateStatus(value.event);
    if (!status) return;
    await whatsappTemplateRepo.setStatusByMetaTemplateIdAdmin(
      value.message_template_id,
      status,
      value.reason,
    );
  },
};
