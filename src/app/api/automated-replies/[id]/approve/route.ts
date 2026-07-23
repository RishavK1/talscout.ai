import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  approveReplyDraftSchema,
  type ApproveReplyDraftBody,
} from "@/server/validation/automated-outreach";

/** POST /api/automated-replies/[id]/approve — the ONE send path for an
 *  AI-drafted reply. Optional inline `draftBody` is a final edit applied at
 *  the moment of approval. The actual send happens in afterCommit (never
 *  inside the request's DB transaction — see the service's doc comment).
 *  recruiter+ */
export const POST = withAuth<ApproveReplyDraftBody>(
  async ({ ctx, params, body }) => {
    const id = uuidOr404(params.id, "Reply draft not found");
    const { result, afterCommit } = await automatedOutreachService.approveReplyDraft(
      ctx,
      id,
      body?.draftBody,
    );
    return { data: result, afterCommit };
  },
  {
    role: "recruiter",
    bodySchema: approveReplyDraftSchema,
    rateLimit: { limit: 100, windowSeconds: 3600, keyPrefix: "automated_reply_approve" },
  },
);
