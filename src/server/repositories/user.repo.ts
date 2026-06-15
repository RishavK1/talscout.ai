import { and, eq, ne, count } from "drizzle-orm";
import { adminDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";
import type { Role } from "@/server/auth/rbac";

/**
 * The auth bootstrap lookup runs on the ADMIN connection and is keyed strictly
 * by the verified token `sub` (globally unique authUserId) — a narrow,
 * privileged read, the only way to discover which tenant a session belongs to.
 * All other user reads are tenant-scoped (RLS-enforced) via the tx.
 */
export const userRepo = {
  async getByAuthUserIdAdmin(authUserId: string) {
    const [row] = await adminDb()
      .select()
      .from(users)
      .where(eq(users.authUserId, authUserId))
      .limit(1);
    return row ?? null;
  },

  /** Count active members of a tenant (admin path — for seat checks). */
  async countActiveByTenantAdmin(tenantId: string): Promise<number> {
    const [row] = await adminDb()
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.status, "active")));
    return row?.n ?? 0;
  },

  /** Count admins in a tenant (admin path — last-admin lockout guard). */
  async countAdminsAdmin(tenantId: string): Promise<number> {
    const [row] = await adminDb()
      .select({ n: count() })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.role, "admin"),
          eq(users.status, "active"),
        ),
      );
    return row?.n ?? 0;
  },

  /** Tenant-scoped list of members (RLS enforced via tx). */
  async listByTenant(ctx: TenantContext) {
    return ctx.tx
      .select()
      .from(users)
      .where(eq(users.tenantId, ctx.tenantId));
  },

  /** Seats consumed = members not removed (active + invited). */
  async countActiveSeats(ctx: TenantContext): Promise<number> {
    const [row] = await ctx.tx
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.tenantId, ctx.tenantId), ne(users.status, "removed")));
    return row?.n ?? 0;
  },

  async countActiveAdmins(ctx: TenantContext): Promise<number> {
    const [row] = await ctx.tx
      .select({ n: count() })
      .from(users)
      .where(
        and(
          eq(users.tenantId, ctx.tenantId),
          eq(users.role, "admin"),
          ne(users.status, "removed"),
        ),
      );
    return row?.n ?? 0;
  },

  async getByEmail(ctx: TenantContext, email: string) {
    const [row] = await ctx.tx
      .select()
      .from(users)
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.email, email)))
      .limit(1);
    return row ?? null;
  },

  async getById(ctx: TenantContext, userId: string) {
    const [row] = await ctx.tx
      .select()
      .from(users)
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.id, userId)))
      .limit(1);
    return row ?? null;
  },

  async createMember(
    ctx: TenantContext,
    input: { email: string; role: Role },
  ) {
    const [row] = await ctx.tx
      .insert(users)
      .values({
        tenantId: ctx.tenantId,
        email: input.email,
        role: input.role,
        status: "invited",
        authUserId: null,
      })
      .returning();
    return row;
  },

  async setStatus(ctx: TenantContext, userId: string, status: string) {
    const rows = await ctx.tx
      .update(users)
      .set({ status })
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.id, userId)))
      .returning({ id: users.id });
    return rows.length > 0;
  },

  async updateAvatar(ctx: TenantContext, userId: string, avatar: string | null) {
    const rows = await ctx.tx
      .update(users)
      .set({ avatar })
      .where(and(eq(users.tenantId, ctx.tenantId), eq(users.id, userId)))
      .returning({ id: users.id });
    return rows.length > 0;
  },
};
