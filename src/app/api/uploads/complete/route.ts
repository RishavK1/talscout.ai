import { withAuth } from "@/server/http/with-api";
import { ingestionService } from "@/server/services/ingestion.service";
import { billingService } from "@/server/services/billing.service";
import {
  completeUploadSchema,
  type CompleteUploadBody,
} from "@/server/validation/upload";

/** POST /api/uploads/complete — confirm upload → enqueue parse job. recruiter+ */
export const POST = withAuth<CompleteUploadBody>(
  async ({ ctx, body }) => {
    await billingService.assertActiveSubscription(ctx);
    return {
      status: 202,
      data: await ingestionService.completeUpload(ctx, body),
    };
  },
  { role: "recruiter", bodySchema: completeUploadSchema },
);
