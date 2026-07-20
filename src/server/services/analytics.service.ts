import type { TenantContext } from "@/server/db/tx";
import {
  analyticsRepo,
  type StatusTotals,
  type CampaignBreakdownRow,
  type DailyPoint,
} from "@/server/repositories/analytics.repo";
import {
  automatedAnalyticsRepo,
  type AutomatedStatusTotals,
  type AutomatedCampaignBreakdownRow,
  type AutomatedDailyPoint,
} from "@/server/repositories/automated-analytics.repo";

/**
 * Read-only analytics for the outreach dashboard. Composes the aggregation
 * queries in analytics.repo and shapes them for the UI. Reads existing
 * outreach data only — no new tables, no writes, no effect on bulk-fire.
 *
 * `tracked` flags which signals are real vs. not-yet-instrumented, so the
 * frontend can render "coming soon" for open/reply/bounce-rate rather than a
 * misleading zero (static-data-audit memory).
 */

export interface AnalyticsOverview {
  totals: StatusTotals & { total: number; bounced: number };
  byCampaign: CampaignBreakdownRow[];
  daily: DailyPoint[];
  days: number;
  /** Which metrics are backed by real persisted data. */
  tracked: {
    sent: boolean;
    failed: boolean;
    skipped: boolean;
    scheduled: boolean;
    bounced: boolean;
    /** Email open/reply tracking is not instrumented yet. */
    opened: boolean;
    replied: boolean;
  };
  /** Automated-outreach campaign stats — read from separate tables, shown
   *  as its own section alongside the Bulk Fire numbers above. */
  automated: {
    totals: AutomatedStatusTotals & { total: number; noEmail: number };
    byCampaign: AutomatedCampaignBreakdownRow[];
    daily: AutomatedDailyPoint[];
  };
}

/** Pad the daily series so every day in the window has a point (0 when no
 *  sends), oldest→newest — a continuous x-axis for the trend SVG. Shared
 *  shape ({day, sent}) works for both Bulk Fire and automated-outreach
 *  series. */
function fillDailyGaps(
  rows: { day: string; sent: number }[],
  days: number,
): { day: string; sent: number }[] {
  const bySent = new Map(rows.map((r) => [r.day, r.sent]));
  const out: { day: string; sent: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: key, sent: bySent.get(key) ?? 0 });
  }
  return out;
}

export const analyticsService = {
  async overview(
    ctx: TenantContext,
    opts: { days: number },
  ): Promise<AnalyticsOverview> {
    const days = Math.min(Math.max(opts.days, 1), 90);

    const [
      totals,
      bounced,
      byCampaign,
      dailyRaw,
      automatedTotals,
      automatedNoEmail,
      automatedByCampaign,
      automatedDailyRaw,
    ] = await Promise.all([
      analyticsRepo.statusTotals(ctx),
      analyticsRepo.bouncedLeadCount(ctx),
      analyticsRepo.breakdownByCampaign(ctx),
      analyticsRepo.dailySentSeries(ctx, days),
      automatedAnalyticsRepo.statusTotals(ctx),
      automatedAnalyticsRepo.noEmailLeadCount(ctx),
      automatedAnalyticsRepo.breakdownByCampaign(ctx),
      automatedAnalyticsRepo.dailySentSeries(ctx, days),
    ]);

    const total =
      totals.scheduled + totals.sent + totals.failed + totals.skipped;
    const automatedTotal =
      automatedTotals.scheduled + automatedTotals.sent + automatedTotals.failed + automatedTotals.skipped;

    return {
      totals: { ...totals, total, bounced },
      byCampaign,
      daily: fillDailyGaps(dailyRaw, days),
      days,
      tracked: {
        sent: true,
        failed: true,
        skipped: true,
        scheduled: true,
        bounced: true,
        opened: false,
        replied: false,
      },
      automated: {
        totals: { ...automatedTotals, total: automatedTotal, noEmail: automatedNoEmail },
        byCampaign: automatedByCampaign,
        daily: fillDailyGaps(automatedDailyRaw, days),
      },
    };
  },
};
