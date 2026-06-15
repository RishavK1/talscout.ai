import { withAuth } from "@/server/http/with-api";
import { ingestionService } from "@/server/services/ingestion.service";
import { billingService } from "@/server/services/billing.service";
import {
  requestUploadSchema,
  type RequestUploadBody,
} from "@/server/validation/upload";

/** POST /api/uploads — validate + presign + create draft candidate. recruiter+ */
export const POST = withAuth<RequestUploadBody>(
  async ({ ctx, body }) => {
    await billingService.assertActiveSubscription(ctx);
    return {
      status: 201,
      data: await ingestionService.requestUpload(ctx, body),
    };
  },
  { role: "recruiter", bodySchema: requestUploadSchema },
);
