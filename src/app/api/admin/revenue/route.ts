import { withPlatformAdmin } from "@/server/http/with-api";
import { adminRepo } from "@/server/repositories/admin.repo";

/**
 * GET /api/admin/revenue — plan distribution, signup→paid funnel, current
 * MRR, and recent churn. All derived from live `subscriptions`/`tenants`
 * state — real payment HISTORY (a graphed total-to-date) is a later phase
 * once the Stripe webhook is extended to persist actual charges; until
 * then this deliberately doesn't claim to show it.
 */
export const GET = withPlatformAdmin(
  async () => {
    const [planDistribution, subscriptionStatusCounts, mrrCents, churn] = await Promise.all([
      adminRepo.planDistribution(),
      adminRepo.subscriptionStatusCounts(),
      adminRepo.currentMrrCents(),
      adminRepo.recentChurn(10),
    ]);

    return {
      data: {
        planDistribution,
        subscriptionStatusCounts,
        currentMrrCents: mrrCents,
        recentChurn: churn,
      },
    };
  },
  { rateLimit: { limit: 60, windowSeconds: 60, keyPrefix: "admin_revenue" } },
);
