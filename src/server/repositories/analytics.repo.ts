import { and, eq, or, sql, gte, inArray, isNotNull } from "drizzle-orm";
import {
  outreachCampaigns,
  outreachLeads,
  outreachSends,
} from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

/**
 * Read-only aggregates over the EXISTING outreach tables for the analytics
 * dashboard. Never writes; never touches bulk-fire behavior. Mirrors the
 * `count(*)::int` + `.groupBy()` idiom already used by
 * outreach.repo.ts's `countsByCampaign` / `stepSummaryByCampaign`.
 *
 * Only signals we actually persist are aggregated here:
 *  - send status: scheduled | sent | failed | skipped (outreachSendStatus)
 *  - lead-level bounced (outreachLeadStatus has `bounced`)
 * Email open/reply are NOT tracked in the schema today, so they are not
 * produced here — the frontend labels them "coming soon" rather than showing
 * a fabricated zero (see the static-data-audit memory).
 */

export type SendStatus = "scheduled" | "sent" | "failed" | "skipped";

export interface StatusTotals {
  scheduled: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface CampaignBreakdownRow extends StatusTotals {
  campaignId: string;
  campaignName: string;
  status: string;
  bounced: number;
}

export interface DailyPoint {
  /** ISO date (YYYY-MM-DD) of the send day, tenant server tz. */
  day: string;
  sent: number;
}

const EMPTY_TOTALS = (): StatusTotals => ({
  scheduled: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
});

export const analyticsRepo = {
  /** Tenant-wide send-status totals across all email campaigns. */
  async statusTotals(ctx: TenantContext): Promise<StatusTotals> {
    const rows = await ctx.tx
      .select({
        status: outreachSends.status,
        count: sql<number>`count(*)::int`,
      })
      .from(outreachSends)
      .where(eq(outreachSends.tenantId, ctx.tenantId))
      .groupBy(outreachSends.status);

    const totals = EMPTY_TOTALS();
    for (const row of rows) totals[row.status as SendStatus] = row.count;
    return totals;
  },

  /** Tenant-wide count of leads marked bounced — the one delivery-failure
   *  signal we actually persist (outreachLeadStatus). */
  async bouncedLeadCount(ctx: TenantContext): Promise<number> {
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachLeads)
      .where(
        and(
          eq(outreachLeads.tenantId, ctx.tenantId),
          eq(outreachLeads.status, "bounced"),
        ),
      );
    return row?.count ?? 0;
  },

  /** Tenant-wide count of leads whose Gmail thread showed a reply —
   *  poll-outreach-replies.ts sets this status once a reply is detected. */
  async repliedLeadCount(ctx: TenantContext): Promise<number> {
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachLeads)
      .where(
        and(
          eq(outreachLeads.tenantId, ctx.tenantId),
          eq(outreachLeads.status, "replied"),
        ),
      );
    return row?.count ?? 0;
  },

  /** Tenant-wide count of "opened" sends across both real signals we have:
   *  the tracking-pixel fetch (email) and the WhatsApp webhook's "read"
   *  delivery status — one number, since the frontend shows a single
   *  channel-agnostic "Opened" stat. */
  async openedSendCount(ctx: TenantContext): Promise<number> {
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachSends)
      .where(
        and(
          eq(outreachSends.tenantId, ctx.tenantId),
          or(isNotNull(outreachSends.openedAt), eq(outreachSends.deliveryStatus, "read")),
        ),
      );
    return row?.count ?? 0;
  },

  /** Per-campaign send-status breakdown (email campaigns only), newest first.
   *  One round trip for send counts, one for bounced leads, joined in memory. */
  async breakdownByCampaign(
    ctx: TenantContext,
  ): Promise<CampaignBreakdownRow[]> {
    const campaigns = await ctx.tx
      .select({
        id: outreachCampaigns.id,
        name: outreachCampaigns.name,
        status: outreachCampaigns.status,
        createdAt: outreachCampaigns.createdAt,
      })
      .from(outreachCampaigns)
      .where(
        and(
          eq(outreachCampaigns.tenantId, ctx.tenantId),
          eq(outreachCampaigns.channel, "email"),
        ),
      );
    if (campaigns.length === 0) return [];

    const campaignIds = campaigns.map((c) => c.id);

    const sendRows = await ctx.tx
      .select({
        campaignId: outreachSends.campaignId,
        status: outreachSends.status,
        count: sql<number>`count(*)::int`,
      })
      .from(outreachSends)
      .where(
        and(
          eq(outreachSends.tenantId, ctx.tenantId),
          inArray(outreachSends.campaignId, campaignIds),
        ),
      )
      .groupBy(outreachSends.campaignId, outreachSends.status);

    const bouncedRows = await ctx.tx
      .select({
        campaignId: outreachLeads.campaignId,
        count: sql<number>`count(*)::int`,
      })
      .from(outreachLeads)
      .where(
        and(
          eq(outreachLeads.tenantId, ctx.tenantId),
          inArray(outreachLeads.campaignId, campaignIds),
          eq(outreachLeads.status, "bounced"),
        ),
      )
      .groupBy(outreachLeads.campaignId);

    const totalsByCampaign = new Map<string, StatusTotals>();
    for (const row of sendRows) {
      const t = totalsByCampaign.get(row.campaignId) ?? EMPTY_TOTALS();
      t[row.status as SendStatus] = row.count;
      totalsByCampaign.set(row.campaignId, t);
    }
    const bouncedByCampaign = new Map(
      bouncedRows.map((r) => [r.campaignId, r.count]),
    );

    return campaigns
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((c) => ({
        campaignId: c.id,
        campaignName: c.name,
        status: c.status,
        ...(totalsByCampaign.get(c.id) ?? EMPTY_TOTALS()),
        bounced: bouncedByCampaign.get(c.id) ?? 0,
      }));
  },

  /** Daily count of SENT emails over the last `days` days, oldest→newest.
   *  Only rows with a real `sentAt` count — scheduled-but-unsent future
   *  cascade rows must not inflate the trend. Gaps (days with no sends) are
   *  filled in by the service so the SVG trend has a continuous x-axis. */
  async dailySentSeries(
    ctx: TenantContext,
    days: number,
  ): Promise<DailyPoint[]> {
    const rows = await ctx.tx
      .select({
        day: sql<string>`to_char(date_trunc('day', ${outreachSends.sentAt}), 'YYYY-MM-DD')`,
        sent: sql<number>`count(*)::int`,
      })
      .from(outreachSends)
      .where(
        and(
          eq(outreachSends.tenantId, ctx.tenantId),
          eq(outreachSends.status, "sent"),
          sql`${outreachSends.sentAt} is not null`,
          gte(
            outreachSends.sentAt,
            sql`date_trunc('day', now()) - make_interval(days => ${days - 1})`,
          ),
        ),
      )
      .groupBy(sql`date_trunc('day', ${outreachSends.sentAt})`)
      .orderBy(sql`date_trunc('day', ${outreachSends.sentAt})`);
    return rows;
  },
};
