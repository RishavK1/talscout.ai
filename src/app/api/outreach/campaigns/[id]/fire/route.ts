import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import { fireCampaignSchema, type FireCampaignBody } from "@/server/validation/outreach";

/** POST /api/outreach/campaigns/[id]/fire — schedule one sequence step
 *  (default day0) to every currently-eligible lead. recruiter+ */
export const POST = withAuth<FireCampaignBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { data: await outreachService.fireCampaign(ctx, campaignId, body.stepIndex) };
  },
  { role: "recruiter", bodySchema: fireCampaignSchema },
);
