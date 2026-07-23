import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  updateReplyDraftSchema,
  type UpdateReplyDraftBody,
} from "@/server/validation/automated-outreach";

/** GET /api/automated-replies/[id] — one reply draft (original message + AI
 *  draft + reasoning/confidence). viewer+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Reply draft not found");
    return { data: await automatedOutreachService.getReplyDraft(ctx, id) };
  },
  { role: "viewer" },
);

/** PATCH /api/automated-replies/[id] — edit the draft body before approving.
 *  Only allowed while the draft is still pending. recruiter+ */
export const PATCH = withAuth<UpdateReplyDraftBody>(
  async ({ ctx, params, body }) => {
    const id = uuidOr404(params.id, "Reply draft not found");
    return { data: await automatedOutreachService.updateReplyDraftBody(ctx, id, body.draftBody) };
  },
  { role: "recruiter", bodySchema: updateReplyDraftSchema },
);
