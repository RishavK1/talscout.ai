import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  requestLeadsUploadSchema,
  type RequestLeadsUploadBody,
} from "@/server/validation/outreach";

/** POST /api/outreach/campaigns/[id]/leads/upload/request — presign a docx
 *  upload for the lead-import dropzone. recruiter+ */
export const POST = withAuth<RequestLeadsUploadBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { status: 201, data: await outreachService.requestLeadsUpload(ctx, campaignId, body) };
  },
  {
    role: "recruiter",
    bodySchema: requestLeadsUploadSchema,
    rateLimit: { limit: 20, windowSeconds: 3600, keyPrefix: "outreach_upload_request" },
  },
);
