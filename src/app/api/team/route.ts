import { withAuth } from "@/server/http/with-api";
import { teamService } from "@/server/services/team.service";
import { inviteSchema, type InviteBody } from "@/server/validation/team";

/** GET /api/team — list members. admin only. */
export const GET = withAuth(async ({ ctx }) => ({ data: await teamService.list(ctx) }), {
  role: "admin",
});

/** POST /api/team — invite a member (seat + subscription checked). admin only. */
export const POST = withAuth<InviteBody>(
  async ({ ctx, body }) => ({ status: 201, data: await teamService.invite(ctx, body) }),
  { role: "admin", bodySchema: inviteSchema },
);
