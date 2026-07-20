import { and, eq, sql, gte, inArray } from "drizzle-orm";
import { automatedCampaigns, automatedLeads, automatedSends } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

/**
 * Read-only aggregates over the automated-outreach tables, for the Analytics
 * page's "Automated Outreach" section — kept in its OWN file (not appended
 * to analytics.repo.ts) so a diff on "did this touch bulk-fire's analytics
 * queries" is trivially empty. Same count(*)::int + groupBy idiom as
 * analytics.repo.ts.
 */

export type AutomatedSendStatus = "scheduled" | "sent" | "failed" | "skipped";

export interface AutomatedStatusTotals {
  scheduled: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface AutomatedCampaignBreakdownRow extends AutomatedStatusTotals {
  campaignId: string;
  campaignName: string;
  status: string;
  noEmail: number;
}

export interface AutomatedDailyPoint {
  day: string;
  sent: number;
}

const EMPTY_TOTALS = (): AutomatedStatusTotals => ({
  scheduled: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
});

export const automatedAnalyticsRepo = {
  async statusTotals(ctx: TenantContext): Promise<AutomatedStatusTotals> {
    const rows = await ctx.tx
      .select({ status: automatedSends.status, count: sql<number>`count(*)::int` })
      .from(automatedSends)
      .where(eq(automatedSends.tenantId, ctx.tenantId))
      .groupBy(automatedSends.status);

    const totals = EMPTY_TOTALS();
    for (const row of rows) totals[row.status as AutomatedSendStatus] = row.count;
    return totals;
  },

  /** Leads discovered but never sent to because no email was findable — the
   *  analogue of "bounced" for this feature (a real, persisted signal). */
  async noEmailLeadCount(ctx: TenantContext): Promise<number> {
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(automatedLeads)
      .where(and(eq(automatedLeads.tenantId, ctx.tenantId), eq(automatedLeads.status, "no_email")));
    return row?.count ?? 0;
  },

  async breakdownByCampaign(ctx: TenantContext): Promise<AutomatedCampaignBreakdownRow[]> {
    const campaigns = await ctx.tx
      .select({
        id: automatedCampaigns.id,
        name: automatedCampaigns.name,
        status: automatedCampaigns.status,
        createdAt: automatedCampaigns.createdAt,
      })
      .from(automatedCampaigns)
      .where(eq(automatedCampaigns.tenantId, ctx.tenantId));
    if (campaigns.length === 0) return [];

    const campaignIds = campaigns.map((c) => c.id);

    const sendRows = await ctx.tx
      .select({
        campaignId: automatedSends.campaignId,
        status: automatedSends.status,
        count: sql<number>`count(*)::int`,
      })
      .from(automatedSends)
      .where(
        and(eq(automatedSends.tenantId, ctx.tenantId), inArray(automatedSends.campaignId, campaignIds)),
      )
      .groupBy(automatedSends.campaignId, automatedSends.status);

    const noEmailRows = await ctx.tx
      .select({ campaignId: automatedLeads.campaignId, count: sql<number>`count(*)::int` })
      .from(automatedLeads)
      .where(
        and(
          eq(automatedLeads.tenantId, ctx.tenantId),
          inArray(automatedLeads.campaignId, campaignIds),
          eq(automatedLeads.status, "no_email"),
        ),
      )
      .groupBy(automatedLeads.campaignId);

    const totalsByCampaign = new Map<string, AutomatedStatusTotals>();
    for (const row of sendRows) {
      const t = totalsByCampaign.get(row.campaignId) ?? EMPTY_TOTALS();
      t[row.status as AutomatedSendStatus] = row.count;
      totalsByCampaign.set(row.campaignId, t);
    }
    const noEmailByCampaign = new Map(noEmailRows.map((r) => [r.campaignId, r.count]));

    return campaigns
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((c) => ({
        campaignId: c.id,
        campaignName: c.name,
        status: c.status,
        ...(totalsByCampaign.get(c.id) ?? EMPTY_TOTALS()),
        noEmail: noEmailByCampaign.get(c.id) ?? 0,
      }));
  },

  async dailySentSeries(ctx: TenantContext, days: number): Promise<AutomatedDailyPoint[]> {
    const rows = await ctx.tx
      .select({
        day: sql<string>`to_char(date_trunc('day', ${automatedSends.sentAt}), 'YYYY-MM-DD')`,
        sent: sql<number>`count(*)::int`,
      })
      .from(automatedSends)
      .where(
        and(
          eq(automatedSends.tenantId, ctx.tenantId),
          eq(automatedSends.status, "sent"),
          sql`${automatedSends.sentAt} is not null`,
          gte(
            automatedSends.sentAt,
            sql`date_trunc('day', now()) - make_interval(days => ${days - 1})`,
          ),
        ),
      )
      .groupBy(sql`date_trunc('day', ${automatedSends.sentAt})`)
      .orderBy(sql`date_trunc('day', ${automatedSends.sentAt})`);
    return rows;
  },
};
