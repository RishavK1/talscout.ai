import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { submitWhatsAppTemplateSchema, type SubmitWhatsAppTemplateBody } from "@/server/validation/outreach";

/** GET /api/outreach/whatsapp/templates — templates submitted for this
 *  tenant, with their current Meta approval status. viewer+ */
export const GET = withAuth(
  async ({ ctx }) => {
    await billingService.assertActiveSubscription(ctx);
    return { data: { templates: await outreachService.listWhatsAppTemplates(ctx) } };
  },
  { role: "viewer" },
);

/** POST /api/outreach/whatsapp/templates — submit a new template to Meta for
 *  approval. Starts out "pending"; the cron sync job / webhook flips it to
 *  approved/rejected asynchronously. recruiter+ */
export const POST = withAuth<SubmitWhatsAppTemplateBody>(
  async ({ ctx, body }) => {
    await billingService.assertActiveSubscription(ctx);
    return { status: 201, data: await outreachService.submitWhatsAppTemplate(ctx, body) };
  },
  {
    role: "recruiter",
    bodySchema: submitWhatsAppTemplateSchema,
    rateLimit: { limit: 20, windowSeconds: 3600, keyPrefix: "outreach_whatsapp_template_submit" },
  },
);
