import { google } from "googleapis";
import { sql } from "drizzle-orm";
import { withTenantTx, type TenantContext } from "@/server/db/tx";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "@/server/repositories/outreach.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { billingService } from "@/server/services/billing.service";
import { getPlan } from "@/lib/plans";
import {
  scheduleSends,
  getOutreachTemplates,
  replaceOutreachTemplatesBlock,
  type SequenceStepKey,
} from "@/server/lib/spintax";
import { checkDomainDeliverability } from "@/server/lib/dns-health";
import type { SequenceStep } from "@/server/repositories/outreach.repo";
import { encryptSecret, decryptSecret } from "@/server/lib/secret-box";
import { signOAuthState, verifyOAuthState } from "@/server/lib/oauth-state";
import { getServices } from "@/server/container";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { auditRepo } from "@/server/repositories/audit.repo";
import { MAX_UPLOAD_BYTES } from "@/server/ingestion/file-type";
import { PARSE_LEADS_DOCX_JOB } from "@/server/jobs/parse-leads-docx";
import { SEND_OUTREACH_EMAIL_JOB } from "@/server/jobs/send-outreach-email";
import { SEND_OUTREACH_WHATSAPP_JOB } from "@/server/jobs/send-outreach-whatsapp";
import { FIRE_SCHEDULED_CAMPAIGN_JOB } from "@/server/jobs/fire-scheduled-campaign";
import { whatsappTemplateRepo } from "@/server/repositories/whatsapp-template.repo";
import {
  NotFound,
  Conflict,
  BadRequest,
  PayloadTooLarge,
  PaymentRequired,
} from "@/server/http/errors";
import type {
  CreateCampaignBody,
  SetSequenceBody,
  SetWhatsAppSequenceBody,
  RequestLeadsUploadBody,
  CompleteLeadsUploadBody,
  CreateSmtpSenderBody,
  CreateWhatsAppSenderBody,
  SubmitWhatsAppTemplateBody,
  SetLeadTemplatesBody,
  SetCampaignSendersBody,
} from "@/server/validation/outreach";

const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  // Read access powers the follow-up reply-stop check (has the lead replied
  // in the Day 0 thread?). Mailboxes connected before this scope was added
  // keep sending fine — their tokens are send-only, so the reply check
  // fails open until they reconnect (see senderAccounts.gmailHasReadScope).
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const STEP_KEYS: SequenceStepKey[] = ["day0", "day3", "day7"];

/** Serializes the per-tenant daily-send-cap check-then-insert: two concurrent
 *  fires (double-click, two campaigns, a scheduled fire landing mid-fire)
 *  would otherwise both read the same "sent today" count and both schedule
 *  up to the full remaining quota, letting a Growth tenant blow past its
 *  cap. A transaction-scoped advisory lock keyed on the tenant id forces
 *  concurrent fires for the same tenant to serialize around the count+insert;
 *  it auto-releases at COMMIT/ROLLBACK (no explicit unlock needed) and is
 *  compatible with PgBouncer transaction-mode pooling, unlike session-level
 *  advisory locks. */
async function lockTenantForDailyCap(ctx: TenantContext) {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${ctx.tenantId}))`,
  );
}

/** Which sender accounts a campaign's Fire (immediate or scheduled — both
 *  route through `fireCampaign`) rotates across. An explicit selection
 *  scopes to just those (still tenant/active-guarded via `listByIds`);
 *  null/empty preserves the original tenant-wide round-robin. */
async function resolveCampaignSenders(
  ctx: TenantContext,
  campaign: { senderAccountIds: unknown },
) {
  const ids = campaign.senderAccountIds as string[] | null;
  return ids && ids.length > 0
    ? await senderAccountRepo.listByIds(ctx, ids)
    : await senderAccountRepo.listActive(ctx);
}

/** Expands each sender into as many rotation slots as it has remaining
 *  capacity today, round-robin interleaved (A,B,C,A,B,C,... dropping any
 *  sender once it runs out) — e.g. remaining {A:2,B:1} → [A,B,A]. Passing
 *  this (rather than the plain sender id list) as `scheduleSends`'
 *  `senderAccountIds` is what makes it respect each sender's `dailyLimit`:
 *  with the array's length capped to `count`, `scheduleSends`' own
 *  `i % length` indexing degenerates to `rotation[i]`, so lead i lands on
 *  exactly the sender this rotation assigned it to. */
function buildSenderRotation(
  senderIds: string[],
  remainingBySender: Map<string, number>,
  count: number,
): string[] {
  const rotation: string[] = [];
  const left = new Map(remainingBySender);
  while (rotation.length < count) {
    let addedThisPass = false;
    for (const id of senderIds) {
      if (rotation.length >= count) break;
      const cap = left.get(id) ?? 0;
      if (cap > 0) {
        rotation.push(id);
        left.set(id, cap - 1);
        addedThisPass = true;
      }
    }
    if (!addedThisPass) break; // every sender is out of capacity
  }
  return rotation;
}

/** `senderAccountRepo` rows carry `smtpPasswordEnc`/`gmailRefreshTokenEnc`/
 *  `whatsappAccessTokenEnc` — ciphertext, not plaintext, but still internal
 *  columns that should never round-trip to the client. `withAuth` serializes
 *  whatever a handler returns verbatim, so every method that surfaces a
 *  sender row maps through this first rather than relying on callers to
 *  remember to strip it. */
function toPublicSender(
  row: Awaited<ReturnType<typeof senderAccountRepo.list>>[number],
) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    email: row.email,
    fromName: row.fromName,
    isActive: row.isActive,
    dailyLimit: row.dailyLimit,
    createdAt: row.createdAt,
    whatsappDisplayName: row.whatsappDisplayName,
    /** False for Gmail mailboxes connected before reply-detection shipped —
     *  the UI uses this to nudge a reconnect (reply-stop stays fail-open
     *  meanwhile). Always false for smtp/whatsapp. */
    gmailHasReadScope: row.gmailHasReadScope,
  };
}

/** Growth/Scale connect a bounded number of sender mailboxes — checked
 *  against the currently-connected count (active or not) at connect time. */
async function assertSenderCapacity(ctx: TenantContext) {
  const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
  const { outreachMaxSenderAccounts } = getPlan(tenant?.plan || "starter");
  const existing = await senderAccountRepo.list(ctx);
  if (existing.length >= outreachMaxSenderAccounts) {
    throw new PaymentRequired(
      "You've reached your plan's sender account limit — upgrade to connect more.",
    );
  }
}

/** `prompt: "consent"` forces Google to hand back a refresh token on every
 *  connect, not just the very first one — otherwise a re-connect after a
 *  revoke would silently come back with none. */
function gmailOAuthClient(appOrigin: string) {
  const env = getEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new BadRequest("Gmail connect is not configured on this server");
  }
  return new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    `${appOrigin}/api/outreach/senders/gmail/oauth/callback`,
  );
}

export const outreachService = {
  async listCampaigns(ctx: TenantContext) {
    return await outreachCampaignRepo.list(ctx);
  },

  async getCampaign(ctx: TenantContext, campaignId: string) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    const [counts, leadCount, stepSummary] = await Promise.all([
      outreachSendRepo.countsByCampaign(ctx, campaignId),
      outreachLeadRepo.countByCampaign(ctx, campaignId),
      outreachSendRepo.stepSummaryByCampaign(ctx, campaignId),
    ]);
    return { campaign, counts, leadCount, stepSummary };
  },

  async createCampaign(ctx: TenantContext, body: CreateCampaignBody) {
    await billingService.assertCapability(ctx, "outreach_bulk_fire");
    if (body.channel === "whatsapp") {
      await billingService.assertCapability(ctx, "whatsapp_channel");
    }
    const campaign = await outreachCampaignRepo.create(ctx, body.name, body.channel);
    await auditRepo.log(ctx, {
      action: "outreach.campaign.create",
      targetType: "outreach_campaign",
      targetId: campaign.id,
    });
    return campaign;
  },

  async setSequence(
    ctx: TenantContext,
    campaignId: string,
    body: SetSequenceBody,
  ) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    if (campaign.channel !== "email") {
      throw new Conflict("This campaign's channel is not email");
    }
    await outreachCampaignRepo.setSequence(ctx, campaignId, body.sequence);
    await auditRepo.log(ctx, {
      action: "outreach.campaign.set_sequence",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });
    return { id: campaignId, sequence: body.sequence };
  },

  /** WhatsApp counterpart to `setSequence` — separate method (not a branch)
   *  because the step shape is entirely different (templateId+templateParams,
   *  not subject/body) and each template must already be Meta-approved for
   *  this to be enforceable at fire time (see send-outreach-whatsapp.ts). */
  async setWhatsAppSequence(
    ctx: TenantContext,
    campaignId: string,
    body: SetWhatsAppSequenceBody,
  ) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    if (campaign.channel !== "whatsapp") {
      throw new Conflict("This campaign's channel is not whatsapp");
    }
    await billingService.assertCapability(ctx, "whatsapp_channel");

    const templateIds = [...new Set(body.sequence.map((s) => s.templateId))];
    if (templateIds.length > 0) {
      const templates = await Promise.all(
        templateIds.map((id) => whatsappTemplateRepo.getById(ctx, id)),
      );
      const missing = templates.some((t) => !t);
      if (missing) {
        throw new BadRequest("One or more selected templates are invalid");
      }
    }

    await outreachCampaignRepo.setSequence(ctx, campaignId, body.sequence);
    await auditRepo.log(ctx, {
      action: "outreach.campaign.set_sequence",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });
    return { id: campaignId, sequence: body.sequence };
  },

  /** Empty selection clears back to "every active sender account" (see
   *  resolveCampaignSenders) — the historical, tenant-wide behavior. */
  async setCampaignSenders(
    ctx: TenantContext,
    campaignId: string,
    body: SetCampaignSendersBody,
  ) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");

    if (body.senderAccountIds.length > 0) {
      const resolved = await senderAccountRepo.listByIds(ctx, body.senderAccountIds);
      if (resolved.length !== body.senderAccountIds.length) {
        throw new BadRequest("One or more selected sender accounts are invalid");
      }
    }

    const senderAccountIds =
      body.senderAccountIds.length > 0 ? body.senderAccountIds : null;
    await outreachCampaignRepo.setSenderAccounts(ctx, campaignId, senderAccountIds);
    await auditRepo.log(ctx, {
      action: "outreach.campaign.set_senders",
      targetType: "outreach_campaign",
      targetId: campaignId,
      metadata: { senderAccountIds },
    });
    return { id: campaignId, senderAccountIds };
  },

  /** What will actually be sent to this lead for each step — its own
   *  docx-embedded copy where it has one, else the campaign's fallback
   *  sequence (mirrors `resolveTemplate` in jobs/send-outreach-email.ts).
   *  Backs the "view/edit emails" modal on the leads table. */
  async getLeadTemplates(ctx: TenantContext, campaignId: string, leadId: string) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    const lead = await outreachLeadRepo.getById(ctx, leadId);
    if (!lead || lead.campaignId !== campaignId) throw new NotFound("Lead not found");

    const own = getOutreachTemplates(lead.notes) ?? {};
    const fallbackSteps = Array.isArray(campaign.sequence)
      ? (campaign.sequence as SequenceStep[])
      : [];

    const steps = STEP_KEYS.map((key, stepIndex) => {
      const fallback = fallbackSteps.find((s) => s.stepIndex === stepIndex);
      const ownStep = own[key];
      return {
        stepIndex,
        subject: ownStep?.subject || fallback?.subjectTemplate || "",
        body: ownStep?.body || fallback?.bodyTemplate || "",
        isOwn: Boolean(ownStep?.body),
      };
    });

    return { leadId, steps };
  },

  /** Persists edited subject/body as this lead's own copy — from then on it
   *  wins over the campaign fallback for every step included, regardless of
   *  future fallback edits (same one-way precedence docx-imported leads
   *  already have). Steps not included keep whatever they had before. */
  async setLeadTemplates(
    ctx: TenantContext,
    campaignId: string,
    leadId: string,
    body: SetLeadTemplatesBody,
  ) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    const lead = await outreachLeadRepo.getById(ctx, leadId);
    if (!lead || lead.campaignId !== campaignId) throw new NotFound("Lead not found");

    const templates = { ...(getOutreachTemplates(lead.notes) ?? {}) };
    for (const step of body.steps) {
      const key = STEP_KEYS[step.stepIndex];
      if (key) templates[key] = { subject: step.subject, body: step.body };
    }

    const notes = replaceOutreachTemplatesBlock(lead.notes, templates);
    await outreachLeadRepo.updateNotes(ctx, leadId, notes);
    await auditRepo.log(ctx, {
      action: "outreach.lead.set_templates",
      targetType: "outreach_lead",
      targetId: leadId,
    });

    return { leadId, steps: body.steps };
  },

  async listLeads(
    ctx: TenantContext,
    campaignId: string,
    query: { limit?: number; offset?: number } = {},
  ) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    const [{ rows, limit, offset }, total] = await Promise.all([
      outreachLeadRepo.listByCampaign(ctx, campaignId, query),
      outreachLeadRepo.countByCampaign(ctx, campaignId),
    ]);
    return { leads: rows, total, limit, offset };
  },

  async requestLeadsUpload(
    ctx: TenantContext,
    campaignId: string,
    body: RequestLeadsUploadBody,
  ) {
    if (body.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLarge("File exceeds the 10MB limit");
    }
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");

    // Server-built key (tenant + campaign scoped, random suffix) — the client
    // filename never enters the path, so traversal is impossible (UP-09) and
    // completeLeadsUpload can verify the key actually belongs to this campaign.
    const fileKey = `tenants/${ctx.tenantId}/outreach/${campaignId}/${globalThis.crypto.randomUUID()}.docx`;

    const presign = await getServices().storage.createPresignedUpload({
      key: fileKey,
      contentType: body.contentType,
      maxBytes: MAX_UPLOAD_BYTES,
    });

    await auditRepo.log(ctx, {
      action: "outreach.leads.upload_request",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });

    return { fileKey, uploadUrl: presign.uploadUrl };
  },

  async completeLeadsUpload(
    ctx: TenantContext,
    campaignId: string,
    body: CompleteLeadsUploadBody,
  ) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");

    const expectedPrefix = `tenants/${ctx.tenantId}/outreach/${campaignId}/`;
    if (!body.fileKey.startsWith(expectedPrefix)) {
      throw new BadRequest("Unknown file for this campaign"); // IDOR guard
    }

    const exists = await getServices().storage.exists(body.fileKey);
    if (!exists) throw new BadRequest("File was not uploaded"); // UP-08

    // `requestLeadsUpload`'s 10MB check only ever saw the client-declared
    // `sizeBytes` — the presigned URL itself enforces no limit, so a client
    // can lie there and then PUT anything. Check the object Supabase
    // actually stored before trusting it; delete and reject if it's over.
    const actualSize = await getServices().storage.getObjectSize(body.fileKey);
    if (actualSize !== null && actualSize > MAX_UPLOAD_BYTES) {
      await getServices().storage.deleteObject(body.fileKey);
      throw new PayloadTooLarge("File exceeds the 10MB limit");
    }

    await outreachCampaignRepo.setStatus(ctx, campaignId, "importing");
    await auditRepo.log(ctx, {
      action: "outreach.leads.upload_complete",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });

    // Enqueueing must wait until AFTER this transaction commits — with
    // InProcessQueue (local dev), enqueue() runs the job synchronously on a
    // separate connection, which can't see the "importing" write above until
    // it's durable. Enqueueing here, mid-transaction, means the job either
    // reads the pre-commit status and silently no-ops, or deadlocks trying to
    // write a row this transaction still holds locked. The route returns this
    // closure as `afterCommit` so `withAuth` runs it post-commit.
    const tenantId = ctx.tenantId;
    const fileKey = body.fileKey;
    return {
      result: { id: campaignId, status: "importing" as const },
      afterCommit: async () => {
        try {
          await getServices().queue.enqueue(PARSE_LEADS_DOCX_JOB, {
            tenantId,
            campaignId,
            fileKey,
          });
        } catch (e) {
          // The "importing" write above is already committed — if the job
          // never actually gets enqueued, the campaign is stuck there
          // forever with no parse ever coming to move it along. Flip it to
          // "error" (same recovery shape parse-leads-docx.ts itself uses on
          // a parse failure) so the UI shows a clear, re-uploadable state
          // instead of a silent stall.
          logger.error(
            { err: e, campaignId, tenantId },
            "leads_upload_enqueue_failed",
          );
          await withTenantTx({ tenantId }, (recoveryCtx) =>
            outreachCampaignRepo.setStatus(
              recoveryCtx,
              campaignId,
              "error",
              "enqueue_failed",
            ),
          );
          throw e;
        }
      },
    };
  },

  /**
   * A single Fire sends ONE sequence step to every currently-eligible lead —
   * a lead that already got its day0 send is still eligible for day3 (see
   * `outreachLeadRepo.listEligibleForStep`). Each scheduled send is its own
   * Inngest job carrying its own `targetSendAt`, so pause/stop only need to
   * flip `campaign.status` — there's no in-memory queue state to lose, unlike
   * the old CRM's setTimeout loop.
   *
   * `leadIds` is optional — when the caller has selected specific rows in the
   * leads table, only those (still intersected with step eligibility) fire;
   * omitted/empty means "every eligible lead", preserving the original
   * all-at-once behavior for anyone who doesn't bother selecting.
   */
  async fireCampaign(
    ctx: TenantContext,
    campaignId: string,
    stepIndex: number,
    leadIds?: string[],
    /** cascadeFollowups (step 0 only): also create the Day 3/Day 7 sends now,
     *  each at its step's `dayOffset` days after the lead's own Day 0 slot —
     *  same clock time, same sender mailbox (a Gmail thread only continues
     *  from the mailbox that started it). The send job skips a follow-up
     *  whose Day 0 didn't actually go out. */
    opts?: { cascadeFollowups?: boolean },
  ) {
    await billingService.assertCapability(ctx, "outreach_bulk_fire");

    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    if (campaign.status !== "ready" && campaign.status !== "running") {
      throw new Conflict(
        `Campaign must be ready or running to fire (current status: ${campaign.status})`,
      );
    }

    const senders = await resolveCampaignSenders(ctx, campaign);
    if (senders.length === 0) {
      throw new BadRequest("Connect at least one sender account before firing");
    }

    let leads = await outreachLeadRepo.listEligibleForStep(
      ctx,
      campaignId,
      stepIndex,
      leadIds,
      campaign.channel,
    );
    if (leads.length === 0) {
      throw new Conflict("No eligible leads for this step");
    }

    // US marketing-template pause (Meta, since April 2025, no resumption
    // date): skip-and-report rather than block the whole fire, matching the
    // existing daily-cap truncation UX below. Only applies to WhatsApp
    // marketing-category templates — utility/authentication and email are
    // unaffected.
    let skippedForUsMarketingRestrictionCount = 0;
    if (campaign.channel === "whatsapp") {
      const steps = Array.isArray(campaign.sequence)
        ? (campaign.sequence as { stepIndex: number; templateId?: string }[])
        : [];
      const step = steps.find((s) => s.stepIndex === stepIndex);
      const template = step?.templateId
        ? await whatsappTemplateRepo.getById(ctx, step.templateId)
        : null;
      if (template?.category === "marketing") {
        const eligible = leads.filter((l) => !l.phone?.startsWith("+1"));
        skippedForUsMarketingRestrictionCount = leads.length - eligible.length;
        leads = eligible;
        if (leads.length === 0) {
          throw new Conflict(
            "All eligible leads are US numbers, which Meta currently blocks for marketing-category WhatsApp templates",
          );
        }
      }
    }

    // Growth is daily-capped tenant-wide (Scale's cap is Infinity, so this is
    // a no-op there) — fire as many of the eligible leads as fit in what's
    // left of today's quota and skip the rest, rather than rejecting the
    // whole fire outright.
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    const { outreachDailySendCap: cap } = getPlan(tenant?.plan || "starter");
    let skippedForDailyCapCount = 0;
    if (Number.isFinite(cap)) {
      // Held for the rest of this transaction — serializes concurrent fires
      // for this tenant around the count-then-insert below (see doc comment).
      await lockTenantForDailyCap(ctx);
      const sentToday = await outreachSendRepo.countSentTodayForTenant(ctx);
      const remaining = Math.max(cap - sentToday, 0);
      if (remaining <= 0) {
        throw new PaymentRequired(
          "You've reached your plan's daily outreach send limit — upgrade or try again tomorrow.",
        );
      }
      if (leads.length > remaining) {
        skippedForDailyCapCount = leads.length - remaining;
        leads = leads.slice(0, remaining);
      }
    }

    // Each sender mailbox also has its own `dailyLimit` (separate from the
    // tenant-wide plan cap above) — a real per-mailbox spam-threshold guard
    // that, until now, was stored and shown in the UI but never actually
    // enforced anywhere in the send path. Compute what's left today per
    // sender and fire only as many leads as the connected senders can still
    // take between them, again skipping the rest rather than failing outright.
    const senderIds = senders.map((s) => s.id);
    const sentTodayBySender = await outreachSendRepo.countSentTodayForSenders(
      ctx,
      senderIds,
    );
    const remainingBySender = new Map(
      senders.map((s) => [
        s.id,
        Math.max(s.dailyLimit - (sentTodayBySender.get(s.id) ?? 0), 0),
      ]),
    );
    const totalSenderCapacity = [...remainingBySender.values()].reduce(
      (a, b) => a + b,
      0,
    );
    let skippedForSenderCapCount = 0;
    if (totalSenderCapacity <= 0) {
      throw new PaymentRequired(
        "All connected senders have reached their daily send limit — try again tomorrow or connect another sender.",
      );
    }
    if (leads.length > totalSenderCapacity) {
      skippedForSenderCapCount = leads.length - totalSenderCapacity;
      leads = leads.slice(0, totalSenderCapacity);
    }
    const senderRotation = buildSenderRotation(
      senderIds,
      remainingBySender,
      leads.length,
    );

    const scheduled = scheduleSends({
      leadIds: leads.map((l) => l.id),
      senderAccountIds: senderRotation,
      blockMinutes: campaign.blockMinutes,
      now: new Date(),
    });

    const sends = await outreachSendRepo.bulkSchedule(
      ctx,
      scheduled.map((s) => ({
        campaignId,
        leadId: s.leadId,
        senderAccountId: s.senderAccountId,
        stepIndex,
        scheduledAt: s.scheduledAt,
      })),
    );

    // Opt-in follow-up cascade (email step-0 fires only): every step-0 send
    // just created gets its Day 3/Day 7 siblings NOW, at `dayOffset` days
    // after its own slot — same clock time, same sender (a Gmail thread only
    // continues from the mailbox that started it). Creating the rows up
    // front also blocks a later manual fire from double-sending those steps
    // (`listEligibleForStep` keys off row existence); the send job itself
    // re-validates at wake time and skips any follow-up whose Day 0 failed
    // or whose lead already replied.
    let followupSends: typeof sends = [];
    if (opts?.cascadeFollowups && stepIndex === 0 && campaign.channel === "email") {
      const steps = Array.isArray(campaign.sequence)
        ? (campaign.sequence as SequenceStep[])
        : [];
      const followupSteps = steps.filter(
        (s) => s.stepIndex > 0 && s.dayOffset > 0,
      );
      // No configured Day 3/Day 7 steps (or docx leads carrying their own
      // copy with the default 3/7 offsets) — fall back to the canonical
      // offsets so the checkbox still does what it says.
      const offsets: Array<{ stepIndex: number; dayOffset: number }> =
        followupSteps.length > 0
          ? followupSteps.map((s) => ({ stepIndex: s.stepIndex, dayOffset: s.dayOffset }))
          : [
              { stepIndex: 1, dayOffset: 3 },
              { stepIndex: 2, dayOffset: 7 },
            ];
      const dayMs = 24 * 60 * 60 * 1000;
      followupSends = await outreachSendRepo.bulkSchedule(
        ctx,
        sends.flatMap((day0) =>
          offsets.map((step) => ({
            campaignId,
            leadId: day0.leadId,
            senderAccountId: day0.senderAccountId,
            stepIndex: step.stepIndex,
            scheduledAt: new Date(
              day0.scheduledAt.getTime() + step.dayOffset * dayMs,
            ),
          })),
        ),
        // A lead may already carry a manually-fired day3/day7 row — that
        // one wins; skip the auto-scheduled duplicate instead of aborting
        // the whole cascade.
        { ignoreConflicts: true },
      );
    }

    // Snapshot each lead's pre-fire status so a failed enqueue (below) can
    // restore it exactly, rather than guessing a value like "pending" that
    // may be wrong for a lead already partway through the sequence.
    const priorLeadStatuses = leads.map((l) => ({
      id: l.id,
      status: l.status,
    }));
    const priorCampaignStatus = campaign.status;

    await outreachLeadRepo.setStatusMany(
      ctx,
      leads.map((l) => l.id),
      "scheduled",
    );
    await outreachCampaignRepo.setStatus(ctx, campaignId, "running");
    await auditRepo.log(ctx, {
      action: "outreach.campaign.fire",
      targetType: "outreach_campaign",
      targetId: campaignId,
      metadata: {
        stepIndex,
        count: sends.length,
        followupCount: followupSends.length,
        skippedForDailyCapCount,
        skippedForSenderCapCount,
        skippedForUsMarketingRestrictionCount,
      },
    });

    // Deferred to `afterCommit` — same reasoning as `completeLeadsUpload`:
    // InProcessQueue runs each send job synchronously, on a separate
    // connection, which must not start before the `outreachSends` rows
    // above are actually committed and visible.
    const tenantId = ctx.tenantId;
    const allSends = [...sends, ...followupSends];
    const sendIds = allSends.map((send) => send.id);
    const sendJobs = allSends.map((send) => ({
      tenantId,
      sendId: send.id,
      targetSendAt: send.scheduledAt.toISOString(),
    }));

    const sendJob =
      campaign.channel === "whatsapp"
        ? SEND_OUTREACH_WHATSAPP_JOB
        : SEND_OUTREACH_EMAIL_JOB;

    return {
      result: {
        id: campaignId,
        status: "running" as const,
        scheduled: sends.length,
        followupsScheduled: followupSends.length,
        skippedForDailyCapCount,
        skippedForSenderCapCount,
        skippedForUsMarketingRestrictionCount,
      },
      afterCommit: async () => {
        try {
          // One call for the whole fire — either every send job lands or
          // none do, so the recovery below never has to reason about which
          // subset of a partially-sent batch actually made it to Inngest.
          await getServices().queue.enqueueBatch(sendJob, sendJobs);
        } catch (e) {
          // The `outreachSends` rows and "scheduled" lead/campaign statuses
          // above are already committed. Left as-is, these leads would be
          // permanently stuck: `listEligibleForStep` excludes any lead with
          // an existing send row for this step regardless of its status, so
          // a later retry of Fire would silently skip every one of them
          // forever. Undo the writes in a fresh transaction so the next
          // Fire click picks these leads back up.
          logger.error(
            { err: e, campaignId, tenantId, count: sendIds.length },
            "fire_campaign_enqueue_failed",
          );
          await withTenantTx({ tenantId }, async (recoveryCtx) => {
            await outreachSendRepo.deleteByIds(recoveryCtx, sendIds);
            await Promise.all(
              priorLeadStatuses.map((l) =>
                outreachLeadRepo.setStatus(recoveryCtx, l.id, l.status),
              ),
            );
            if (priorCampaignStatus !== "running") {
              await outreachCampaignRepo.setStatus(
                recoveryCtx,
                campaignId,
                priorCampaignStatus,
              );
            }
          });
          throw e;
        }
      },
    };
  },

  /**
   * Schedules a future Fire instead of firing immediately — same eligibility
   * gate as `fireCampaign` (checked again at fire time, since the wait can
   * be days) plus a future-time check. The enqueued job (`fire-scheduled-campaign.ts`)
   * re-reads `scheduledFireAt` off the campaign row before acting, so
   * canceling or rescheduling (both just DB writes here) makes any earlier
   * wake-up a safe no-op without needing to cancel the job itself.
   */
  async scheduleFire(
    ctx: TenantContext,
    campaignId: string,
    stepIndex: number,
    scheduledFireAt: Date,
    leadIds?: string[],
    /** Persisted with the schedule and honored by the wake-up job — see
     *  fireCampaign's cascadeFollowups option. */
    opts?: { cascadeFollowups?: boolean },
  ) {
    await billingService.assertCapability(ctx, "outreach_bulk_fire");
    await billingService.assertCapability(ctx, "outreach_scheduler");

    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    if (campaign.status !== "ready" && campaign.status !== "running") {
      throw new Conflict(
        `Campaign must be ready or running to schedule a fire (current status: ${campaign.status})`,
      );
    }
    if (scheduledFireAt.getTime() <= Date.now()) {
      throw new BadRequest("Scheduled time must be in the future");
    }

    await outreachCampaignRepo.setScheduledFire(ctx, campaignId, {
      scheduledFireAt,
      stepIndex,
      leadIds: leadIds && leadIds.length > 0 ? leadIds : null,
      cascadeFollowups: opts?.cascadeFollowups ?? false,
    });
    await auditRepo.log(ctx, {
      action: "outreach.campaign.schedule_fire",
      targetType: "outreach_campaign",
      targetId: campaignId,
      metadata: {
        stepIndex,
        scheduledFireAt: scheduledFireAt.toISOString(),
        cascadeFollowups: opts?.cascadeFollowups ?? false,
      },
    });

    const tenantId = ctx.tenantId;
    return {
      result: { id: campaignId, scheduledFireAt: scheduledFireAt.toISOString() },
      afterCommit: async () => {
        try {
          await getServices().queue.enqueue(FIRE_SCHEDULED_CAMPAIGN_JOB, {
            tenantId,
            campaignId,
            scheduledFireAt: scheduledFireAt.toISOString(),
          });
        } catch (e) {
          // `scheduledFireAt` is already committed on the campaign — if the
          // wake-up job never gets enqueued, that time will just pass with
          // nothing happening and no error surfaced anywhere. Clear it so
          // the campaign falls back to "no schedule set" (matching what the
          // user sees right now, since the request is about to fail) rather
          // than silently promising a fire that will never come.
          logger.error(
            { err: e, campaignId, tenantId },
            "schedule_fire_enqueue_failed",
          );
          await withTenantTx({ tenantId }, (recoveryCtx) =>
            outreachCampaignRepo.clearScheduledFire(recoveryCtx, campaignId),
          );
          throw e;
        }
      },
    };
  },

  async cancelScheduledFire(ctx: TenantContext, campaignId: string) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    await outreachCampaignRepo.clearScheduledFire(ctx, campaignId);
    await auditRepo.log(ctx, {
      action: "outreach.campaign.cancel_scheduled_fire",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });
    return { id: campaignId };
  },

  /** Deletes a campaign and, via FK cascade, all of its leads and sends. No
   *  storage cleanup needed — the imported leads docx is never persisted past
   *  the parse job (unlike a resume's stored file). A campaign's in-flight
   *  sends are already safe to orphan: `sendOutreachEmail` looks the send row
   *  up by id first and no-ops if it's gone (see server/jobs/send-outreach-email.ts). */
  async deleteCampaign(ctx: TenantContext, campaignId: string) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    await outreachCampaignRepo.remove(ctx, campaignId);
    await auditRepo.log(ctx, {
      action: "outreach.campaign.delete",
      targetType: "outreach_campaign",
      targetId: campaignId,
      metadata: { name: campaign.name },
    });
    return { deleted: true };
  },

  async pauseCampaign(ctx: TenantContext, campaignId: string) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    if (campaign.status !== "running") {
      throw new Conflict("Only a running campaign can be paused");
    }
    await outreachCampaignRepo.setStatus(ctx, campaignId, "paused");
    await auditRepo.log(ctx, {
      action: "outreach.campaign.pause",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });
    return { id: campaignId, status: "paused" as const };
  },

  async resumeCampaign(ctx: TenantContext, campaignId: string) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    if (campaign.status !== "paused") {
      throw new Conflict("Only a paused campaign can be resumed");
    }
    await outreachCampaignRepo.setStatus(ctx, campaignId, "running");
    await auditRepo.log(ctx, {
      action: "outreach.campaign.resume",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });
    return { id: campaignId, status: "running" as const };
  },

  async stopCampaign(ctx: TenantContext, campaignId: string) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    if (campaign.status !== "running" && campaign.status !== "paused") {
      throw new Conflict("Campaign is not active");
    }
    await outreachCampaignRepo.setStatus(ctx, campaignId, "completed");
    // Stop is terminal — eagerly skip whatever's still pending instead of
    // waiting for each send's own job to wake up and self-check, so the
    // leads table reflects "won't send" immediately rather than looking
    // like it's still counting down to a live send.
    await outreachSendRepo.skipScheduledForCampaign(
      ctx,
      campaignId,
      "campaign_not_running",
    );
    await auditRepo.log(ctx, {
      action: "outreach.campaign.stop",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });
    return { id: campaignId, status: "completed" as const };
  },

  async listSenders(ctx: TenantContext) {
    const rows = await senderAccountRepo.list(ctx);
    return rows.map(toPublicSender);
  },

  async createSmtpSender(ctx: TenantContext, body: CreateSmtpSenderBody) {
    await billingService.assertCapability(ctx, "outreach_bulk_fire");

    const existing = await senderAccountRepo.getByEmail(ctx, body.email);
    if (existing && !existing.deletedAt)
      throw new Conflict("A sender account with this email already exists");

    // A soft-deleted row with the same email is a previously-disconnected
    // sender — revive it in place (same rationale as the Gmail reconnect
    // path) instead of inserting a new row, which would collide with the
    // unique (tenantId, email) index and would otherwise lose whatever
    // outreach_sends history still references the old id.
    if (existing) {
      const revived = await senderAccountRepo.reviveSmtp(ctx, existing.id, {
        label: body.label,
        fromName: body.fromName,
        dailyLimit: body.dailyLimit,
        smtpHost: body.smtpHost,
        smtpPort: body.smtpPort,
        smtpSecure: body.smtpSecure,
        smtpUsername: body.smtpUsername,
        smtpPasswordEnc: encryptSecret(body.smtpPassword),
      });
      await auditRepo.log(ctx, {
        action: "outreach.sender.create_smtp",
        targetType: "sender_account",
        targetId: existing.id,
        metadata: { revived: true },
      });
      return toPublicSender(revived!);
    }

    await assertSenderCapacity(ctx);
    const sender = await senderAccountRepo.createSmtp(ctx, {
      label: body.label,
      email: body.email,
      fromName: body.fromName,
      dailyLimit: body.dailyLimit,
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort,
      smtpSecure: body.smtpSecure,
      smtpUsername: body.smtpUsername,
      smtpPasswordEnc: encryptSecret(body.smtpPassword),
    });
    await auditRepo.log(ctx, {
      action: "outreach.sender.create_smtp",
      targetType: "sender_account",
      targetId: sender.id,
    });
    return toPublicSender(sender);
  },

  async createWhatsAppSender(ctx: TenantContext, body: CreateWhatsAppSenderBody) {
    await billingService.assertCapability(ctx, "outreach_bulk_fire");
    await billingService.assertCapability(ctx, "whatsapp_channel");

    const existing = await senderAccountRepo.getByEmail(ctx, body.phoneNumber);
    if (existing && !existing.deletedAt)
      throw new Conflict("A sender account with this phone number already exists");

    // See createSmtpSender above — revive a soft-deleted row instead of
    // inserting a new one.
    if (existing) {
      const revived = await senderAccountRepo.reviveWhatsApp(ctx, existing.id, {
        label: body.label,
        whatsappPhoneNumberId: body.whatsappPhoneNumberId,
        whatsappWabaId: body.whatsappWabaId,
        whatsappAccessTokenEnc: encryptSecret(body.whatsappAccessToken),
        whatsappDisplayName: body.whatsappDisplayName,
        dailyLimit: body.dailyLimit,
      });
      await auditRepo.log(ctx, {
        action: "outreach.sender.create_whatsapp",
        targetType: "sender_account",
        targetId: existing.id,
        metadata: { revived: true },
      });
      return toPublicSender(revived!);
    }

    await assertSenderCapacity(ctx);
    const sender = await senderAccountRepo.createWhatsApp(ctx, {
      label: body.label,
      phoneNumber: body.phoneNumber,
      whatsappPhoneNumberId: body.whatsappPhoneNumberId,
      whatsappWabaId: body.whatsappWabaId,
      whatsappAccessTokenEnc: encryptSecret(body.whatsappAccessToken),
      whatsappDisplayName: body.whatsappDisplayName,
      dailyLimit: body.dailyLimit,
    });
    await auditRepo.log(ctx, {
      action: "outreach.sender.create_whatsapp",
      targetType: "sender_account",
      targetId: sender.id,
    });
    return toPublicSender(sender);
  },

  async listWhatsAppTemplates(ctx: TenantContext) {
    return await whatsappTemplateRepo.list(ctx);
  },

  /** Submits a new template to Meta for approval — the only way a template
   *  reaches `status: "approved"` and becomes usable in a sequence step (see
   *  the structural enforcement note in send-outreach-whatsapp.ts). Actual
   *  approval is async: Meta reviews and pushes a webhook event (or the
   *  cron-triggered sync job reconciles it) — this call only records the
   *  submission as "pending". */
  async submitWhatsAppTemplate(ctx: TenantContext, body: SubmitWhatsAppTemplateBody) {
    await billingService.assertCapability(ctx, "whatsapp_channel");
    const sender = await senderAccountRepo.getById(ctx, body.senderAccountId);
    if (!sender || sender.type !== "whatsapp") {
      throw new NotFound("WhatsApp sender account not found");
    }
    if (!sender.whatsappWabaId || !sender.whatsappAccessTokenEnc) {
      throw new BadRequest("This sender is missing WhatsApp credentials");
    }

    const placeholderCount = (body.bodyText.match(/\{\{\d+\}\}/g) ?? []).length;

    let metaTemplateId: string | undefined;
    try {
      const result = await getServices().whatsappTemplateManager.submit({
        wabaId: sender.whatsappWabaId,
        accessToken: decryptSecret(sender.whatsappAccessTokenEnc),
        name: body.metaTemplateName,
        category: body.category,
        language: body.language,
        bodyText: body.bodyText,
      });
      metaTemplateId = result.metaTemplateId;
    } catch (e) {
      logger.error({ err: e }, "whatsapp_template_submit_failed");
      throw new BadRequest(
        e instanceof Error ? e.message : "Failed to submit template to Meta",
      );
    }

    const template = await whatsappTemplateRepo.create(ctx, {
      senderAccountId: sender.id,
      metaTemplateName: body.metaTemplateName,
      category: body.category,
      language: body.language,
      bodyText: body.bodyText,
      placeholderCount,
      metaTemplateId,
    });
    await auditRepo.log(ctx, {
      action: "outreach.whatsapp_template.submit",
      targetType: "whatsapp_template",
      targetId: template.id,
    });
    return template;
  },

  async setSenderActive(
    ctx: TenantContext,
    senderId: string,
    isActive: boolean,
  ) {
    const sender = await senderAccountRepo.getById(ctx, senderId);
    if (!sender || sender.deletedAt) throw new NotFound("Sender account not found");
    await senderAccountRepo.setActive(ctx, senderId, isActive);
    return { id: senderId, isActive };
  },

  async removeSender(ctx: TenantContext, senderId: string) {
    const removed = await senderAccountRepo.remove(ctx, senderId);
    if (!removed) throw new NotFound("Sender account not found");
    await auditRepo.log(ctx, {
      action: "outreach.sender.remove",
      targetType: "sender_account",
      targetId: senderId,
    });
  },

  /** On-demand SPF/DKIM/DMARC diagnostic for a sender's own domain — see
   *  lib/dns-health.ts's doc comment. Purely a read: nothing here gates
   *  sending or changes any stored state, so there's no reason to run it
   *  eagerly for every sender on every page load — the route/UI call this
   *  only when a user explicitly asks. Shared across Bulk Fire and
   *  automated-outreach, since both send through the same connected
   *  mailboxes and deliverability is a property of the SENDER, not the
   *  campaign type. */
  async checkSenderDeliverability(ctx: TenantContext, senderId: string) {
    const sender = await senderAccountRepo.getById(ctx, senderId);
    if (!sender || sender.deletedAt) throw new NotFound("Sender account not found");
    const domain = sender.email.split("@")[1];
    if (!domain) throw new BadRequest("This sender has no email domain to check");
    return await checkDomainDeliverability(domain);
  },

  /** Authenticated "start" half of the Gmail connect flow — the frontend
   *  redirects the browser to this URL. `state` carries who started the
   *  flow so the public callback (no bearer token, no session) can recover
   *  a trustworthy tenantId without one. */
  buildGmailOAuthUrl(
    tenantId: string,
    userId: string | undefined,
    appOrigin: string,
  ): string {
    const client = gmailOAuthClient(appOrigin);
    const state = signOAuthState({ tenantId, userId: userId ?? "" });
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_OAUTH_SCOPES,
      state,
    });
  },

  /** Public callback half — verifies `state` itself (no session available),
   *  then opens its own tenant-scoped tx with the recovered tenantId. */
  async completeGmailOAuth(params: {
    code: string;
    state: string;
    appOrigin: string;
  }) {
    const claims = verifyOAuthState(params.state);
    if (!claims) throw new BadRequest("Invalid or expired OAuth state");

    const client = gmailOAuthClient(params.appOrigin);
    const { tokens } = await client.getToken(params.code);
    if (!tokens.refresh_token) {
      throw new BadRequest(
        "Google didn't return offline access — revoke this app at https://myaccount.google.com/permissions and reconnect",
      );
    }
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email;
    if (!email) throw new BadRequest("Google account has no email");
    const fromName = data.name ?? undefined;

    // What Google ACTUALLY granted (the consent screen lets users untick
    // scopes) — not what we asked for. Read access is optional: it only
    // powers the follow-up reply-stop check, which fails open without it.
    const grantedScopes = (tokens.scope ?? "").split(/\s+/);
    const gmailHasReadScope = grantedScopes.includes(GMAIL_READ_SCOPE);

    return await withTenantTx(
      { tenantId: claims.tenantId, userId: claims.userId || undefined },
      async (ctx) => {
        await billingService.assertCapability(ctx, "outreach_bulk_fire");

        // Reconnecting an already-linked mailbox refreshes its credentials
        // in place (that's how a pre-read-scope account upgrades to
        // reply-stop) — only a NEW mailbox counts against sender capacity.
        const existing = await senderAccountRepo.getByEmail(ctx, email);
        if (existing) {
          if (existing.type !== "gmail") {
            throw new Conflict(
              "This email is already connected as a non-Gmail sender",
            );
          }
          const updated = await senderAccountRepo.updateGmailCredentials(
            ctx,
            existing.id,
            {
              gmailRefreshTokenEnc: encryptSecret(tokens.refresh_token as string),
              gmailHasReadScope,
            },
          );
          await auditRepo.log(ctx, {
            action: "outreach.sender.reconnect_gmail",
            targetType: "sender_account",
            targetId: existing.id,
            metadata: { gmailHasReadScope },
          });
          return toPublicSender(updated ?? existing);
        }

        await assertSenderCapacity(ctx);
        const sender = await senderAccountRepo.createGmail(ctx, {
          label: email,
          email,
          fromName,
          gmailRefreshTokenEnc: encryptSecret(tokens.refresh_token as string),
          gmailHasReadScope,
        });
        await auditRepo.log(ctx, {
          action: "outreach.sender.create_gmail",
          targetType: "sender_account",
          targetId: sender.id,
        });
        return toPublicSender(sender);
      },
    );
  },
};
