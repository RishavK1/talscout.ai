import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import { setWhatsAppSequenceSchema, type SetWhatsAppSequenceBody } from "@/server/validation/outreach";

/** PUT /api/outreach/campaigns/[id]/sequence/whatsapp — persist the WhatsApp
 *  template sequence (day offset + approved template + params per step).
 *  recruiter+ */
export const PUT = withAuth<SetWhatsAppSequenceBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { data: await outreachService.setWhatsAppSequence(ctx, campaignId, body) };
  },
  { role: "recruiter", bodySchema: setWhatsAppSequenceSchema },
);
