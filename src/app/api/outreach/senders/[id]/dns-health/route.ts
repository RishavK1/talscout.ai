import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";

/** GET /api/outreach/senders/[id]/dns-health — on-demand SPF/DKIM/DMARC
 *  diagnostic for a connected sender's domain. Read-only, no stored state;
 *  rate-limited since it's still a handful of real DNS lookups per call,
 *  not because it's expensive. recruiter+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    await billingService.assertActiveSubscription(ctx);
    const senderId = uuidOr404(params.id, "Sender account not found");
    return { data: await outreachService.checkSenderDeliverability(ctx, senderId) };
  },
  {
    role: "recruiter",
    rateLimit: { limit: 20, windowSeconds: 3600, keyPrefix: "sender_dns_health" },
  },
);
