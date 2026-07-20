import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import {
  listReplyDraftsQuerySchema,
  type ListReplyDraftsQuery,
} from "@/server/validation/automated-outreach";

/** GET /api/automated-replies — tenant-wide (not campaign-scoped) list of
 *  pending AI-drafted replies, newest first. Backs the 3-pane review queue.
 *  viewer+ */
export const GET = withAuth<undefined, ListReplyDraftsQuery>(
  async ({ ctx, query }) => {
    return {
      data: { drafts: await automatedOutreachService.listPendingReplyDrafts(ctx, query) },
    };
  },
  { role: "viewer", querySchema: listReplyDraftsQuerySchema },
);
