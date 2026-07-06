import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { createCampaignSchema, type CreateCampaignBody } from "@/server/validation/outreach";

/** GET /api/outreach/campaigns — list bulk-fire campaigns. viewer+ */
export const GET = withAuth(
  async ({ ctx }) => {
    await billingService.assertActiveSubscription(ctx);
    return { data: { campaigns: await outreachService.listCampaigns(ctx) } };
  },
  { role: "viewer" },
);

/** POST /api/outreach/campaigns — create a draft campaign. recruiter+ */
export const POST = withAuth<CreateCampaignBody>(
  async ({ ctx, body }) => {
    await billingService.assertActiveSubscription(ctx);
    return { status: 201, data: await outreachService.createCampaign(ctx, body) };
  },
  { role: "recruiter", bodySchema: createCampaignSchema },
);
