import { db } from "../db/client";
import { shortlists, shortlistItems, candidates } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
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
  },

  async getById(ctx: TenantContext, shortlistId: string) {
    const [row] = await db()
      .select({ id: shortlists.id, name: shortlists.name, createdAt: shortlists.createdAt })
      .from(shortlists)
      .where(and(eq(shortlists.id, shortlistId), eq(shortlists.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async getCandidates(ctx: TenantContext, shortlistId: string) {
    return await db()
      .select({
        id: candidates.id,
        fullName: candidates.fullName,
        emails: candidates.emails,
        currentTitle: candidates.currentTitle,
        location: candidates.location,
        yearsExperience: candidates.yearsExperience,
        skills: candidates.skills,
        status: candidates.status,
        addedAt: shortlistItems.addedAt,
      })
      .from(shortlistItems)
      .innerJoin(candidates, eq(shortlistItems.candidateId, candidates.id))
      .where(
        and(
          eq(shortlistItems.shortlistId, shortlistId),
          eq(shortlistItems.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(sql`${shortlistItems.addedAt} DESC`);
  },

  async removeItem(ctx: TenantContext, shortlistId: string, candidateId: string) {
    const deleted = await db()
      .delete(shortlistItems)
      .where(
        and(
          eq(shortlistItems.shortlistId, shortlistId),
          eq(shortlistItems.candidateId, candidateId),
          eq(shortlistItems.tenantId, ctx.tenantId),
        ),
      )
      .returning({ id: shortlistItems.id });
    return deleted.length > 0;
  },
};
