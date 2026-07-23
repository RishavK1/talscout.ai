import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";

/** GET /api/automated-campaigns/[id]/leads/[leadId]/sends — the Day 0/3/7
 *  rows for one lead (subject, body, scheduledAt, status, sentAt), ordered
 *  by step. Backs the leads-table "View emails" modal. viewer+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    const campaignId = uuidOr404(params.id, "Campaign not found");
    const leadId = uuidOr404(params.leadId, "Lead not found");
    return { data: { sends: await automatedOutreachService.listLeadSends(ctx, campaignId, leadId) } };
  },
  { role: "viewer" },
);
