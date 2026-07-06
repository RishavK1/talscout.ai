import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";

/** GET /api/outreach/campaigns/[id] — campaign + send counts for the progress
 *  panel. Polled by the frontend every ~4s while status is "running". viewer+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { data: await outreachService.getCampaign(ctx, campaignId) };
  },
  { role: "viewer" },
);
