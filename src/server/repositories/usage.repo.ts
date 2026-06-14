import { and, eq, sql } from "drizzle-orm";
import { usageCounters } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

/** First instant of the current UTC month — the quota window. */
export function currentMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export const usageRepo = {
  async getCount(
    ctx: TenantContext,
    metric: string,
    windowStart: Date,
  ): Promise<number> {
    const [row] = await ctx.tx
      .select({ count: usageCounters.count })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.tenantId, ctx.tenantId),
          eq(usageCounters.metric, metric),
          eq(usageCounters.windowStart, windowStart),
        ),
      )
      .limit(1);
    return row?.count ?? 0;
  },

  async increment(ctx: TenantContext, metric: string, windowStart: Date) {
    await ctx.tx
      .insert(usageCounters)
      .values({ tenantId: ctx.tenantId, metric, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [
          usageCounters.tenantId,
          usageCounters.metric,
          usageCounters.windowStart,
        ],
        set: { count: sql`${usageCounters.count} + 1` },
      });
  },
};
