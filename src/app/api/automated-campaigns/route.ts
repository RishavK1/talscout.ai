import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import {
  createAutomatedCampaignSchema,
  type CreateAutomatedCampaignBody,
} from "@/server/validation/automated-outreach";

/** GET /api/automated-campaigns — list this tenant's automated campaigns. viewer+ */
export const GET = withAuth(
  async ({ ctx }) => {
    return { data: { campaigns: await automatedOutreachService.listCampaigns(ctx) } };
  },
  { role: "viewer" },
);

/** POST /api/automated-campaigns — create a draft automated campaign.
 *  Validates the blueprint is generated and the sender qualifies for the
 *  requested reply-polling setting. recruiter+ */
export const POST = withAuth<CreateAutomatedCampaignBody>(
  async ({ ctx, body }) => {
    return { status: 201, data: await automatedOutreachService.createCampaign(ctx, body) };
  },
  {
    role: "recruiter",
    bodySchema: createAutomatedCampaignSchema,
    rateLimit: { limit: 20, windowSeconds: 3600, keyPrefix: "automated_campaign_create" },
  },
);
