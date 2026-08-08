import { and, desc, eq, ilike } from "drizzle-orm";
import { agentSkills } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";
import { isUniqueViolation } from "@/server/db/errors";
import { Conflict } from "@/server/http/errors";

export const agentSkillRepo = {
  async list(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.tenantId, ctx.tenantId))
      .orderBy(desc(agentSkills.usageCount), desc(agentSkills.createdAt));
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(agentSkills)
      .where(and(eq(agentSkills.id, id), eq(agentSkills.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  /** Case-insensitive on purpose — a chat model invoking use_skill will
   *  rarely reproduce the exact casing the skill was saved with ("Weekly
   *  Follow-up" vs "weekly follow-up"), and failing to find an obviously-
   *  matching skill over a casing difference is worse than the (very low)
   *  risk of an unintended match. The unique index behind this is also
   *  case-sensitive at the DB level, so two skills differing only in case
   *  ("Foo" and "foo") could technically both exist — getByName here
   *  returns whichever the DB happens to return first in that rare case,
   *  same tradeoff `create`'s pre-check below already accepts. */
  async getByName(ctx: TenantContext, name: string) {
    const [row] = await ctx.tx
      .select()
      .from(agentSkills)
      .where(and(eq(agentSkills.tenantId, ctx.tenantId), ilike(agentSkills.name, name)))
      .limit(1);
    return row ?? null;
  },

  async create(
    ctx: TenantContext,
    input: { name: string; description: string; instructions: string; sourceConversationId?: string },
  ) {
    try {
      const [row] = await ctx.tx
        .insert(agentSkills)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          description: input.description,
          instructions: input.instructions,
          sourceConversationId: input.sourceConversationId,
          createdBy: ctx.userId,
        })
        .returning();
      return row;
    } catch (err) {
      // Belt-and-suspenders alongside the service layer's own getByName
      // pre-check: that check has a real TOCTOU gap (two requests racing
      // to save the same skill name), and only the DB's unique index is
      // actually atomic. Converts the raw Postgres error into the same
      // Conflict the pre-check already throws, so a race loses gracefully
      // instead of surfacing a generic 500.
      if (isUniqueViolation(err)) {
        throw new Conflict(`A skill named "${input.name}" already exists`);
      }
      throw err;
    }
  },

  async update(
    ctx: TenantContext,
    id: string,
    input: { name?: string; description?: string; instructions?: string },
  ) {
    const [row] = await ctx.tx
      .update(agentSkills)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(agentSkills.id, id), eq(agentSkills.tenantId, ctx.tenantId)))
      .returning();
    return row ?? null;
  },

  async recordUsage(ctx: TenantContext, id: string) {
    const existing = await agentSkillRepo.getById(ctx, id);
    if (!existing) return;
    await ctx.tx
      .update(agentSkills)
      .set({ usageCount: existing.usageCount + 1, lastUsedAt: new Date() })
      .where(and(eq(agentSkills.id, id), eq(agentSkills.tenantId, ctx.tenantId)));
  },

  async remove(ctx: TenantContext, id: string) {
    await ctx.tx.delete(agentSkills).where(and(eq(agentSkills.id, id), eq(agentSkills.tenantId, ctx.tenantId)));
  },
};
