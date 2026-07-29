import { and, eq, inArray, sql, gte, isNull } from "drizzle-orm";
import {
  automatedCampaigns,
  automatedLeads,
  automatedSends,
  automatedReplyDrafts,
} from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";
import { adminDb } from "@/server/db/client";
import type { DiscoveredLead, EmailSourceType } from "@/server/ports";

/**
 * Tenant-scoped data access for the automated outreach campaign engine. Same
 * idioms as outreach.repo.ts/blueprint.repo.ts: plain object literals,
 * `ctx: TenantContext` first arg, explicit `eq(tenantId)` filters. Fully
 * separate tables from outreach_* — see schema.ts's doc comment on
 * `automatedCampaigns`.
 */

export type AutomatedCampaignStatus = "draft" | "active" | "paused" | "completed" | "error";
export type AutomatedLeadStatus =
  | "discovered"
  | "no_email"
  | "disqualified"
  | "ready"
  | "queued"
  | "sent"
  | "replied"
  | "failed"
  | "skipped";

export interface DiscoveryQuery {
  category: string;
  location: { lat: number; lon: number; radiusMeters: number } | { text: string };
}

export interface AutomatedCampaignCreateInput {
  blueprintId: string;
  senderAccountId: string;
  name: string;
  discoveryQuery: DiscoveryQuery;
  maxLeadsPerRun?: number;
  signatureName: string;
  signatureTitle?: string;
  signatureClosing?: string;
  styleExamples?: string[];
  replyPollingEnabled?: boolean;
  marketResearch?: string;
}

export interface AutomatedCampaignUpdateInput {
  name?: string;
  discoveryQuery?: DiscoveryQuery;
  maxLeadsPerRun?: number;
  signatureName?: string;
  signatureTitle?: string;
  signatureClosing?: string;
  styleExamples?: string[];
  replyPollingEnabled?: boolean;
  marketResearch?: string;
  status?: AutomatedCampaignStatus;
}

export const automatedCampaignRepo = {
  async list(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(automatedCampaigns)
      .where(eq(automatedCampaigns.tenantId, ctx.tenantId))
      .orderBy(sql`${automatedCampaigns.createdAt} DESC`);
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(automatedCampaigns)
      .where(and(eq(automatedCampaigns.id, id), eq(automatedCampaigns.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async create(ctx: TenantContext, input: AutomatedCampaignCreateInput) {
    const [row] = await ctx.tx
      .insert(automatedCampaigns)
      .values({
        tenantId: ctx.tenantId,
        createdBy: ctx.userId ?? null,
        blueprintId: input.blueprintId,
        senderAccountId: input.senderAccountId,
        name: input.name,
        discoveryQuery: input.discoveryQuery,
        maxLeadsPerRun: input.maxLeadsPerRun ?? 25,
        signatureName: input.signatureName,
        signatureTitle: input.signatureTitle ?? null,
        signatureClosing: input.signatureClosing ?? "Best regards",
        styleExamples: input.styleExamples ?? null,
        replyPollingEnabled: input.replyPollingEnabled ?? true,
        marketResearch: input.marketResearch ?? null,
        status: "draft",
      })
      .returning();
    return row;
  },

  async update(ctx: TenantContext, id: string, input: AutomatedCampaignUpdateInput) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.discoveryQuery !== undefined) patch.discoveryQuery = input.discoveryQuery;
    if (input.maxLeadsPerRun !== undefined) patch.maxLeadsPerRun = input.maxLeadsPerRun;
    if (input.signatureName !== undefined) patch.signatureName = input.signatureName;
    if (input.signatureTitle !== undefined) patch.signatureTitle = input.signatureTitle;
    if (input.signatureClosing !== undefined) patch.signatureClosing = input.signatureClosing;
    if (input.styleExamples !== undefined) patch.styleExamples = input.styleExamples;
    if (input.replyPollingEnabled !== undefined) {
      patch.replyPollingEnabled = input.replyPollingEnabled;
    }
    if (input.marketResearch !== undefined) patch.marketResearch = input.marketResearch;
    if (input.status !== undefined) patch.status = input.status;

    const [row] = await ctx.tx
      .update(automatedCampaigns)
      .set(patch)
      .where(and(eq(automatedCampaigns.id, id), eq(automatedCampaigns.tenantId, ctx.tenantId)))
      .returning();
    return row ?? null;
  },

  async setStatus(
    ctx: TenantContext,
    id: string,
    status: AutomatedCampaignStatus,
    errorReason?: string,
  ) {
    await ctx.tx
      .update(automatedCampaigns)
      .set({ status, errorReason: errorReason ?? null, updatedAt: new Date() })
      .where(and(eq(automatedCampaigns.id, id), eq(automatedCampaigns.tenantId, ctx.tenantId)));
  },

  /** Admin-scoped: both cron jobs walk active campaigns across every tenant
   *  in one pass — same rationale as whatsappTemplateRepo.listPendingAdmin. */
  async listActiveAdmin() {
    return await adminDb()
      .select()
      .from(automatedCampaigns)
      .where(eq(automatedCampaigns.status, "active"));
  },

  /** Admin-scoped single fetch — used by the "run this one campaign right
   *  now" job triggered on activation (see runAutomatedCampaignNow), which
   *  like the cron sweep runs outside any specific tenant's HTTP request. */
  async getByIdAdmin(id: string) {
    const [row] = await adminDb().select().from(automatedCampaigns).where(eq(automatedCampaigns.id, id)).limit(1);
    return row ?? null;
  },

  async setLastDiscoveryRunAtAdmin(id: string, at: Date) {
    await adminDb()
      .update(automatedCampaigns)
      .set({ lastDiscoveryRunAt: at, updatedAt: new Date() })
      .where(eq(automatedCampaigns.id, id));
  },

  async setLastReplyPollAtAdmin(id: string, at: Date) {
    await adminDb()
      .update(automatedCampaigns)
      .set({ lastReplyPollAt: at, updatedAt: new Date() })
      .where(eq(automatedCampaigns.id, id));
  },

  async setErrorAdmin(id: string, errorReason: string) {
    await adminDb()
      .update(automatedCampaigns)
      .set({ status: "error", errorReason, updatedAt: new Date() })
      .where(eq(automatedCampaigns.id, id));
  },

  /** Hard delete — same precedent as Bulk Fire's campaign delete
   *  (destructive + irreversible, admin-only at the route layer). FK cascade
   *  removes every associated lead/send/reply-draft. */
  async remove(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .delete(automatedCampaigns)
      .where(and(eq(automatedCampaigns.id, id), eq(automatedCampaigns.tenantId, ctx.tenantId)))
      .returning();
    return row ?? null;
  },

  /** How many campaigns (any status — a "completed" one still needs its
   *  blueprint for historical display, not just "active") still point at
   *  this blueprint. Used to block blueprint deletion instead of letting the
   *  campaign silently lose its grounding context (blueprintId has no
   *  onDelete, but that only protects a real DB delete — blueprints are
   *  soft-deleted, which bypasses the FK entirely). */
  async countByBlueprintId(ctx: TenantContext, blueprintId: string): Promise<number> {
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(automatedCampaigns)
      .where(and(eq(automatedCampaigns.tenantId, ctx.tenantId), eq(automatedCampaigns.blueprintId, blueprintId)));
    return row?.count ?? 0;
  },

  /** Campaigns currently running, for the plan's concurrent-campaign quota.
   *  Only "active" counts — draft/paused/error campaigns cost nothing, so a
   *  workspace can author as many as it likes and choose which to run. */
  async countActive(ctx: TenantContext): Promise<number> {
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(automatedCampaigns)
      .where(and(eq(automatedCampaigns.tenantId, ctx.tenantId), eq(automatedCampaigns.status, "active")));
    return row?.count ?? 0;
  },
};

export const automatedLeadRepo = {
  /** Bulk insert with onConflictDoNothing on (campaignId, sourcePlaceId) —
   *  the discovery-dedup guarantee. Returns only the newly-inserted rows so
   *  the enrichment step only processes genuinely new leads this tick. */
  /** Every business this campaign has already discovered, in the provider's
   *  own id space. Fed to the next discovery run so it can page/expand PAST
   *  what it already has instead of re-fetching the same capped page forever
   *  (see LeadDiscoveryQuery.excludeSourcePlaceIds). Ids only — never the
   *  full rows — so this stays cheap as a campaign's lead table grows. */
  async listSourcePlaceIds(ctx: TenantContext, campaignId: string): Promise<Set<string>> {
    const rows = await ctx.tx
      .select({ sourcePlaceId: automatedLeads.sourcePlaceId })
      .from(automatedLeads)
      .where(
        and(
          eq(automatedLeads.tenantId, ctx.tenantId),
          eq(automatedLeads.campaignId, campaignId),
        ),
      );
    return new Set(rows.map((r) => r.sourcePlaceId));
  },

  async upsertDiscovered(ctx: TenantContext, campaignId: string, leads: DiscoveredLead[]) {
    if (leads.length === 0) return [];
    return await ctx.tx
      .insert(automatedLeads)
      .values(
        leads.map((l) => ({
          tenantId: ctx.tenantId,
          campaignId,
          sourcePlaceId: l.sourcePlaceId,
          businessName: l.name,
          category: l.category ?? null,
          addressText: l.address ?? null,
          phone: l.phone ?? null,
          website: l.website ?? null,
          lat: l.lat != null ? String(l.lat) : null,
          lon: l.lon != null ? String(l.lon) : null,
          // A listing that already publishes its contact email (e.g. OSM's
          // email tag) is born "ready" — no enrichment pass needed. The
          // enrichment step only picks up status "discovered", so these are
          // naturally skipped by the waterfall.
          ...(l.email
            ? {
                status: "ready" as const,
                email: l.email,
                emailSource: "osm" as const,
                enrichedAt: new Date(),
              }
            : { status: "discovered" as const }),
        })),
      )
      .onConflictDoNothing({
        target: [automatedLeads.campaignId, automatedLeads.sourcePlaceId],
      })
      .returning();
  },

  async listPendingEnrichment(ctx: TenantContext, campaignId: string, limit: number) {
    return await ctx.tx
      .select()
      .from(automatedLeads)
      .where(
        and(
          eq(automatedLeads.tenantId, ctx.tenantId),
          eq(automatedLeads.campaignId, campaignId),
          eq(automatedLeads.status, "discovered"),
        ),
      )
      .limit(limit);
  },

  /** `status` is decided by the caller BEFORE this write (see
   *  qualifyLeadCheaply/services.leadQualifier in run-automated-campaign.ts)
   *  so a disqualified lead lands directly as "disqualified" in one write,
   *  never passing through "ready". `notes` carries the qualification
   *  reason either way — useful audit trail even for leads that passed. */
  async markEnriched(
    ctx: TenantContext,
    id: string,
    input: {
      email: string;
      emailSource: EmailSourceType;
      emailConfidence?: number;
      status: "ready" | "disqualified";
      notes?: string;
    },
  ) {
    await ctx.tx
      .update(automatedLeads)
      .set({
        email: input.email,
        emailSource: input.emailSource,
        emailConfidence: input.emailConfidence ?? null,
        status: input.status,
        notes: input.notes ?? null,
        enrichedAt: new Date(),
      })
      .where(and(eq(automatedLeads.id, id), eq(automatedLeads.tenantId, ctx.tenantId)));
  },

  /** Used for leads that arrive already "ready" at discovery time (an OSM
   *  listing publishing its own email) but fail qualification once checked —
   *  a follow-up write since upsertDiscovered is a single bulk insert. */
  async setDisqualified(ctx: TenantContext, id: string, reason: string) {
    await ctx.tx
      .update(automatedLeads)
      .set({ status: "disqualified", notes: reason, enrichedAt: new Date() })
      .where(and(eq(automatedLeads.id, id), eq(automatedLeads.tenantId, ctx.tenantId)));
  },

  /** Terminal: a lead with no findable email is never revisited by later
   *  steps or later cron ticks — the strict "email required to send" rule.
   *  This row is dedup bookkeeping only (stops us re-fetching/re-enriching
   *  the same always-failing business every tick) — `list()` below
   *  unconditionally excludes `no_email` rows, so this business is never
   *  shown to the user as a "lead" anywhere in the product. */
  async markNoEmail(ctx: TenantContext, id: string, notes?: string) {
    await ctx.tx
      .update(automatedLeads)
      .set({ status: "no_email", notes: notes ?? null, enrichedAt: new Date() })
      .where(and(eq(automatedLeads.id, id), eq(automatedLeads.tenantId, ctx.tenantId)));
  },

  async listReadyForCopy(ctx: TenantContext, campaignId: string, limit: number) {
    return await ctx.tx
      .select()
      .from(automatedLeads)
      .where(
        and(
          eq(automatedLeads.tenantId, ctx.tenantId),
          eq(automatedLeads.campaignId, campaignId),
          eq(automatedLeads.status, "ready"),
        ),
      )
      .limit(limit);
  },

  async setStatus(ctx: TenantContext, id: string, status: AutomatedLeadStatus) {
    await ctx.tx
      .update(automatedLeads)
      .set({ status })
      .where(and(eq(automatedLeads.id, id), eq(automatedLeads.tenantId, ctx.tenantId)));
  },

  async setStatusMany(ctx: TenantContext, ids: string[], status: AutomatedLeadStatus) {
    if (ids.length === 0) return;
    await ctx.tx
      .update(automatedLeads)
      .set({ status })
      .where(and(inArray(automatedLeads.id, ids), eq(automatedLeads.tenantId, ctx.tenantId)));
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(automatedLeads)
      .where(and(eq(automatedLeads.id, id), eq(automatedLeads.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  /** Backs the leads-table endpoint's filtering (by status/source).
   *  Inclusion list, not an exclusion list: only leads that have complete,
   *  qualified data (a findable email that passed the blueprint's
   *  qualification check) are ever shown here — `discovered` (still being
   *  enriched), `no_email` (never found one), and `disqualified` (found one
   *  but failed the fit check) are all internal pipeline bookkeeping, not
   *  something the product surfaces as a "lead." A future new status
   *  defaults to hidden rather than silently leaking in. */
  LISTABLE_STATUSES: ["ready", "queued", "sent", "replied", "failed", "skipped"] as const,

  async list(
    ctx: TenantContext,
    campaignId: string,
    params: { status?: AutomatedLeadStatus; source?: EmailSourceType; limit: number; offset: number },
  ) {
    const conds = [
      eq(automatedLeads.tenantId, ctx.tenantId),
      eq(automatedLeads.campaignId, campaignId),
      inArray(automatedLeads.status, automatedLeadRepo.LISTABLE_STATUSES),
    ];
    if (params.status) conds.push(eq(automatedLeads.status, params.status));
    if (params.source) conds.push(eq(automatedLeads.emailSource, params.source));
    return await ctx.tx
      .select()
      .from(automatedLeads)
      .where(and(...conds))
      .orderBy(sql`${automatedLeads.discoveredAt} DESC`)
      .limit(params.limit)
      .offset(params.offset);
  },

  /** Sibling of `list()` — same conditions, no limit/offset — backs the
   *  leads-table pagination footer ("Showing X–Y of Z"). */
  async count(
    ctx: TenantContext,
    campaignId: string,
    params: { status?: AutomatedLeadStatus; source?: EmailSourceType },
  ) {
    const conds = [
      eq(automatedLeads.tenantId, ctx.tenantId),
      eq(automatedLeads.campaignId, campaignId),
      inArray(automatedLeads.status, automatedLeadRepo.LISTABLE_STATUSES),
    ];
    if (params.status) conds.push(eq(automatedLeads.status, params.status));
    if (params.source) conds.push(eq(automatedLeads.emailSource, params.source));
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(automatedLeads)
      .where(and(...conds));
    return row?.count ?? 0;
  },
};

export const automatedSendRepo = {
  /** Idempotency backstop: onConflictDoNothing on (campaignId, leadId) —
   *  even a concurrent/retried job step can't double-email the same
   *  business. Returns only the rows actually inserted. */
  async bulkInsert(
    ctx: TenantContext,
    sends: Array<{
      campaignId: string;
      leadId: string;
      senderAccountId: string;
      stepIndex: 0 | 1 | 2;
      subject: string;
      body: string;
      scheduledAt: Date;
    }>,
  ) {
    if (sends.length === 0) return [];
    return await ctx.tx
      .insert(automatedSends)
      .values(
        sends.map((s) => ({
          tenantId: ctx.tenantId,
          campaignId: s.campaignId,
          leadId: s.leadId,
          senderAccountId: s.senderAccountId,
          stepIndex: s.stepIndex,
          subject: s.subject,
          body: s.body,
          scheduledAt: s.scheduledAt,
          status: "scheduled" as const,
        })),
      )
      .onConflictDoNothing({
        target: [automatedSends.campaignId, automatedSends.leadId, automatedSends.stepIndex],
      })
      .returning();
  },

  /** Mirrors outreachSendRepo.countSentTodayForTenant's exact predicate
   *  shape, against automated_sends — an independent counter from bulk-fire's
   *  cap, never shared. */
  async countScheduledOrSentTodayForTenant(ctx: TenantContext): Promise<number> {
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(automatedSends)
      .where(
        and(
          eq(automatedSends.tenantId, ctx.tenantId),
          sql`${automatedSends.status} in ('scheduled', 'sent')`,
          gte(automatedSends.scheduledAt, sql`date_trunc('day', now())`),
          sql`${automatedSends.scheduledAt} < now() + interval '1 day'`,
        ),
      );
    return row?.count ?? 0;
  },

  async markSent(
    ctx: TenantContext,
    id: string,
    input: { sentAt: Date; rfc822MessageId?: string; gmailThreadId?: string; sentSubject?: string },
  ) {
    await ctx.tx
      .update(automatedSends)
      .set({
        status: "sent",
        sentAt: input.sentAt,
        rfc822MessageId: input.rfc822MessageId ?? null,
        gmailThreadId: input.gmailThreadId ?? null,
        sentSubject: input.sentSubject ?? null,
      })
      .where(and(eq(automatedSends.id, id), eq(automatedSends.tenantId, ctx.tenantId)));
  },

  async markFailed(ctx: TenantContext, id: string, errorReason: string) {
    await ctx.tx
      .update(automatedSends)
      .set({ status: "failed", errorReason })
      .where(and(eq(automatedSends.id, id), eq(automatedSends.tenantId, ctx.tenantId)));
  },

  /** Set by the delayed send job when it wakes and finds the campaign no
   *  longer active (paused/deleted since scheduling) — the send never went
   *  out, distinct from "failed" (a real attempt that errored). */
  async markSkipped(ctx: TenantContext, id: string, reason: string) {
    await ctx.tx
      .update(automatedSends)
      .set({ status: "skipped", errorReason: reason })
      .where(
        and(
          eq(automatedSends.id, id),
          eq(automatedSends.tenantId, ctx.tenantId),
          eq(automatedSends.status, "scheduled"),
        ),
      );
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(automatedSends)
      .where(and(eq(automatedSends.id, id), eq(automatedSends.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  /** Used by the send job to find a follow-up's (stepIndex > 0) Day 0
   *  threading anchor — same idiom as outreachSendRepo.getByLeadAndStep. */
  async getByLeadAndStep(ctx: TenantContext, campaignId: string, leadId: string, stepIndex: number) {
    const [row] = await ctx.tx
      .select()
      .from(automatedSends)
      .where(
        and(
          eq(automatedSends.tenantId, ctx.tenantId),
          eq(automatedSends.campaignId, campaignId),
          eq(automatedSends.leadId, leadId),
          eq(automatedSends.stepIndex, stepIndex),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /** All steps for one lead, ordered — backs the "View emails" modal. */
  async listByLead(ctx: TenantContext, campaignId: string, leadId: string) {
    return await ctx.tx
      .select()
      .from(automatedSends)
      .where(
        and(
          eq(automatedSends.tenantId, ctx.tenantId),
          eq(automatedSends.campaignId, campaignId),
          eq(automatedSends.leadId, leadId),
        ),
      )
      .orderBy(automatedSends.stepIndex);
  },

  /** Admin-scoped: the reply-poll cron walks sent threads across every
   *  tenant in one pass, joined to campaigns with replyPollingEnabled. Bound
   *  to a rolling window (default 30 days) so year-old threads aren't
   *  re-checked forever. */
  async listSentWithinWindowAdmin(days: number) {
    return await adminDb()
      .select({
        send: automatedSends,
        campaign: automatedCampaigns,
      })
      .from(automatedSends)
      .innerJoin(automatedCampaigns, eq(automatedSends.campaignId, automatedCampaigns.id))
      .where(
        and(
          eq(automatedSends.status, "sent"),
          eq(automatedCampaigns.replyPollingEnabled, true),
          gte(automatedSends.sentAt, sql`now() - make_interval(days => ${days})`),
        ),
      );
  },

  /** Admin-scoped: the tracking-pixel route has no tenant context — same
   *  reasoning as outreach.repo.ts's markOpenedAdmin. First open wins. */
  async markOpenedAdmin(id: string) {
    await adminDb()
      .update(automatedSends)
      .set({ openedAt: new Date() })
      .where(and(eq(automatedSends.id, id), isNull(automatedSends.openedAt)));
  },
};

export interface UpsertReplyDraftInput {
  campaignId: string;
  leadId: string;
  sendId: string;
  inboundSubject?: string;
  inboundBody: string;
  draftBody: string;
  reasoning?: string;
  confidence?: number;
}

export const automatedReplyDraftRepo = {
  /** Insert-or-refresh keyed on the unique sendId index. Gated on
   *  `status = 'pending'` in the conflict WHERE — Postgres treats an
   *  ON CONFLICT DO UPDATE whose WHERE evaluates false as DO NOTHING, so an
   *  already-reviewed (approved/rejected/sent) draft is never touched and
   *  this returns null in that case. */
  async upsertBySendId(ctx: TenantContext, input: UpsertReplyDraftInput) {
    const confidenceStr = input.confidence != null ? String(input.confidence) : null;
    const [row] = await ctx.tx
      .insert(automatedReplyDrafts)
      .values({
        tenantId: ctx.tenantId,
        campaignId: input.campaignId,
        leadId: input.leadId,
        sendId: input.sendId,
        inboundSubject: input.inboundSubject ?? null,
        inboundBody: input.inboundBody,
        draftBody: input.draftBody,
        reasoning: input.reasoning ?? null,
        confidence: confidenceStr,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: automatedReplyDrafts.sendId,
        set: {
          inboundSubject: input.inboundSubject ?? null,
          inboundBody: input.inboundBody,
          draftBody: input.draftBody,
          reasoning: input.reasoning ?? null,
          confidence: confidenceStr,
          updatedAt: new Date(),
        },
        setWhere: eq(automatedReplyDrafts.status, "pending"),
      })
      .returning();
    return row ?? null;
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(automatedReplyDrafts)
      .where(and(eq(automatedReplyDrafts.id, id), eq(automatedReplyDrafts.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },

  async getBySendId(ctx: TenantContext, sendId: string) {
    const [row] = await ctx.tx
      .select()
      .from(automatedReplyDrafts)
      .where(
        and(eq(automatedReplyDrafts.sendId, sendId), eq(automatedReplyDrafts.tenantId, ctx.tenantId)),
      )
      .limit(1);
    return row ?? null;
  },

  /** Tenant-wide (not campaign-scoped) — backs the review-queue page. */
  async listPending(ctx: TenantContext, limit: number, offset: number) {
    return await ctx.tx
      .select()
      .from(automatedReplyDrafts)
      .where(
        and(eq(automatedReplyDrafts.tenantId, ctx.tenantId), eq(automatedReplyDrafts.status, "pending")),
      )
      .orderBy(sql`${automatedReplyDrafts.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
  },

  async updateDraftBody(ctx: TenantContext, id: string, draftBody: string) {
    const [row] = await ctx.tx
      .update(automatedReplyDrafts)
      .set({ draftBody, updatedAt: new Date() })
      .where(
        and(
          eq(automatedReplyDrafts.id, id),
          eq(automatedReplyDrafts.tenantId, ctx.tenantId),
          eq(automatedReplyDrafts.status, "pending"),
        ),
      )
      .returning();
    return row ?? null;
  },

  async setStatus(
    ctx: TenantContext,
    id: string,
    status: "approved" | "rejected" | "sent",
    input?: { reviewedBy?: string; errorReason?: string; sentAt?: Date },
  ) {
    const [row] = await ctx.tx
      .update(automatedReplyDrafts)
      .set({
        status,
        reviewedBy: input?.reviewedBy ?? ctx.userId ?? null,
        reviewedAt: new Date(),
        errorReason: input?.errorReason ?? null,
        sentAt: input?.sentAt ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(automatedReplyDrafts.id, id), eq(automatedReplyDrafts.tenantId, ctx.tenantId)))
      .returning();
    return row ?? null;
  },
};
