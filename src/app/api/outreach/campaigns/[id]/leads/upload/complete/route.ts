import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  completeLeadsUploadSchema,
  type CompleteLeadsUploadBody,
} from "@/server/validation/outreach";

/** POST /api/outreach/campaigns/[id]/leads/upload/complete — confirm the docx
 *  landed in storage, then enqueue the parse job. recruiter+ */
export const POST = withAuth<CompleteLeadsUploadBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { status: 202, data: await outreachService.completeLeadsUpload(ctx, campaignId, body) };
  },
  { role: "recruiter", bodySchema: completeLeadsUploadSchema },
);
