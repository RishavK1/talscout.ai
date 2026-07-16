import {
  and,
  eq,
  sql,
  inArray,
  isNull,
  isNotNull,
  ne,
  asc,
  getTableColumns,
} from "drizzle-orm";
import {
  senderAccounts,
  outreachCampaigns,
  outreachLeads,
  outreachSends,
} from "@/server/db/schema";
import { clampLimit, clampOffset } from "@/server/repositories/candidate.repo";
import type { TenantContext } from "@/server/db/tx";
import { adminDb } from "@/server/db/client";

export interface SequenceStep {
  stepIndex: number;
  dayOffset: number;
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface WhatsAppSequenceStep {
  stepIndex: number;
  dayOffset: number;
  templateId: string;
  templateParams: string[];
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
        and(
          eq(senderAccounts.tenantId, ctx.tenantId),
          eq(senderAccounts.isActive, true),
        ),
      )
      .orderBy(sql`${senderAccounts.createdAt} ASC`);
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(senderAccounts)
      .where(
        and(
          eq(senderAccounts.id, id),
          eq(senderAccounts.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async getByEmail(ctx: TenantContext, email: string) {
    const [row] = await ctx.tx
      .select()
      .from(senderAccounts)
      .where(
        and(
          eq(senderAccounts.email, email),
          eq(senderAccounts.tenantId, ctx.tenantId),
        ),
      )
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

  async createWhatsApp(
    ctx: TenantContext,
    input: {
      label: string;
      /** E.164 phone number — reuses the `email` column (see schema.ts). */
      phoneNumber: string;
      whatsappPhoneNumberId: string;
      whatsappWabaId: string;
      whatsappAccessTokenEnc: string;
      whatsappDisplayName?: string;
      dailyLimit?: number;
    },
  ) {
    const [row] = await ctx.tx
      .insert(senderAccounts)
      .values({
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        type: "whatsapp",
        label: input.label,
        email: input.phoneNumber,
        dailyLimit: input.dailyLimit,
        whatsappPhoneNumberId: input.whatsappPhoneNumberId,
        whatsappWabaId: input.whatsappWabaId,
        whatsappAccessTokenEnc: input.whatsappAccessTokenEnc,
        whatsappDisplayName: input.whatsappDisplayName,
      })
      .returning();
    return row;
  },

  async setActive(ctx: TenantContext, id: string, isActive: boolean) {
    await ctx.tx
      .update(senderAccounts)
      .set({ isActive, updatedAt: new Date() })
      .where(
        and(
          eq(senderAccounts.id, id),
          eq(senderAccounts.tenantId, ctx.tenantId),
        ),
      );
  },

  async remove(ctx: TenantContext, id: string) {
    const deleted = await ctx.tx
      .delete(senderAccounts)
      .where(
        and(
          eq(senderAccounts.id, id),
          eq(senderAccounts.tenantId, ctx.tenantId),
        ),
      )
      .returning({ id: senderAccounts.id });
    return deleted.length > 0;
  },

  /** Active accounts matching the given ids, tenant-scoped. Ids that don't
   *  resolve (deleted/paused/foreign) are silently excluded — callers treat
   *  an empty result as "no eligible sender". */
  async listByIds(ctx: TenantContext, ids: string[]) {
    if (ids.length === 0) return [];
    return await ctx.tx
      .select()
      .from(senderAccounts)
      .where(
        and(
          eq(senderAccounts.tenantId, ctx.tenantId),
          eq(senderAccounts.isActive, true),
          inArray(senderAccounts.id, ids),
        ),
      )
      .orderBy(sql`${senderAccounts.createdAt} ASC`);
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
      .where(
        and(
          eq(outreachCampaigns.id, id),
          eq(outreachCampaigns.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async create(
    ctx: TenantContext,
    name: string,
    channel: "email" | "whatsapp" = "email",
  ) {
    const [row] = await ctx.tx
      .insert(outreachCampaigns)
      .values({ tenantId: ctx.tenantId, createdBy: ctx.userId, name, channel })
      .returning();
    return row;
  },

  /** Sequence shape depends on `channel` — validated by the caller (Zod
   *  schema selection in the service layer), stored as-is in the jsonb col. */
  async setSequence(
    ctx: TenantContext,
    id: string,
    sequence: SequenceStep[] | WhatsAppSequenceStep[],
  ) {
    await ctx.tx
      .update(outreachCampaigns)
      .set({ sequence, updatedAt: new Date() })
      .where(
        and(
          eq(outreachCampaigns.id, id),
          eq(outreachCampaigns.tenantId, ctx.tenantId),
        ),
      );
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
      .where(
        and(
          eq(outreachCampaigns.id, id),
          eq(outreachCampaigns.tenantId, ctx.tenantId),
        ),
      );
  },

  async setScheduledFire(
    ctx: TenantContext,
    id: string,
    fire: { scheduledFireAt: Date; stepIndex: number; leadIds: string[] | null },
  ) {
    await ctx.tx
      .update(outreachCampaigns)
      .set({
        scheduledFireAt: fire.scheduledFireAt,
        scheduledFireStepIndex: fire.stepIndex,
        scheduledFireLeadIds: fire.leadIds,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(outreachCampaigns.id, id),
          eq(outreachCampaigns.tenantId, ctx.tenantId),
        ),
      );
  },

  async setSenderAccounts(
    ctx: TenantContext,
    id: string,
    senderAccountIds: string[] | null,
  ) {
    await ctx.tx
      .update(outreachCampaigns)
      .set({ senderAccountIds, updatedAt: new Date() })
      .where(
        and(
          eq(outreachCampaigns.id, id),
          eq(outreachCampaigns.tenantId, ctx.tenantId),
        ),
      );
  },

  async clearScheduledFire(ctx: TenantContext, id: string) {
    await ctx.tx
      .update(outreachCampaigns)
      .set({
        scheduledFireAt: null,
        scheduledFireStepIndex: null,
        scheduledFireLeadIds: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(outreachCampaigns.id, id),
          eq(outreachCampaigns.tenantId, ctx.tenantId),
        ),
      );
  },

  /** Cascades to `outreach_leads` / `outreach_sends` via FK `onDelete: "cascade"`
   *  (see server/db/schema.ts) — no separate cleanup needed for those rows. */
  async remove(ctx: TenantContext, id: string) {
    const deleted = await ctx.tx
      .delete(outreachCampaigns)
      .where(
        and(
          eq(outreachCampaigns.id, id),
          eq(outreachCampaigns.tenantId, ctx.tenantId),
        ),
      )
      .returning({ id: outreachCampaigns.id });
    return deleted.length > 0;
  },
};

export const outreachLeadRepo = {
  // Postgres caps a single query at 65535 bind params. Each row here binds 9
  // columns, so an unchunked insert tops out around ~7281 leads — a docx
  // dense enough to exceed that would fail the whole import with a driver
  // error instead of a clean result. 1000 rows/chunk keeps a wide safety
  // margin while still being a handful of round trips for any realistic
  // import size.
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
    const CHUNK_SIZE = 1000;
    const inserted: (typeof outreachLeads.$inferSelect)[] = [];
    for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
      const chunk = leads.slice(i, i + CHUNK_SIZE);
      const rows = await ctx.tx
        .insert(outreachLeads)
        .values(
          chunk.map((lead) => ({
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
      inserted.push(...rows);
    }
    return inserted;
  },

  /** Paginated — defaults/caps mirror candidateRepo.list (PAGE-02/03), so this
   *  is never an unbounded list endpoint even for a campaign with thousands
   *  of imported leads. `nextSendAt` is a correlated subquery (not a join) so
   *  it stays a single row per lead — the leads table's live countdown timer
   *  reads off this. */
  async listByCampaign(
    ctx: TenantContext,
    campaignId: string,
    params: { limit?: number; offset?: number } = {},
  ) {
    const limit = clampLimit(params.limit);
    const offset = clampOffset(params.offset);
    const rows = await ctx.tx
      .select({
        ...getTableColumns(outreachLeads),
        // NOTE: outreach_leads.id must stay qualified — outreach_sends has
        // its own "id" column, and a bare `${outreachLeads.id}` here renders
        // as unqualified "id" (drizzle doesn't table-qualify raw sql``
        // column interpolations), which Postgres resolves to the nearer
        // outreach_sends.id, silently turning this into a no-op correlation
        // that always returned null.
        nextSendAt: sql<Date | null>`(
          select min(${outreachSends.scheduledAt}) from ${outreachSends}
          where ${outreachSends.leadId} = ${sql.raw('"outreach_leads"."id"')}
            and ${outreachSends.status} = 'scheduled'
        )`,
      })
      .from(outreachLeads)
      .where(
        and(
          eq(outreachLeads.tenantId, ctx.tenantId),
          eq(outreachLeads.campaignId, campaignId),
        ),
      )
      // stable ordering with a tiebreak so pages don't drift (PAGE-05)
      .orderBy(asc(outreachLeads.createdAt), asc(outreachLeads.id))
      .limit(limit)
      .offset(offset);
    return { rows, limit, offset };
  },

  async countByCampaign(ctx: TenantContext, campaignId: string) {
    const [row] = await ctx.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(outreachLeads)
      .where(
        and(
          eq(outreachLeads.tenantId, ctx.tenantId),
          eq(outreachLeads.campaignId, campaignId),
        ),
      );
    return row?.n ?? 0;
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
   * Leads eligible for a specific sequence step — has a usable contact point
   * for the campaign's channel (email for email campaigns, phone for
   * WhatsApp) AND doesn't already have an `outreachSends` row for
   * `(campaignId, leadId, stepIndex)` (also enforced by the
   * `outreach_sends_lead_step_uq` unique index). This is what makes "Fire" a
   * per-step action: a lead that already got its day0 send is still eligible
   * for day3, unlike `listPendingWithEmail` (which only looks at the lead's
   * single overall `status`).
   */
  async listEligibleForStep(
    ctx: TenantContext,
    campaignId: string,
    stepIndex: number,
    /** Optional — restricts eligibility to this subset (a user's row
     *  selection in the leads table). Omitted/empty means "all eligible". */
    leadIds?: string[],
    channel: "email" | "whatsapp" = "email",
  ) {
    const conds = [
      eq(outreachLeads.tenantId, ctx.tenantId),
      eq(outreachLeads.campaignId, campaignId),
      channel === "whatsapp"
        ? isNotNull(outreachLeads.phone)
        : isNotNull(outreachLeads.email),
      ne(outreachLeads.status, "skipped"),
      isNull(outreachSends.id),
    ];
    if (leadIds && leadIds.length > 0) {
      conds.push(inArray(outreachLeads.id, leadIds));
    }
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
      .where(and(...conds))
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
      .where(
        and(eq(outreachLeads.id, id), eq(outreachLeads.tenantId, ctx.tenantId)),
      );
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(outreachLeads)
      .where(
        and(eq(outreachLeads.id, id), eq(outreachLeads.tenantId, ctx.tenantId)),
      )
      .limit(1);
    return row ?? null;
  },

  /** Overwrites `notes` wholesale — used to persist an edited embedded
   *  templates block (see `replaceOutreachTemplatesBlock`). */
  async updateNotes(ctx: TenantContext, id: string, notes: string) {
    const [row] = await ctx.tx
      .update(outreachLeads)
      .set({ notes })
      .where(
        and(eq(outreachLeads.id, id), eq(outreachLeads.tenantId, ctx.tenantId)),
      )
      .returning();
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

  /** Undoes `bulkSchedule` for a set of rows — used to recover from a fire
   *  whose enqueue failed after the sends were already committed. Deleting
   *  (rather than marking "failed"/"skipped") matters because
   *  `listEligibleForStep` excludes a lead the moment ANY send row exists for
   *  that step, regardless of status — so a status flip would leave those
   *  leads permanently un-retryable, while deleting lets the next fire pick
   *  them straight back up. */
  async deleteByIds(ctx: TenantContext, ids: string[]) {
    if (ids.length === 0) return;
    await ctx.tx
      .delete(outreachSends)
      .where(
        and(
          inArray(outreachSends.id, ids),
          eq(outreachSends.tenantId, ctx.tenantId),
        ),
      );
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(outreachSends)
      .where(
        and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)),
      )
      .limit(1);
    return row ?? null;
  },

  async markSent(ctx: TenantContext, id: string) {
    await ctx.tx
      .update(outreachSends)
      .set({ status: "sent", sentAt: new Date() })
      .where(
        and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)),
      );
  },

  /** Like `markSent`, but also records the provider's message id so inbound
   *  delivery-status webhooks (which only know the provider id, not our
   *  internal one) can find the row back via `getByProviderMessageId`. */
  async markSentWithProviderMessageId(
    ctx: TenantContext,
    id: string,
    providerMessageId: string,
  ) {
    await ctx.tx
      .update(outreachSends)
      .set({ status: "sent", sentAt: new Date(), providerMessageId })
      .where(
        and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)),
      );
  },

  /** Admin-scoped: the WhatsApp delivery-status webhook arrives with no
   *  tenant context (Meta only echoes back the provider message id), so this
   *  looks the send up across all tenants via `adminDb()` — mirroring
   *  `tenantRepo.getByIdAdmin` / `webhookRepo`'s use of the RLS-bypassing
   *  connection for pre-tenant-resolution lookups. */
  async getByProviderMessageId(providerMessageId: string) {
    const [row] = await adminDb()
      .select()
      .from(outreachSends)
      .where(eq(outreachSends.providerMessageId, providerMessageId))
      .limit(1);
    return row ?? null;
  },

  /** Admin-scoped counterpart to marking delivery status from the webhook —
   *  same no-tenant-context reasoning as `getByProviderMessageId`. */
  async updateDeliveryStatusAdmin(
    id: string,
    deliveryStatus: "sent" | "delivered" | "read" | "failed",
  ) {
    await adminDb()
      .update(outreachSends)
      .set({ deliveryStatus })
      .where(eq(outreachSends.id, id));
  },

  async markFailed(ctx: TenantContext, id: string, errorReason: string) {
    await ctx.tx
      .update(outreachSends)
      .set({ status: "failed", errorReason })
      .where(
        and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)),
      );
  },

  async markSkipped(ctx: TenantContext, id: string, reason: string) {
    await ctx.tx
      .update(outreachSends)
      .set({ status: "skipped", errorReason: reason })
      .where(
        and(eq(outreachSends.id, id), eq(outreachSends.tenantId, ctx.tenantId)),
      );
  },

  /** Called on pause/stop so the leads table's countdown stops immediately
   *  instead of ticking down to a send that will only get skipped later,
   *  lazily, when its Inngest job happens to wake up. */
  async skipScheduledForCampaign(
    ctx: TenantContext,
    campaignId: string,
    reason: string,
  ) {
    await ctx.tx
      .update(outreachSends)
      .set({ status: "skipped", errorReason: reason })
      .where(
        and(
          eq(outreachSends.tenantId, ctx.tenantId),
          eq(outreachSends.campaignId, campaignId),
          eq(outreachSends.status, "scheduled"),
        ),
      );
  },

  /** Aggregate counts for the campaign progress panel, polled from the UI. */
  async countsByCampaign(ctx: TenantContext, campaignId: string) {
    const rows = await ctx.tx
      .select({
        status: outreachSends.status,
        count: sql<number>`count(*)::int`,
      })
      .from(outreachSends)
      .where(
        and(
          eq(outreachSends.tenantId, ctx.tenantId),
          eq(outreachSends.campaignId, campaignId),
        ),
      )
      .groupBy(outreachSends.status);

    const counts = { scheduled: 0, sent: 0, failed: 0, skipped: 0 };
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  },

  /** How many sends a sender account already has today — enforces `dailyLimit`. */
  async countSentTodayForSenders(
    ctx: TenantContext,
    senderAccountIds: string[],
  ) {
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

  /** How many sends the whole tenant already has today — enforces the plan's
   *  outreachDailySendCap. Same window as countSentTodayForSenders, just not
   *  scoped to a sender subset. */
  async countSentTodayForTenant(ctx: TenantContext) {
    const [row] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachSends)
      .where(
        and(
          eq(outreachSends.tenantId, ctx.tenantId),
          sql`${outreachSends.status} in ('scheduled', 'sent')`,
          sql`${outreachSends.scheduledAt} >= date_trunc('day', now())`,
        ),
      );
    return row?.count ?? 0;
  },
};
