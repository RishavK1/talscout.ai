import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";

/** POST /api/automated-replies/[id]/regenerate — re-runs the AI reply
 *  drafter, overwrites draftBody/reasoning/confidence, stays pending. An
 *  on-demand Gemini call with no other backpressure, so it's tightly rate-
 *  limited. recruiter+ */
export const POST = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Reply draft not found");
    return { data: await automatedOutreachService.regenerateReplyDraft(ctx, id) };
  },
  {
    role: "recruiter",
    rateLimit: { limit: 10, windowSeconds: 3600, keyPrefix: "automated_reply_regenerate" },
  },
);
