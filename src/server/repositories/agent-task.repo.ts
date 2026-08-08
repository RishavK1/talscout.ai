import { and, desc, eq, lte } from "drizzle-orm";
import { agentTasks } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";
import { adminDb } from "@/server/db/client";

export const agentTaskRepo = {
  async list(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.tenantId, ctx.tenantId))
      .orderBy(desc(agentTasks.createdAt));
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.id, id), eq(agentTasks.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async create(
    ctx: TenantContext,
    input: {
      conversationId: string;
      instruction: string;
      schedule: string | null;
      runAt: Date | null;
      nextRunAt: Date | null;
    },
  ) {
    const [row] = await ctx.tx
      .insert(agentTasks)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId!,
        conversationId: input.conversationId,
        instruction: input.instruction,
        schedule: input.schedule,
        runAt: input.runAt,
        nextRunAt: input.nextRunAt ?? input.runAt,
      })
      .returning();
    return row;
  },

  async setStatus(ctx: TenantContext, id: string, status: "active" | "paused") {
    const [row] = await ctx.tx
      .update(agentTasks)
      .set({ status })
      .where(and(eq(agentTasks.id, id), eq(agentTasks.tenantId, ctx.tenantId)))
      .returning();
    return row ?? null;
  },

  async remove(ctx: TenantContext, id: string) {
    await ctx.tx.delete(agentTasks).where(and(eq(agentTasks.id, id), eq(agentTasks.tenantId, ctx.tenantId)));
  },

  /** Cross-tenant sweep for the cron job — same "admin connection, outside
   *  any specific tenant's request" posture as
   *  automatedCampaignRepo.listActiveAdmin(). `nextRunAt` is always
   *  populated at creation time regardless of task type (set to `runAt`
   *  itself for one-offs, computed from `schedule` for recurring — see
   *  agentTasksService.create), so a single due-check covers both. */
  async listDueAdmin() {
    return await adminDb()
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.status, "active"), lte(agentTasks.nextRunAt, new Date())));
  },

  async getByIdAdmin(id: string) {
    const [row] = await adminDb().select().from(agentTasks).where(eq(agentTasks.id, id)).limit(1);
    return row ?? null;
  },

  async recordRunAdmin(id: string, input: { nextRunAt: Date | null; status: "active" | "paused" | "done" }) {
    await adminDb()
      .update(agentTasks)
      .set({ lastRunAt: new Date(), nextRunAt: input.nextRunAt, status: input.status, lastError: null })
      .where(eq(agentTasks.id, id));
  },

  async setErrorAdmin(id: string, message: string) {
    await adminDb()
      .update(agentTasks)
      .set({ status: "error", lastError: message, lastRunAt: new Date() })
      .where(eq(agentTasks.id, id));
  },
};
