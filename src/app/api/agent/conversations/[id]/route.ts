import { z } from "zod";
import { withAuth } from "@/server/http/with-api";
import { agentService } from "@/server/services/agent.service";
import { uuidOr404 } from "@/server/validation/common";

const patchSchema = z.object({ pinned: z.boolean() });

/** PATCH /api/agent/conversations/[id] — pin/unpin. recruiter+ */
export const PATCH = withAuth<{ pinned: boolean }>(
  async ({ ctx, params, body }) => {
    const id = uuidOr404(params.id, "Conversation not found");
    await agentService.setPinned(ctx, id, body.pinned);
    return { data: { ok: true } };
  },
  { role: "recruiter", bodySchema: patchSchema },
);

/** DELETE /api/agent/conversations/[id] — archive (soft-delete), same
 *  "never hard-delete history" posture as the rest of this app. recruiter+ */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Conversation not found");
    await agentService.archiveConversation(ctx, id);
    return { data: { ok: true } };
  },
  { role: "recruiter" },
);
