import type { TenantContext } from "@/server/db/tx";
import { agentSkillRepo } from "@/server/repositories/agent-skill.repo";
import { billingService } from "@/server/services/billing.service";
import { NotFound, Conflict, BadRequest } from "@/server/http/errors";

const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;
const MAX_INSTRUCTIONS = 8_000;

function validate(input: { name: string; description: string; instructions: string }) {
  if (!input.name.trim()) throw new BadRequest("Skill name is required");
  if (input.name.length > MAX_NAME) throw new BadRequest(`Skill name must be under ${MAX_NAME} characters`);
  if (!input.description.trim()) throw new BadRequest("Skill description is required");
  if (input.description.length > MAX_DESCRIPTION) {
    throw new BadRequest(`Skill description must be under ${MAX_DESCRIPTION} characters`);
  }
  if (!input.instructions.trim()) throw new BadRequest("Skill instructions are required");
  if (input.instructions.length > MAX_INSTRUCTIONS) {
    throw new BadRequest(`Skill instructions must be under ${MAX_INSTRUCTIONS} characters`);
  }
}

export const agentSkillsService = {
  async list(ctx: TenantContext) {
    await billingService.assertCapability(ctx, "ai_agent");
    return await agentSkillRepo.list(ctx);
  },

  async get(ctx: TenantContext, id: string) {
    const row = await agentSkillRepo.getById(ctx, id);
    if (!row) throw new NotFound("Skill not found");
    return row;
  },

  async create(
    ctx: TenantContext,
    input: { name: string; description: string; instructions: string; sourceConversationId?: string },
  ) {
    await billingService.assertCapability(ctx, "ai_agent");
    validate(input);
    const existing = await agentSkillRepo.getByName(ctx, input.name.trim());
    if (existing) throw new Conflict(`A skill named "${input.name}" already exists`);
    return await agentSkillRepo.create(ctx, {
      name: input.name.trim(),
      description: input.description.trim(),
      instructions: input.instructions.trim(),
      sourceConversationId: input.sourceConversationId,
    });
  },

  async update(ctx: TenantContext, id: string, input: { name?: string; description?: string; instructions?: string }) {
    const existing = await agentSkillRepo.getById(ctx, id);
    if (!existing) throw new NotFound("Skill not found");
    if (input.name !== undefined && !input.name.trim()) throw new BadRequest("Skill name can't be empty");
    if (input.name && input.name.length > MAX_NAME) throw new BadRequest(`Skill name must be under ${MAX_NAME} characters`);
    if (input.description && input.description.length > MAX_DESCRIPTION) {
      throw new BadRequest(`Skill description must be under ${MAX_DESCRIPTION} characters`);
    }
    if (input.instructions && input.instructions.length > MAX_INSTRUCTIONS) {
      throw new BadRequest(`Skill instructions must be under ${MAX_INSTRUCTIONS} characters`);
    }
    if (input.name && input.name.trim() !== existing.name) {
      const nameTaken = await agentSkillRepo.getByName(ctx, input.name.trim());
      if (nameTaken) throw new Conflict(`A skill named "${input.name}" already exists`);
    }
    const row = await agentSkillRepo.update(ctx, id, {
      name: input.name?.trim(),
      description: input.description?.trim(),
      instructions: input.instructions?.trim(),
    });
    if (!row) throw new NotFound("Skill not found");
    return row;
  },

  async remove(ctx: TenantContext, id: string) {
    const existing = await agentSkillRepo.getById(ctx, id);
    if (!existing) throw new NotFound("Skill not found");
    await agentSkillRepo.remove(ctx, id);
  },
};
