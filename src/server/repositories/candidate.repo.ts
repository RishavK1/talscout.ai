import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  or,
  sql,
  isNotNull,
  arrayContains,
  cosineDistance,
  getTableColumns,
} from "drizzle-orm";
import { candidates } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

export interface SearchParams {
  queryVector?: number[];
  limit?: number;
  location?: string;
  minExperience?: number;
  skills?: string[];
}

export type CandidateStatus = "processing" | "ready" | "error";

export interface CreateCandidateInput {
  status?: CandidateStatus;
  fullName?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  location?: string | null;
  currentTitle?: string | null;
  yearsExperience?: number | string | null;
  skills?: string[] | null;
  workHistory?: unknown;
  education?: unknown;
  certifications?: string[] | null;
  summary?: string | null;
  embedding?: number[] | null;
}

export interface ListCandidatesParams {
  limit?: number;
  offset?: number;
  status?: CandidateStatus;
  q?: string;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Every method takes the TenantContext. RLS already restricts rows to the
 * tenant, but we ALSO filter/insert with the tenant id explicitly
 * (belt-and-suspenders, layer 3) and to keep queries index-friendly.
 */
export const candidateRepo = {
  async create(ctx: TenantContext, input: CreateCandidateInput) {
    const [row] = await ctx.tx
      .insert(candidates)
      .values({
        tenantId: ctx.tenantId,
        status: input.status ?? "processing",
        fullName: input.fullName ?? null,
        emails: input.emails ?? null,
        phones: input.phones ?? null,
        location: input.location ?? null,
        currentTitle: input.currentTitle ?? null,
        yearsExperience:
          input.yearsExperience == null ? null : String(input.yearsExperience),
        skills: input.skills ?? null,
        workHistory: input.workHistory ?? null,
        education: input.education ?? null,
        certifications: input.certifications ?? null,
        summary: input.summary ?? null,
        embedding: input.embedding ?? null,
        createdBy: ctx.userId ?? null,
      })
      .returning();
    return row;
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(candidates)
      .where(and(eq(candidates.tenantId, ctx.tenantId), eq(candidates.id, id)))
      .limit(1);
    return row ?? null;
  },

  async list(ctx: TenantContext, params: ListCandidatesParams = {}) {
    const limit = clampLimit(params.limit);
    const offset = clampOffset(params.offset);

    const filters = [eq(candidates.tenantId, ctx.tenantId)];
    if (params.status) filters.push(eq(candidates.status, params.status));
    if (params.q && params.q.trim()) {
      const term = `%${params.q.trim()}%`;
      const match = or(
        ilike(candidates.fullName, term),
        ilike(candidates.currentTitle, term),
        ilike(candidates.location, term),
      );
      if (match) filters.push(match);
    }

    const rows = await ctx.tx
      .select()
      .from(candidates)
      .where(and(...filters))
      // stable ordering with a tiebreak so pages don't drift (PAGE-05)
      .orderBy(desc(candidates.createdAt), asc(candidates.id))
      .limit(limit)
      .offset(offset);

    return { rows, limit, offset };
  },

  async count(ctx: TenantContext, params: ListCandidatesParams = {}) {
    const filters = [eq(candidates.tenantId, ctx.tenantId)];
    if (params.status) filters.push(eq(candidates.status, params.status));
    const [row] = await ctx.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(candidates)
      .where(and(...filters));
    return row?.n ?? 0;
  },

  async update(
    ctx: TenantContext,
    id: string,
    patch: Partial<CreateCandidateInput> & { errorReason?: string | null },
  ) {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      values[k] = k === "yearsExperience" && v != null ? String(v) : v;
    }
    const [row] = await ctx.tx
      .update(candidates)
      .set(values)
      .where(and(eq(candidates.tenantId, ctx.tenantId), eq(candidates.id, id)))
      .returning();
    return row ?? null;
  },

  async remove(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await ctx.tx
      .delete(candidates)
      .where(and(eq(candidates.tenantId, ctx.tenantId), eq(candidates.id, id)))
      .returning({ id: candidates.id });
    return rows.length > 0;
  },

  /**
   * Hybrid search: vector similarity (when a query vector is given) combined
   * with hard filters. Always scoped to the tenant + only `ready` candidates
   * with an embedding (SRCH-04). The big embedding column is never returned.
   */
  async search(ctx: TenantContext, params: SearchParams) {
    const limit = clampLimit(params.limit);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { embedding, ...cols } = getTableColumns(candidates);

    const conds = [
      eq(candidates.tenantId, ctx.tenantId),
      eq(candidates.status, "ready"),
    ];
    if (params.location) {
      conds.push(ilike(candidates.location, `%${params.location}%`));
    }
    if (params.minExperience != null) {
      conds.push(gte(candidates.yearsExperience, String(params.minExperience)));
    }
    if (params.skills && params.skills.length > 0) {
      conds.push(arrayContains(candidates.skills, params.skills));
    }

    if (!params.queryVector) {
      // No semantic query → most recent ready candidates (SRCH-01 fallback).
      return ctx.tx
        .select({ ...cols, score: sql<number | null>`null` })
        .from(candidates)
        .where(and(...conds))
        .orderBy(desc(candidates.createdAt), asc(candidates.id))
        .limit(limit);
    }

    conds.push(isNotNull(candidates.embedding));
    const distance = cosineDistance(candidates.embedding, params.queryVector);
    return ctx.tx
      .select({ ...cols, score: sql<number>`1 - (${distance})` })
      .from(candidates)
      .where(and(...conds))
      .orderBy(distance, asc(candidates.id)) // closest first, stable tiebreak
      .limit(limit);
  },
};

export function clampLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

export function clampOffset(offset?: number): number {
  if (offset == null || Number.isNaN(offset) || offset < 0) return 0;
  return Math.trunc(offset);
}
