import { and, eq, ne, count, sql, isNull } from "drizzle-orm";
import { adminDb } from "@/server/db/client";
import { users, tenants } from "@/server/db/schema";
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

  /** Session bootstrap: user + its tenant in one round trip instead of the
   *  two sequential admin-pool queries `resolveSession` used to make — every
   *  authenticated request pays this, so halving the round trips here halves
   *  its baseline latency. */
  async getSessionIdentityAdmin(authUserId: string) {
    const [row] = await adminDb()
      .select({ user: users, tenant: tenants })
      .from(users)
      .innerJoin(tenants, eq(users.tenantId, tenants.id))
      .where(eq(users.authUserId, authUserId))
      .limit(1);
    return row ?? null;
  },

  /** All app-side accounts for a verified email, across every tenant, most
   *  recent first — used only for orphaned-identity recovery (see
   *  reclaim-orphaned-account.ts). Admin-scoped: an email can legitimately
   *  exist under several tenants (invited as a member elsewhere, or a prior
   *  workspace whose Supabase Auth identity was later deleted), and this
   *  runs before we know which tenant (if any) the current session belongs
   *  to. */
  async listByEmailAdmin(email: string) {
    return adminDb()
      .select()
      .from(users)
      .where(eq(users.email, email))
      .orderBy(sql`${users.createdAt} DESC`);
  },

  /** Re-point an orphaned account at a fresh Supabase Auth identity — used
   *  when the account's previous authUserId's Supabase Auth row was deleted
   *  (e.g. a manual account reset) and the same email signed back up,
   *  minting a new one. The WHERE clause requires the row's authUserId to
   *  still match what the caller last read (optimistic concurrency), so two
   *  concurrent requests racing to reclaim the same orphaned row can't both
   *  succeed — the loser gets 0 affected rows back as `null` rather than a
   *  unique-constraint error. */
  async relinkAuthUserIdAdmin(userId: string, previousAuthUserId: string, newAuthUserId: string) {
    const rows = await adminDb()
      .update(users)
      .set({ authUserId: newAuthUserId })
      .where(and(eq(users.id, userId), eq(users.authUserId, previousAuthUserId)))
      .returning();
    return rows[0] ?? null;
  },

  /** Claim a pending invite for a freshly-signed-up identity — links the
   *  invited row (authUserId NULL, status "invited") to the real auth user
   *  and activates it, so the invitee lands in the workspace that invited
   *  them instead of getting a brand-new one of their own.
   *
   *  The WHERE clause requires the row to STILL be unclaimed (same optimistic
   *  concurrency as relinkAuthUserIdAdmin above), so two concurrent signups
   *  for the same invite can't both succeed — the loser gets null back and
   *  falls through to normal provisioning rather than erroring.
   *
   *  Admin-scoped by necessity: this runs before the caller belongs to any
   *  tenant, which is precisely the tenant this invite would grant. */
  async claimInviteAdmin(email: string, authUserId: string) {
    const rows = await adminDb()
      .update(users)
      .set({ authUserId, status: "active" })
      .where(
        and(
          eq(users.email, email),
          eq(users.status, "invited"),
          isNull(users.authUserId),
        ),
      )
      .returning();
    return rows[0] ?? null;
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

  /** Re-invite a previously-removed member. `users` has a UNIQUE(tenantId,
   *  email) index with no exception for removed rows, so a bare INSERT for
   *  an email that was ever removed throws a raw unique-violation (a real
   *  bug: remove a member to free their seat, then re-invite the same email
   *  — e.g. they left and came back, or a typo'd invite got redone — and it
   *  500s instead of working). Revives the row in place instead: back to
   *  "invited" with the new role, authUserId reset to null so the standard
   *  claim-on-signup flow (claimInviteAdmin) re-links it regardless of
   *  whether this person still holds their old Supabase identity — same
   *  "revive rather than duplicate" precedent as
   *  outreach.repo.ts's sender-account reconnect path. */
  async reviveMember(ctx: TenantContext, id: string, input: { role: Role }) {
    const [row] = await ctx.tx
      .update(users)
      .set({ role: input.role, status: "invited", authUserId: null })
      .where(and(eq(users.id, id), eq(users.tenantId, ctx.tenantId)))
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
