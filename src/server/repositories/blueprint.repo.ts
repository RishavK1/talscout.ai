import { and, eq, isNull, sql } from "drizzle-orm";
import { blueprints } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";
import type {
  BlueprintSections,
  BlueprintIntakeAnswers,
} from "@/server/ports";

/**
 * Tenant-scoped data access for blueprints. Same idioms as outreach.repo.ts:
 * plain object literal, `ctx: TenantContext` first arg, explicit
 * `eq(tenantId)` filters on every query (belt-and-suspenders alongside RLS),
 * soft-delete via `deletedAt`. jsonb columns are cast to the port types on the
 * way out so callers get a typed `sections` / `intakeAnswers`.
 */

export type BlueprintStatus = "draft" | "active" | "archived";

export interface BlueprintCreateInput {
  name: string;
  websiteUrl?: string | null;
  intakeAnswers?: BlueprintIntakeAnswers | null;
}

export interface BlueprintUpdateInput {
  name?: string;
  websiteUrl?: string | null;
  status?: BlueprintStatus;
  sections?: BlueprintSections | null;
  intakeAnswers?: BlueprintIntakeAnswers | null;
}

export const blueprintRepo = {
  async list(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(blueprints)
      .where(
        and(eq(blueprints.tenantId, ctx.tenantId), isNull(blueprints.deletedAt)),
      )
      .orderBy(sql`${blueprints.createdAt} DESC`);
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(blueprints)
      .where(
        and(
          eq(blueprints.id, id),
          eq(blueprints.tenantId, ctx.tenantId),
          isNull(blueprints.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /** Case-insensitive name lookup among live rows — used to reject a
   *  duplicate name before hitting the unique index (friendlier error). */
  async findByName(ctx: TenantContext, name: string) {
    const [row] = await ctx.tx
      .select()
      .from(blueprints)
      .where(
        and(
          eq(blueprints.tenantId, ctx.tenantId),
          isNull(blueprints.deletedAt),
          sql`lower(${blueprints.name}) = lower(${name})`,
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async create(ctx: TenantContext, input: BlueprintCreateInput) {
    const [row] = await ctx.tx
      .insert(blueprints)
      .values({
        tenantId: ctx.tenantId,
        createdBy: ctx.userId ?? null,
        name: input.name,
        websiteUrl: input.websiteUrl ?? null,
        intakeAnswers: input.intakeAnswers ?? null,
        status: "draft",
      })
      .returning();
    return row;
  },

  async update(ctx: TenantContext, id: string, input: BlueprintUpdateInput) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.websiteUrl !== undefined) patch.websiteUrl = input.websiteUrl;
    if (input.status !== undefined) patch.status = input.status;
    if (input.sections !== undefined) patch.sections = input.sections;
    if (input.intakeAnswers !== undefined) patch.intakeAnswers = input.intakeAnswers;

    const [row] = await ctx.tx
      .update(blueprints)
      .set(patch)
      .where(
        and(
          eq(blueprints.id, id),
          eq(blueprints.tenantId, ctx.tenantId),
          isNull(blueprints.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  },

  /** Soft-delete: keeps the row (and any downstream references) intact while
   *  hiding it from every list/get path. */
  async softDelete(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .update(blueprints)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(blueprints.id, id),
          eq(blueprints.tenantId, ctx.tenantId),
          isNull(blueprints.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  },

  /** Transaction-scoped advisory lock keyed on this blueprint's id — held by
   *  BOTH the delete guard (blueprintService.remove, which counts linked
   *  campaigns before soft-deleting) and campaign creation
   *  (assertBlueprintUsable), so the two can never interleave: whichever
   *  transaction acquires it first fully completes its check-then-write
   *  before the other proceeds. Without this, a campaign could be created
   *  against a blueprint in the split second between the delete guard's
   *  count coming back empty and the soft-delete actually committing.
   *  Same `pg_advisory_xact_lock` idiom as
   *  automated-outreach.service.ts's per-tenant daily-cap lock — auto-
   *  released when ctx.tx commits/rolls back, no manual unlock needed. */
  async lockForWrite(ctx: TenantContext, id: string) {
    await ctx.tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id} || ':blueprint-write'))`);
  },
};
