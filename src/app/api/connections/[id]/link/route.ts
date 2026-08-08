import { withAuth } from "@/server/http/with-api";
import { connectionsService } from "@/server/services/connections.service";

/** POST /api/connections/[id]/link — hosted Composio connect URL for the
 *  frontend to navigate the browser to. `[id]` here is the toolkit slug
 *  (e.g. "gmail"), not a connection id — named `id` only because Next.js
 *  requires every dynamic segment at this path depth to share one param
 *  name across sibling routes (it collided with `/api/connections/[id]`'s
 *  connection-id route otherwise, which broke the whole dev server's route
 *  manifest). recruiter+ */
export const POST = withAuth(
  async ({ ctx, session, params, req }) => {
    const appOrigin = new URL(req.url).origin;
    const { url } = await connectionsService.createLink(
      { tenantId: ctx.tenantId, userId: session.userId },
      params.id,
      appOrigin,
    );
    return { data: { url } };
  },
  { role: "recruiter" },
);
