import { z } from "zod";
import { withAuth } from "@/server/http/with-api";
import { agentSkillsService } from "@/server/services/agent-skills.service";

/** GET /api/agent/skills — this workspace's saved skills. viewer+ */
export const GET = withAuth(
  async ({ ctx }) => {
    return { data: { skills: await agentSkillsService.list(ctx) } };
  },
  { role: "viewer" },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  instructions: z.string().min(1).max(8000),
});

/** POST /api/agent/skills — hand-write a skill from the management page
 *  (the chat's own save_skill tool is the other creation path). recruiter+ */
export const POST = withAuth<{ name: string; description: string; instructions: string }>(
  async ({ ctx, body }) => {
    const skill = await agentSkillsService.create(ctx, body);
    return { data: { skill }, status: 201 };
  },
  { role: "recruiter", bodySchema: createSchema },
);
