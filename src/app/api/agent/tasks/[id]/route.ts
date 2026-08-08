import { z } from "zod";
import { withAuth } from "@/server/http/with-api";
import { agentTasksService } from "@/server/services/agent-tasks.service";
import { uuidOr404 } from "@/server/validation/common";

const patchSchema = z.object({ status: z.enum(["active", "paused"]) });

/** PATCH /api/agent/tasks/[id] — pause or resume. recruiter+ */
export const PATCH = withAuth<{ status: "active" | "paused" }>(
  async ({ ctx, params, body }) => {
    const id = uuidOr404(params.id, "Task not found");
    const task = body.status === "active" ? await agentTasksService.resume(ctx, id) : await agentTasksService.pause(ctx, id);
    return { data: { task } };
  },
  { role: "recruiter", bodySchema: patchSchema },
);

/** DELETE /api/agent/tasks/[id] — remove. recruiter+ */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Task not found");
    await agentTasksService.remove(ctx, id);
    return { data: { ok: true } };
  },
  { role: "recruiter" },
);
