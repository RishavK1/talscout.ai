import { withAuth } from "@/server/http/with-api";
import { ingestionService } from "@/server/services/ingestion.service";
import {
  requestUploadSchema,
  type RequestUploadBody,
} from "@/server/validation/upload";

/** POST /api/uploads — validate + presign + create draft candidate. recruiter+ */
export const POST = withAuth<RequestUploadBody>(
  async ({ ctx, body }) => ({
    status: 201,
    data: await ingestionService.requestUpload(ctx, body),
  }),
  { role: "recruiter", bodySchema: requestUploadSchema },
);
