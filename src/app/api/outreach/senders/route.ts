import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { createSmtpSenderSchema, type CreateSmtpSenderBody } from "@/server/validation/outreach";

/** GET /api/outreach/senders — connected sender accounts. `outreachService`
 *  strips the encrypted credential columns before returning, so nothing
 *  ciphertext-shaped ever reaches this response. viewer+ */
export const GET = withAuth(
  async ({ ctx }) => {
    await billingService.assertActiveSubscription(ctx);
    return { data: { senders: await outreachService.listSenders(ctx) } };
  },
  { role: "viewer" },
);

/** POST /api/outreach/senders — connect an SMTP sender account. recruiter+ */
export const POST = withAuth<CreateSmtpSenderBody>(
  async ({ ctx, body }) => {
    await billingService.assertActiveSubscription(ctx);
    return { status: 201, data: await outreachService.createSmtpSender(ctx, body) };
  },
  {
    role: "recruiter",
    bodySchema: createSmtpSenderSchema,
    rateLimit: { limit: 10, windowSeconds: 3600, keyPrefix: "outreach_sender_create" },
  },
);
