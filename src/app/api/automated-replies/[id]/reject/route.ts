import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";

/** POST /api/automated-replies/[id]/reject — dismisses the draft; no send. recruiter+ */
export const POST = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Reply draft not found");
    return { data: await automatedOutreachService.rejectReplyDraft(ctx, id) };
  },
  { role: "recruiter" },
);
