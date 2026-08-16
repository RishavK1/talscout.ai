import { desc, eq, gte, inArray, sql } from "drizzle-orm";
import { adminDb } from "@/server/db/client";
import {
  tenants,
  users,
  candidates,
  subscriptions,
  agentConversations,
  agentMessages,
  agentTasks,
  auditLogs,
} from "@/server/db/schema";
import { PLAN_PRICES } from "@/server/validation/billing";

export interface TenantListRow {
  id: string;
  name: string;
  plan: string;
  seatLimit: number;
  status: string;
  createdAt: Date;
  ownerEmail: string | null;
}

export interface ChurnRow {
  tenantId: string;
  tenantName: string;
  plan: string;
  canceledAt: Date;
}

/**
 * Cross-tenant reads for the platform-owner-only /admin dashboard. Always
 * uses adminDb() (RLS-exempt owner connection) — never ctx.tx, since these
 * queries deliberately span every tenant. Only ever called from routes
 * behind withPlatformAdmin (see server/http/with-api.ts); never from a
 * tenant-facing route.
 */
export const adminRepo = {
  /** New tenant signups today (server-tz midnight to now). */
  async signupsToday(): Promise<number> {
    const [row] = await adminDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(tenants)
      .where(gte(tenants.createdAt, sql`date_trunc('day', now())`));
    return row?.count ?? 0;
  },

  /** Total tenants by status — { active: n, suspended: n }. */
  async tenantCountsByStatus(): Promise<Record<string, number>> {
    const rows = await adminDb()
      .select({ status: tenants.status, count: sql<number>`count(*)::int` })
      .from(tenants)
      .groupBy(tenants.status);
    const totals: Record<string, number> = {};
    for (const row of rows) totals[row.status] = row.count;
    return totals;
  },

  /** Candidates processed platform-wide, across every tenant. */
  async totalCandidates(): Promise<number> {
    const [row] = await adminDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates);
    return row?.count ?? 0;
  },

  /** Tenants active right now (the denominator for most other ratios). */
  async activeTenantCount(): Promise<number> {
    const [row] = await adminDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(tenants)
      .where(eq(tenants.status, "active"));
    return row?.count ?? 0;
  },

  /** Daily count of new tenant signups over the last `days` days,
   *  oldest→newest. Mirrors analyticsRepo.dailySentSeries's idiom exactly.
   *  Gaps (days with zero signups) are filled by the service, not here. */
  async signupsDailySeries(days: number): Promise<{ day: string; value: number }[]> {
    const rows = await adminDb()
      .select({
        day: sql<string>`to_char(date_trunc('day', ${tenants.createdAt}), 'YYYY-MM-DD')`,
        value: sql<number>`count(*)::int`,
      })
      .from(tenants)
      .where(
        gte(
          tenants.createdAt,
          sql`date_trunc('day', now()) - make_interval(days => ${days - 1})`,
        ),
      )
      .groupBy(sql`date_trunc('day', ${tenants.createdAt})`)
      .orderBy(sql`date_trunc('day', ${tenants.createdAt})`);
    return rows;
  },

  /** Recent tenants, newest first, each with its earliest (signup) user's
   *  email as "owner". Filters by status and a free-text match on tenant
   *  name or owner email. Tenant volume for this app is small enough that
   *  filtering/paginating this join in memory (rather than a correlated
   *  subquery) is the simpler, equally-correct choice — same "two round
   *  trips, join in memory" idiom analyticsRepo.breakdownByCampaign uses. */
  async recentTenants(args: {
    status?: "active" | "suspended";
    q?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: TenantListRow[]; total: number }> {
    const allTenants = await adminDb()
      .select({
        id: tenants.id,
        name: tenants.name,
        plan: tenants.plan,
        seatLimit: tenants.seatLimit,
        status: tenants.status,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(args.status ? eq(tenants.status, args.status) : undefined)
      .orderBy(desc(tenants.createdAt));

    if (allTenants.length === 0) return { rows: [], total: 0 };

    const tenantIds = allTenants.map((t) => t.id);
    const ownerRows = await adminDb()
      .select({ tenantId: users.tenantId, email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(inArray(users.tenantId, tenantIds))
      .orderBy(users.createdAt);
    const ownerByTenant = new Map<string, string>();
    for (const row of ownerRows) {
      if (!ownerByTenant.has(row.tenantId)) ownerByTenant.set(row.tenantId, row.email);
    }

    const joined: TenantListRow[] = allTenants.map((t) => ({
      ...t,
      ownerEmail: ownerByTenant.get(t.id) ?? null,
    }));

    const q = args.q?.trim().toLowerCase();
    const filtered = q
      ? joined.filter(
          (t) => t.name.toLowerCase().includes(q) || t.ownerEmail?.toLowerCase().includes(q),
        )
      : joined;

    return {
      rows: filtered.slice(args.offset, args.offset + args.limit),
      total: filtered.length,
    };
  },

  /** The real suspend/reactivate action — sets `tenants.status` for the
   *  first time anywhere in this codebase (see session.ts's enforcement,
   *  which has always been live with nothing to trigger it). Recorded in
   *  the SAME auditLogs table tenant-scoped actions use — there's no
   *  TenantContext here (this isn't a tenant session), so it's written
   *  directly via adminDb() rather than through auditRepo.log(). */
  async setTenantStatus(
    tenantId: string,
    status: "active" | "suspended",
    actingPlatformAdminEmail: string,
  ) {
    return adminDb().transaction(async (tx) => {
      const [before] = await tx.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId));
      const [row] = await tx
        .update(tenants)
        .set({ status, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId))
        .returning();
      if (row) {
        await tx.insert(auditLogs).values({
          tenantId,
          actorUserId: null,
          action: status === "suspended" ? "platform_admin.tenant_suspended" : "platform_admin.tenant_reactivated",
          targetType: "tenant",
          targetId: tenantId,
          metadata: { platformAdminEmail: actingPlatformAdminEmail, previousStatus: before?.status ?? null },
        });
      }
      return row ?? null;
    });
  },

  /** Tenant count per plan tier. */
  async planDistribution(): Promise<{ plan: string; count: number }[]> {
    return adminDb()
      .select({ plan: tenants.plan, count: sql<number>`count(*)::int` })
      .from(tenants)
      .groupBy(tenants.plan);
  },

  /** Subscription counts by status — covers the signup→paid funnel
   *  (trialing/active/past_due vs. never-converted) and doubles as the
   *  churn denominator (canceled). */
  async subscriptionStatusCounts(): Promise<Record<string, number>> {
    const rows = await adminDb()
      .select({ status: subscriptions.status, count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .groupBy(subscriptions.status);
    const totals: Record<string, number> = {};
    for (const row of rows) totals[row.status] = row.count;
    return totals;
  },

  /** Current MRR from live active/trialing subscriptions — seats × the
   *  server price book (subscriptions doesn't store plan; tenants does,
   *  kept in sync by the Stripe webhook, so join on that). Cents. */
  async currentMrrCents(): Promise<number> {
    const rows = await adminDb()
      .select({ seats: subscriptions.seats, plan: tenants.plan })
      .from(subscriptions)
      .innerJoin(tenants, eq(subscriptions.tenantId, tenants.id))
      .where(inArray(subscriptions.status, ["active", "trialing"]));
    return rows.reduce((sum, r) => sum + r.seats * (PLAN_PRICES[r.plan] ?? 0), 0);
  },

  /** Most recently canceled subscriptions, newest first. */
  async recentChurn(limit: number): Promise<ChurnRow[]> {
    const rows = await adminDb()
      .select({
        tenantId: subscriptions.tenantId,
        tenantName: tenants.name,
        plan: tenants.plan,
        canceledAt: subscriptions.updatedAt,
      })
      .from(subscriptions)
      .innerJoin(tenants, eq(subscriptions.tenantId, tenants.id))
      .where(eq(subscriptions.status, "canceled"))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(limit);
    return rows;
  },

  /** AI Agent adoption — total conversations/messages ever, and tasks
   *  currently scheduled (status='active'), across every tenant. */
  async agentAdoption(): Promise<{ conversations: number; messages: number; activeTasks: number }> {
    const [[conv], [msg], [tasks]] = await Promise.all([
      adminDb().select({ count: sql<number>`count(*)::int` }).from(agentConversations),
      adminDb().select({ count: sql<number>`count(*)::int` }).from(agentMessages),
      adminDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(agentTasks)
        .where(eq(agentTasks.status, "active")),
    ]);
    return {
      conversations: conv?.count ?? 0,
      messages: msg?.count ?? 0,
      activeTasks: tasks?.count ?? 0,
    };
  },
};
