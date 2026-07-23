import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";

/** POST /api/automated-campaigns/[id]/pause — stops discovery/enrichment/
 *  sending for this campaign; already-sent history is untouched. recruiter+ */
export const POST = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Campaign not found");
    return { data: await automatedOutreachService.pauseCampaign(ctx, id) };
  },
  { role: "recruiter" },
);
