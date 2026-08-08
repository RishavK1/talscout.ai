import { withAuth } from "@/server/http/with-api";
import { agentService } from "@/server/services/agent.service";

/** GET /api/agent/conversations — this user's conversation list (left rail).
 *  viewer+ */
export const GET = withAuth(
  async ({ ctx }) => {
    return { data: { conversations: await agentService.listConversations(ctx) } };
  },
  { role: "viewer" },
);

/** POST /api/agent/conversations — start a new, empty conversation. No cap
 *  on how many a user can create (see the system design doc's chat-history
 *  requirements). recruiter+ */
export const POST = withAuth(
  async ({ ctx }) => {
    const conversation = await agentService.createConversation(ctx);
    return { data: { conversation }, status: 201 };
  },
  { role: "recruiter" },
);
