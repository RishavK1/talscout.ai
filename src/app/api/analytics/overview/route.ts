import { withAuth } from "@/server/http/with-api";
import { analyticsService } from "@/server/services/analytics.service";
import {
  analyticsOverviewQuerySchema,
  type AnalyticsOverviewQuery,
} from "@/server/validation/analytics";

/** GET /api/analytics/overview?days=14 — read-only outreach analytics
 *  (status totals, per-campaign breakdown, daily sent trend). Reads existing
 *  outreach tables only; never writes, never touches bulk-fire. viewer+ */
export const GET = withAuth<undefined, AnalyticsOverviewQuery>(
  async ({ ctx, query }) => {
    return {
      data: await analyticsService.overview(ctx, { days: query.days ?? 14 }),
    };
  },
  { role: "viewer", querySchema: analyticsOverviewQuerySchema },
);
