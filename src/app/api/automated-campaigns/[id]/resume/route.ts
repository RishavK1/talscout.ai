import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";

/** POST /api/automated-campaigns/[id]/resume — reactivates a paused/draft
 *  campaign, re-validating its blueprint and sender still qualify. Triggers
 *  an immediate first discovery run (see afterCommit) rather than waiting
 *  for the next 6-hour cron slot. recruiter+ */
export const POST = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Campaign not found");
    const { result, afterCommit } = await automatedOutreachService.resumeCampaign(ctx, id);
    return { data: result, afterCommit };
  },
  { role: "recruiter" },
);
