import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import { setSenderActiveSchema, type SetSenderActiveBody } from "@/server/validation/outreach";

/** PATCH /api/outreach/senders/[id] — pause/resume a sender account without
 *  disconnecting it. recruiter+ */
export const PATCH = withAuth<SetSenderActiveBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const senderId = uuidOr404(params.id, "Sender account not found");
    return { data: await outreachService.setSenderActive(ctx, senderId, body.isActive) };
  },
  { role: "recruiter", bodySchema: setSenderActiveSchema },
);

/** DELETE /api/outreach/senders/[id] — disconnect a sender account. recruiter+ */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    await billingService.assertActiveSubscription(ctx);
    const senderId = uuidOr404(params.id, "Sender account not found");
    await outreachService.removeSender(ctx, senderId);
    return { data: { removed: true } };
  },
  { role: "recruiter" },
);
