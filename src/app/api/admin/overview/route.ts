import { withPlatformAdmin } from "@/server/http/with-api";
import { adminRepo } from "@/server/repositories/admin.repo";

/**
 * GET /api/admin/overview — top-line KPI strip for the platform-owner
 * dashboard. Visitor traffic and real payment history land in later phases
 * (they need new tables) — until then this deliberately omits them rather
 * than sending fabricated zeros dressed up as real numbers. `currentMrrCents`
 * is the one revenue figure available now, since it's derived from live
 * subscription state rather than payment history.
 */
export const GET = withPlatformAdmin(
  async () => {
    const [signupsToday, tenantCounts, totalCandidates, currentMrrCents] = await Promise.all([
      adminRepo.signupsToday(),
      adminRepo.tenantCountsByStatus(),
      adminRepo.totalCandidates(),
      adminRepo.currentMrrCents(),
    ]);

    return {
      data: {
        signupsToday,
        activeTenants: tenantCounts.active ?? 0,
        suspendedTenants: tenantCounts.suspended ?? 0,
        totalCandidates,
        currentMrrCents,
      },
    };
  },
  { rateLimit: { limit: 60, windowSeconds: 60, keyPrefix: "admin_overview" } },
);
