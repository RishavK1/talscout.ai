import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";

/** POST /api/automated-campaigns/[id]/resume — reactivates a paused/draft
 *  campaign, re-validating its blueprint and sender still qualify. recruiter+ */
export const POST = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Campaign not found");
    return { data: await automatedOutreachService.resumeCampaign(ctx, id) };
  },
  { role: "recruiter" },
);
