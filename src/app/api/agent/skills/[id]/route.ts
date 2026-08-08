import { z } from "zod";
import { withAuth } from "@/server/http/with-api";
import { agentSkillsService } from "@/server/services/agent-skills.service";
import { uuidOr404 } from "@/server/validation/common";

/** GET /api/agent/skills/[id] — one skill (edit form). viewer+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Skill not found");
    return { data: { skill: await agentSkillsService.get(ctx, id) } };
  },
  { role: "viewer" },
);

const updateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().min(1).max(500).optional(),
    instructions: z.string().min(1).max(8000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

/** PATCH /api/agent/skills/[id] — edit. recruiter+ */
export const PATCH = withAuth<{ name?: string; description?: string; instructions?: string }>(
  async ({ ctx, params, body }) => {
    const id = uuidOr404(params.id, "Skill not found");
    return { data: { skill: await agentSkillsService.update(ctx, id, body) } };
  },
  { role: "recruiter", bodySchema: updateSchema },
);

/** DELETE /api/agent/skills/[id] — remove. recruiter+ */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Skill not found");
    await agentSkillsService.remove(ctx, id);
    return { data: { ok: true } };
  },
  { role: "recruiter" },
);
