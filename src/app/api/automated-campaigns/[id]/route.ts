import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  updateAutomatedCampaignSchema,
  type UpdateAutomatedCampaignBody,
} from "@/server/validation/automated-outreach";

/** GET /api/automated-campaigns/[id] — one campaign. viewer+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Campaign not found");
    return { data: await automatedOutreachService.getCampaign(ctx, id) };
  },
  { role: "viewer" },
);

/** PATCH /api/automated-campaigns/[id] — edit campaign config. recruiter+ */
export const PATCH = withAuth<UpdateAutomatedCampaignBody>(
  async ({ ctx, params, body }) => {
    const id = uuidOr404(params.id, "Campaign not found");
    return { data: await automatedOutreachService.updateCampaign(ctx, id, body) };
  },
  { role: "recruiter", bodySchema: updateAutomatedCampaignSchema },
);

/** DELETE /api/automated-campaigns/[id] — permanently deletes the campaign
 *  and (via FK cascade) its leads/sends/reply-drafts. Destructive +
 *  irreversible, so admin-only, matching Bulk Fire's campaign-delete
 *  precedent. */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Campaign not found");
    return { data: await automatedOutreachService.deleteCampaign(ctx, id) };
  },
  { role: "admin" },
);
