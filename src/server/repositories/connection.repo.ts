import { and, eq, sql } from "drizzle-orm";
import { toolkitConnections } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

export const connectionRepo = {
  async list(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(toolkitConnections)
      .where(eq(toolkitConnections.tenantId, ctx.tenantId))
      .orderBy(sql`${toolkitConnections.createdAt} DESC`);
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(toolkitConnections)
      .where(and(eq(toolkitConnections.id, id), eq(toolkitConnections.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async create(
    ctx: TenantContext,
    input: { toolkitSlug: string; composioConnectionId: string; createdBy?: string },
  ) {
    const [row] = await ctx.tx
      .insert(toolkitConnections)
      .values({
        tenantId: ctx.tenantId,
        toolkitSlug: input.toolkitSlug,
        composioConnectionId: input.composioConnectionId,
        createdBy: input.createdBy,
        status: "pending",
      })
      .returning();
    return row;
  },

  async updateStatus(
    ctx: TenantContext,
    composioConnectionId: string,
    fields: { status: "active" | "pending" | "expired" | "revoked"; accountLabel: string | null },
  ) {
    const [row] = await ctx.tx
      .update(toolkitConnections)
      .set({ status: fields.status, accountLabel: fields.accountLabel, updatedAt: new Date() })
      .where(
        and(
          eq(toolkitConnections.tenantId, ctx.tenantId),
          eq(toolkitConnections.composioConnectionId, composioConnectionId),
        ),
      )
      .returning();
    return row ?? null;
  },

  async delete(ctx: TenantContext, id: string) {
    await ctx.tx
      .delete(toolkitConnections)
      .where(and(eq(toolkitConnections.id, id), eq(toolkitConnections.tenantId, ctx.tenantId)));
  },
};
