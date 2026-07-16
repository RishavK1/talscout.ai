import { whatsappTemplateRepo } from "@/server/repositories/whatsapp-template.repo";
import { senderAccountRepo } from "@/server/repositories/outreach.repo";
import { withTenantTx } from "@/server/db/tx";
import { decryptSecret } from "@/server/lib/secret-box";
import { logger } from "@/server/observability/logger";
import type { Services } from "@/server/ports";

/**
 * Cron-triggered backstop (plan §2) for Meta's `message_template_status_update`
 * webhook — webhook delivery isn't guaranteed, so this walks every pending
 * template across every tenant and reconciles status directly against the
 * Graph API. Uses the admin-scoped repo methods since it runs outside any
 * single tenant's request context.
 */
export async function syncWhatsAppTemplates(services: Services): Promise<void> {
  const pending = await whatsappTemplateRepo.listPendingAdmin();
  if (pending.length === 0) return;

  for (const template of pending) {
    try {
      const sender = await withTenantTx(
        { tenantId: template.tenantId },
        (ctx) => senderAccountRepo.getById(ctx, template.senderAccountId),
      );
      if (!sender?.whatsappWabaId || !sender.whatsappAccessTokenEnc || !template.metaTemplateId) {
        continue;
      }
      const result = await services.whatsappTemplateManager.getStatus(
        sender.whatsappWabaId,
        decryptSecret(sender.whatsappAccessTokenEnc),
        template.metaTemplateId,
      );
      if (result.status !== template.status) {
        await whatsappTemplateRepo.setStatusAdmin(
          template.id,
          result.status,
          result.rejectionReason,
        );
      }
    } catch (e) {
      logger.warn(
        { err: e, templateId: template.id },
        "sync_whatsapp_templates_lookup_failed",
      );
    }
  }
}

export const SYNC_WHATSAPP_TEMPLATES_JOB = "syncWhatsAppTemplates";
