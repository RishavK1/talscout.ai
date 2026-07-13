import { shortlists, shortlistItems, candidates } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { TenantContext } from "../db/tx";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function clampOffset(offset?: number): number {
  if (offset == null || Number.isNaN(offset) || offset < 0) return 0;
  return Math.trunc(offset);
}

export const shortlistRepo = {
  async getByTenant(ctx: TenantContext, params: { limit?: number; offset?: number } = {}) {
    const limit = clampLimit(params.limit);
    const offset = clampOffset(params.offset);
    return await ctx.tx
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
      .orderBy(sql`${shortlists.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
  },

  async countByTenant(ctx: TenantContext) {
    const [row] = await ctx.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(shortlists)
      .where(eq(shortlists.tenantId, ctx.tenantId));
    return row?.n ?? 0;
  },

  async create(ctx: TenantContext, name: string) {
    const [inserted] = await ctx.tx.insert(shortlists).values({
      tenantId: ctx.tenantId,
      name,
      createdBy: ctx.userId,
    }).returning();
    return inserted;
  },

  async getById(ctx: TenantContext, shortlistId: string) {
    const [row] = await ctx.tx
      .select({ id: shortlists.id, name: shortlists.name, createdAt: shortlists.createdAt })
      .from(shortlists)
      .where(and(eq(shortlists.id, shortlistId), eq(shortlists.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async getCandidates(ctx: TenantContext, shortlistId: string) {
    return await ctx.tx
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
    const deleted = await ctx.tx
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

  async addItem(ctx: TenantContext, shortlistId: string, candidateId: string) {
    const [inserted] = await ctx.tx
      .insert(shortlistItems)
      .values({
        tenantId: ctx.tenantId,
        shortlistId,
        candidateId,
      })
      .returning();
    return inserted;
  },

  async getExistingItem(ctx: TenantContext, shortlistId: string, candidateId: string) {
    const [row] = await ctx.tx
      .select()
      .from(shortlistItems)
      .where(
        and(
          eq(shortlistItems.tenantId, ctx.tenantId),
          eq(shortlistItems.shortlistId, shortlistId),
          eq(shortlistItems.candidateId, candidateId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async getCandidateById(ctx: TenantContext, candidateId: string) {
    const [row] = await ctx.tx
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    return row ?? null;
  },
};
