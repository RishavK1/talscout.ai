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
import type { SequenceStep } from "@/server/repositories/outreach.repo";
import { encryptSecret } from "@/server/lib/secret-box";
import { signOAuthState, verifyOAuthState } from "@/server/lib/oauth-state";
import { getServices } from "@/server/container";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { auditRepo } from "@/server/repositories/audit.repo";
import { MAX_UPLOAD_BYTES } from "@/server/ingestion/file-type";
import { PARSE_LEADS_DOCX_JOB } from "@/server/jobs/parse-leads-docx";
import { SEND_OUTREACH_EMAIL_JOB } from "@/server/jobs/send-outreach-email";
import { FIRE_SCHEDULED_CAMPAIGN_JOB } from "@/server/jobs/fire-scheduled-campaign";
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
  RequestLeadsUploadBody,
  CompleteLeadsUploadBody,
  CreateSmtpSenderBody,
  SetLeadTemplatesBody,
  SetCampaignSendersBody,
} from "@/server/validation/outreach";

const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

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

/** `senderAccountRepo` rows carry `smtpPasswordEnc`/`gmailRefreshTokenEnc` —
 *  ciphertext, not plaintext, but still an internal column that should never
 *  round-trip to the client. `withAuth` serializes whatever a handler returns
 *  verbatim, so every method that surfaces a sender row maps through this
 *  first rather than relying on callers to remember to strip it. */
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
    const [counts, leadCount] = await Promise.all([
      outreachSendRepo.countsByCampaign(ctx, campaignId),
      outreachLeadRepo.countByCampaign(ctx, campaignId),
    ]);
    return { campaign, counts, leadCount };
  },

  async createCampaign(ctx: TenantContext, body: CreateCampaignBody) {
    await billingService.assertCapability(ctx, "outreach_bulk_fire");
    const campaign = await outreachCampaignRepo.create(ctx, body.name);
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
    );
    if (leads.length === 0) {
      throw new Conflict("No eligible leads for this step");
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

    // Snapshot each lead's pre-fire status so a failed enqueue (below) can
    // restore it exactly, rather than guessing a value like "pending" that
    // may be wrong for a lead already partway through the sequence.
    const priorLeadStatuses = leads.map((l) => ({
      id: l.id,
      status: l.status,
    }));
    const priorCampaignStatus = campaign.status;

    await Promise.all(
      leads.map((l) => outreachLeadRepo.setStatus(ctx, l.id, "scheduled")),
    );
    await outreachCampaignRepo.setStatus(ctx, campaignId, "running");
    await auditRepo.log(ctx, {
      action: "outreach.campaign.fire",
      targetType: "outreach_campaign",
      targetId: campaignId,
      metadata: {
        stepIndex,
        count: sends.length,
        skippedForDailyCapCount,
        skippedForSenderCapCount,
      },
    });

    // Deferred to `afterCommit` — same reasoning as `completeLeadsUpload`:
    // InProcessQueue runs each send job synchronously, on a separate
    // connection, which must not start before the `outreachSends` rows
    // above are actually committed and visible.
    const tenantId = ctx.tenantId;
    const sendIds = sends.map((send) => send.id);
    const sendJobs = sends.map((send) => ({
      tenantId,
      sendId: send.id,
      targetSendAt: send.scheduledAt.toISOString(),
    }));

    return {
      result: {
        id: campaignId,
        status: "running" as const,
        scheduled: sends.length,
        skippedForDailyCapCount,
        skippedForSenderCapCount,
      },
      afterCommit: async () => {
        try {
          // One call for the whole fire — either every send job lands or
          // none do, so the recovery below never has to reason about which
          // subset of a partially-sent batch actually made it to Inngest.
          await getServices().queue.enqueueBatch(
            SEND_OUTREACH_EMAIL_JOB,
            sendJobs,
          );
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
    });
    await auditRepo.log(ctx, {
      action: "outreach.campaign.schedule_fire",
      targetType: "outreach_campaign",
      targetId: campaignId,
      metadata: { stepIndex, scheduledFireAt: scheduledFireAt.toISOString() },
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
    await assertSenderCapacity(ctx);

    const existing = await senderAccountRepo.getByEmail(ctx, body.email);
    if (existing)
      throw new Conflict("A sender account with this email already exists");

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

  async setSenderActive(
    ctx: TenantContext,
    senderId: string,
    isActive: boolean,
  ) {
    const sender = await senderAccountRepo.getById(ctx, senderId);
    if (!sender) throw new NotFound("Sender account not found");
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

    return await withTenantTx(
      { tenantId: claims.tenantId, userId: claims.userId || undefined },
      async (ctx) => {
        await billingService.assertCapability(ctx, "outreach_bulk_fire");
        await assertSenderCapacity(ctx);

        const existing = await senderAccountRepo.getByEmail(ctx, email);
        if (existing)
          throw new Conflict("This Gmail account is already connected");
        const sender = await senderAccountRepo.createGmail(ctx, {
          label: email,
          email,
          fromName,
          gmailRefreshTokenEnc: encryptSecret(tokens.refresh_token as string),
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
