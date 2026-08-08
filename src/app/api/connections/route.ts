import { withAuth } from "@/server/http/with-api";
import { connectionsService } from "@/server/services/connections.service";

/** GET /api/connections — this tenant's Composio connections, plus the
 *  curated toolkit list Settings renders buttons for. recruiter+ (same as
 *  the existing "Connect Gmail" flow — connecting an app is an account
 *  action, not something a viewer should be able to trigger). */
export const GET = withAuth(
  async ({ ctx }) => {
    const [connections, toolkits] = await Promise.all([
      connectionsService.listConnections(ctx),
      Promise.resolve(connectionsService.curatedToolkits()),
    ]);
    return { data: { connections, toolkits } };
  },
  { role: "recruiter" },
);
