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
    // Must stay comfortably ABOVE the largest plan's sender allowance
    // (Scale: 10 — see outreachMaxSenderAccounts in lib/plans.ts), otherwise
    // a customer connecting their full allowance exhausts the window and
    // can't retry a mistyped mailbox for an hour. The plan quota, not this
    // limiter, is what enforces how many senders a workspace may own.
    rateLimit: { limit: 25, windowSeconds: 3600, keyPrefix: "outreach_sender_create" },
  },
);
