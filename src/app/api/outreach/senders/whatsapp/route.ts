import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { createWhatsAppSenderSchema, type CreateWhatsAppSenderBody } from "@/server/validation/outreach";

/** POST /api/outreach/senders/whatsapp — connect a WhatsApp Business phone
 *  number via direct Meta Cloud API credentials (WABA id + permanent access
 *  token), unlike Gmail's OAuth flow. recruiter+ */
export const POST = withAuth<CreateWhatsAppSenderBody>(
  async ({ ctx, body }) => {
    await billingService.assertActiveSubscription(ctx);
    return { status: 201, data: await outreachService.createWhatsAppSender(ctx, body) };
  },
  {
    role: "recruiter",
    bodySchema: createWhatsAppSenderSchema,
    rateLimit: { limit: 10, windowSeconds: 3600, keyPrefix: "outreach_sender_create" },
  },
);
