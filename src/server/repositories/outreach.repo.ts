import { and, eq, sql, inArray, isNull, isNotNull, ne } from "drizzle-orm";
import {
  senderAccounts,
  outreachCampaigns,
  outreachLeads,
  outreachSends,
} from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

export interface SequenceStep {
  stepIndex: number;
  dayOffset: number;
  subjectTemplate: string;
  bodyTemplate: string;
}

export const senderAccountRepo = {
  async list(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(senderAccounts)
      .where(eq(senderAccounts.tenantId, ctx.tenantId))
      .orderBy(sql`${senderAccounts.createdAt} DESC`);
  },

  async listActive(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(senderAccounts)
      .where(
        and(eq(senderAccounts.tenantId, ctx.tenantId), eq(senderAccounts.isActive, true)),
      )
      .orderBy(sql`${senderAccounts.createdAt} ASC`);
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(senderAccounts)
      .where(and(eq(senderAccounts.id, id), eq(senderAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async getByEmail(ctx: TenantContext, email: string) {
    const [row] = await ctx.tx
      .select()
      .from(senderAccounts)
      .where(and(eq(senderAccounts.email, email), eq(senderAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async createSmtp(
    ctx: TenantContext,
    input: {
      label: string;
      email: string;
      fromName?: string;
      dailyLimit?: number;
      smtpHost: string;
      smtpPort: number;
      smtpSecure: boolean;
      smtpUsername: string;
      smtpPasswordEnc: string;
    },
  ) {
    const [row] = await ctx.tx
      .insert(senderAccounts)
      .values({
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        type: "smtp",
        label: input.label,
        email: input.email,
        fromName: input.fromName,
        dailyLimit: input.dailyLimit,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        smtpUsername: input.smtpUsername,
        smtpPasswordEnc: input.smtpPasswordEnc,
      })
      .returning();
    return row;
  },

  async createGmail(
    ctx: TenantContext,
    input: {
      label: string;
      email: string;
      fromName?: string;
      dailyLimit?: number;
      gmailRefreshTokenEnc: string;
    },
  ) {
    const [row] = await ctx.tx
      .insert(senderAccounts)
      .values({
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        type: "gmail",
        label: input.label,
        email: input.email,
        fromName: input.fromName,
        dailyLimit: input.dailyLimit,
        gmailRefreshTokenEnc: input.gmailRefreshTokenEnc,
      })
      .returning();
    return row;
  },

  async setActive(ctx: TenantContext, id: string, isActive: boolean) {
    await ctx.tx
      .update(senderAccounts)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(senderAccounts.id, id), eq(senderAccounts.tenantId, ctx.tenantId)));
  },

  async remove(ctx: TenantContext, id: string) {
    const deleted = await ctx.tx
      .delete(senderAccounts)
      .where(and(eq(senderAccounts.id, id), eq(senderAccounts.tenantId, ctx.tenantId)))
      .returning({ id: senderAccounts.id });
    return deleted.length > 0;
  },
};

export const outreachCampaignRepo = {
  async list(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.tenantId, ctx.tenantId))
      .orderBy(sql`${outreachCampaigns.createdAt} DESC`);
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(outreachCampaigns)
      .where(and(eq(outreachCampaigns.id, id), eq(outreachCampaigns.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async create(ctx: TenantContext, name: string) {
    const [row] = await ctx.tx
      .insert(outreachCampaigns)
      .values({ tenantId: ctx.tenantId, createdBy: ctx.userId, name })
      .returning();
    return row;
  },

  async setSequence(ctx: TenantContext, id: string, sequence: SequenceStep[]) {
    await ctx.tx
      .update(outreachCampaigns)
      .set({ sequence, updatedAt: new Date() })
      .where(and(eq(outreachCampaigns.id, id), eq(outreachCampaigns.tenantId, ctx.tenantId)));
  },

  async setStatus(
    ctx: TenantContext,
    id: string,
    status: (typeof outreachCampaigns.$inferSelect)["status"],
    errorReason?: string | null,
  ) {
    await ctx.tx
      .update(outreachCampaigns)
      .set({ status, errorReason: errorReason ?? null, updatedAt: new Date() })
      .where(and(eq(outreachCampaigns.id, id), eq(outreachCampaigns.tenantId, ctx.tenantId)));
  },
};

export const outreachLeadRepo = {
  async bulkInsert(
    ctx: TenantContext,
    campaignId: string,
    leads: Array<{
      name: string;
      niche?: string;
      location?: string;
      decisionMaker?: string;
      email?: string;
      phone?: string;
      notes?: string;
    }>,
  ) {
    if (leads.length === 0) return [];
    return await ctx.tx
      .insert(outreachLeads)
      .values(
        leads.map((lead) => ({
          tenantId: ctx.tenantId,
          campaignId,
          name: lead.name,
          niche: lead.niche,
          location: lead.location,
          decisionMaker: lead.decisionMaker,
          email: lead.email,
          phone: lead.phone,
          notes: lead.notes,
        })),
      )
      .returning();
  },

  async listByCampaign(ctx: TenantContext, campaignId: string) {
    return await ctx.tx
      .select()
      .from(outreachLeads)
      .where(
        and(eq(outreachLeads.tenantId, ctx.tenantId), eq(outreachLeads.campaignId, campaignId)),
      )
      .orderBy(sql`${outreachLeads.createdAt} ASC`);
  },

  /** Leads with a usable email that haven't been scheduled/sent yet — the
   *  fire flow's candidate pool. */
  async listPendingWithEmail(ctx: TenantContext, campaignId: string) {
    return await ctx.tx
      .select()
      .from(outreachLeads)
      .where(
        and(
          eq(outreachLeads.tenantId, ctx.tenantId),
          eq(outreachLeads.campaignId, campaignId),
          eq(outreachLeads.status, "pending"),
        ),
      )
      .orderBy(sql`${outreachLeads.createdAt} ASC`);
  },

  /**
   * Leads eligible for a specific sequence step — has a usable email AND
   * doesn't already have an `outreachSends` row for `(campaignId, leadId,
   * stepIndex)` (also enforced by the `outreach_sends_lead_step_uq` unique
   * index). This is what makes "Fire" a per-step action: a lead that already
   * got its day0 send is still eligible for day3, unlike `listPendingWithEmail`
   * (which only looks at the lead's single overall `status`).
   */
  async listEligibleForStep(ctx: TenantContext, campaignId: string, stepIndex: number) {
    const rows = await ctx.tx
      .select({ lead: outreachLeads })
      .from(outreachLeads)
      .leftJoin(
        outreachSends,
        and(
          eq(outreachSends.leadId, outreachLeads.id),
          eq(outreachSends.stepIndex, stepIndex),
        ),
      )
      .where(
        and(
          eq(outreachLeads.tenantId, ctx.tenantId),
          eq(outreachLeads.campaignId, campaignId),
          isNotNull(outreachLeads.email),
          ne(outreachLeads.status, "skipped"),
          isNull(outreachSends.id),
        ),
      )
      .orderBy(sql`${outreachLeads.createdAt} ASC`);
    return rows.map((r) => r.lead);
  },

  async setStatus(
    ctx: TenantContext,
    id: string,
    status: (typeof outreachLeads.$inferSelect)["status"],
  ) {
    await ctx.tx
      .update(outreachLeads)
      .set({ status, lastActionAt: new Date() })
      .where(and(eq(outreachLeads.id, id), eq(outreachLeads.tenantId, ctx.tenantId)));
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(outreachLeads)
      .where(and(eq(outreachLeads.id, id), eq(outreachLeads.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },
};

export const outreachSendRepo = {
  async bulkSchedule(
    ctx: TenantContext,
    sends: Array<{
      campaignId: string;
      leadId: string;
      senderAccountId: string;
      stepIndex: number;
      scheduledAt: Date;
    }>,
  ) {
    if (sends.length === 0) return [];
    return await ctx.tx
      .insert(outreachSends)
      .values(
        sends.map((s) => ({
          tenantId: ctx.tenantId,
          campaignId: s.campaignId,
          leadId: s.leadId,
          senderAccountId: s.senderAccountId,
          stepIndex: s.stepIndex,
          scheduledAt: s.scheduledAt,
        })),
      )
      .returning();
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(outreachSends)
      .where(and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async markSent(ctx: TenantContext, id: string) {
    await ctx.tx
      .update(outreachSends)
      .set({ status: "sent", sentAt: new Date() })
      .where(and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)));
  },

  async markFailed(ctx: TenantContext, id: string, errorReason: string) {
    await ctx.tx
      .update(outreachSends)
      .set({ status: "failed", errorReason })
      .where(and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)));
  },

  async markSkipped(ctx: TenantContext, id: string, reason: string) {
    await ctx.tx
      .update(outreachSends)
      .set({ status: "skipped", errorReason: reason })
      .where(and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)));
  },

  /** Aggregate counts for the campaign progress panel, polled from the UI. */
  async countsByCampaign(ctx: TenantContext, campaignId: string) {
    const rows = await ctx.tx
      .select({ status: outreachSends.status, count: sql<number>`count(*)::int` })
      .from(outreachSends)
      .where(
        and(eq(outreachSends.tenantId, ctx.tenantId), eq(outreachSends.campaignId, campaignId)),
      )
      .groupBy(outreachSends.status);

    const counts = { scheduled: 0, sent: 0, failed: 0, skipped: 0 };
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  },

  /** How many sends a sender account already has today — enforces `dailyLimit`. */
  async countSentTodayForSenders(ctx: TenantContext, senderAccountIds: string[]) {
    if (senderAccountIds.length === 0) return new Map<string, number>();
    const rows = await ctx.tx
      .select({
        senderAccountId: outreachSends.senderAccountId,
        count: sql<number>`count(*)::int`,
      })
      .from(outreachSends)
      .where(
        and(
          eq(outreachSends.tenantId, ctx.tenantId),
          inArray(outreachSends.senderAccountId, senderAccountIds),
          sql`${outreachSends.status} in ('scheduled', 'sent')`,
          sql`${outreachSends.scheduledAt} >= date_trunc('day', now())`,
        ),
      )
      .groupBy(outreachSends.senderAccountId);
    return new Map(rows.map((r) => [r.senderAccountId, r.count]));
  },
};
