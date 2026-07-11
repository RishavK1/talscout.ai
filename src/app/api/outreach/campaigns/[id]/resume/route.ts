import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";

/** POST /api/outreach/campaigns/[id]/resume — recruiter+ */
export const POST = withAuth(
  async ({ ctx, params }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { data: await outreachService.resumeCampaign(ctx, campaignId) };
  },
  { role: "recruiter" },
);
