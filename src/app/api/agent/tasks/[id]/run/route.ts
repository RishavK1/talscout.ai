import { withAuth } from "@/server/http/with-api";
import { agentTaskRepo } from "@/server/repositories/agent-task.repo";
import { RUN_AGENT_TASK_NOW_JOB } from "@/server/jobs/run-agent-task";
import { getServices } from "@/server/container";
import { uuidOr404 } from "@/server/validation/common";
import { NotFound } from "@/server/http/errors";

/** POST /api/agent/tasks/[id]/run — runs a task immediately instead of
 *  waiting for the next scheduled time / cron sweep. recruiter+ */
export const POST = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Task not found");
    const task = await agentTaskRepo.getById(ctx, id);
    if (!task) throw new NotFound("Task not found");
    return {
      data: { ok: true },
      afterCommit: async () => {
        await getServices().queue.enqueue(RUN_AGENT_TASK_NOW_JOB, { taskId: id });
      },
    };
  },
  { role: "recruiter" },
);
