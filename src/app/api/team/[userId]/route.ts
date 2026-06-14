import { withAuth } from "@/server/http/with-api";
import { teamService } from "@/server/services/team.service";
import { uuidOr404 } from "@/server/validation/common";

/** DELETE /api/team/:userId — remove a member (frees a seat). admin only. */
export const DELETE = withAuth(
  async ({ ctx, params }) => ({
    data: await teamService.remove(ctx, uuidOr404(params.userId, "Member not found")),
  }),
  { role: "admin" },
);
