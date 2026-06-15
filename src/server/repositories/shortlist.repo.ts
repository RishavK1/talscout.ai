import { db } from "../db/client";
import { shortlists, shortlistItems } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import type { TenantContext } from "../db/tx";

export const shortlistRepo = {
  async getByTenant(ctx: TenantContext) {
    return await db()
      .select({
        id: shortlists.id,
        name: shortlists.name,
        createdAt: shortlists.createdAt,
        candidateCount: sql<number>`count(${shortlistItems.id})::int`,
        lastUpdated: sql<Date>`max(coalesce(${shortlistItems.addedAt}, ${shortlists.createdAt}))`,
      })
      .from(shortlists)
      .leftJoin(shortlistItems, eq(shortlists.id, shortlistItems.shortlistId))
      .where(eq(shortlists.tenantId, ctx.tenantId))
      .groupBy(shortlists.id)
      .orderBy(sql`${shortlists.createdAt} DESC`);
  },
  
  async create(ctx: TenantContext, name: string) {
    const [inserted] = await db().insert(shortlists).values({
      tenantId: ctx.tenantId,
      name,
      createdBy: ctx.userId,
    }).returning();
    return inserted;
  }
};
