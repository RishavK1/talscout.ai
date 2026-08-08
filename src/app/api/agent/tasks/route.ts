import { withAuth } from "@/server/http/with-api";
import { agentTasksService } from "@/server/services/agent-tasks.service";

/** GET /api/agent/tasks — this workspace's scheduled/background agent
 *  tasks (created via the chat's schedule_task tool). viewer+ */
export const GET = withAuth(
  async ({ ctx }) => {
    return { data: { tasks: await agentTasksService.list(ctx) } };
  },
  { role: "viewer" },
);
