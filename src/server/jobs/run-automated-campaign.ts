import { withTenantTx } from "@/server/db/tx";
import {
  automatedCampaignRepo,
  automatedLeadRepo,
  automatedSendRepo,
} from "@/server/repositories/automated-outreach.repo";
import { blueprintRepo } from "@/server/repositories/blueprint.repo";
import { scheduleSends } from "@/server/lib/spintax";
import {
  lockTenantForAutomatedDailyCap,
  automatedDailySendCapFor,
} from "@/server/services/automated-outreach.service";
import { SEND_AUTOMATED_EMAIL_JOB } from "@/server/jobs/send-automated-email";
import { inlineStepRun, type StepRun } from "@/server/jobs/step-runner";
import { logger } from "@/server/observability/logger";
import { normalizeLeadQualification } from "@/server/lib/lead-qualification";
import type { Services, BlueprintSections, BlueprintLeadQualification } from "@/server/ports";
import type { automatedCampaigns, automatedLeads } from "@/server/db/schema";

/** Minutes per pacing block — mirrors Bulk Fire's default `blockMinutes`
 *  (see outreachCampaigns.blockMinutes), applied here via the exact same
 *  block+jitter algorithm (scheduleSends) so a single mailbox never fires a
 *  whole batch in the same minute. Lighter than Bulk Fire's per-campaign
 *  configurability for now — a fixed, sane default. */
const AUTOMATED_SEND_BLOCK_MINUTES = 4;

/** Discovery pool sizing — see runOneCampaign's Phase 1 doc comment. */
const DISCOVERY_POOL_MULTIPLIER = 8;
const DISCOVERY_POOL_CAP = 200;

/** Enrichment — see runOneCampaign's Phase 2 doc comment. `ENRICH_BATCH_SIZE`
 *  now doubles as the step-checkpoint granularity: each batch is its own
 *  Inngest step, so a tick that needs the full budget (worst case, a sparse
 *  discovery area) checkpoints every 15 leads instead of running all 150
 *  enrichment lookups as one un-resumable unit of work. */
const ENRICH_BUDGET_PER_TICK = 150;
const ENRICH_BATCH_SIZE = 15;

/** Copy generation — smaller batches than enrichment since each call is a
 *  real (slower, costlier) AI generation, not a fast lookup. */
const GENERATE_BATCH_SIZE = 10;

/** Day 3/Day 7 follow-ups, days after Day 0's own (already-jittered)
 *  scheduledAt — same offsets and same-sender-for-thread-continuity as
 *  Bulk Fire's cascadeFollowups (outreach.service.ts's fireCampaign). */
const FOLLOW_UP_DAY_OFFSETS: Record<1 | 2, number> = { 1: 3, 2: 7 };

type Campaign = typeof automatedCampaigns.$inferSelect;
type Lead = typeof automatedLeads.$inferSelect;
interface GeneratedCopy {
  leadId: string;
  email: string;
  stepIndex: 0 | 1 | 2;
  subject: string;
  body: string;
}

/**
 * Cron-triggered (see the Inngest function registration in
 * src/app/api/inngest/route.ts — runs every 6 hours by default) discover →
 * enrich → generate → send pipeline, run once per ACTIVE automated campaign
 * across every tenant. One campaign's failure is isolated (logged, that
 * campaign marked "error") and never blocks the others in the same tick.
 *
 * `stepRun` is Inngest's real step-checkpointing hook when called from the
 * cron function, or the inline no-op default for tests/manual runs — see
 * step-runner.ts. Each phase below is wrapped in it, in bounded batches, so
 * a crash/timeout partway through a tick resumes from the next unfinished
 * batch instead of redoing already-completed (and quota-costly) work.
 */
export async function runAutomatedCampaigns(
  services: Services,
  stepRun: StepRun = inlineStepRun,
): Promise<void> {
  const campaigns = await automatedCampaignRepo.listActiveAdmin();
  for (const campaign of campaigns) {
    await runOneCampaignIsolated(campaign, services, stepRun);
  }
}

/** Runs a single campaign immediately, outside the 6-hour cron cadence —
 *  triggered right when a campaign is activated (see
 *  automated-outreach.service.ts's activateCampaign) so "click Activate"
 *  discovers its first leads in seconds, not up to 6 hours later. Reuses
 *  the exact same discover/enrich/qualify/generate/send pipeline and error
 *  isolation as the cron sweep — a failure here marks only this campaign
 *  "error", same as a failure mid-sweep would. */
export async function runAutomatedCampaignNow(
  campaignId: string,
  services: Services,
  stepRun: StepRun = inlineStepRun,
): Promise<void> {
  const campaign = await automatedCampaignRepo.getByIdAdmin(campaignId);
  if (!campaign || campaign.status !== "active") {
    // Defensive no-op: the campaign could have been paused/deleted in the
    // gap between the activation request enqueueing this job and it running.
    logger.warn({ campaignId }, "automated_campaign_run_now_skipped_not_active");
    return;
  }
  await runOneCampaignIsolated(campaign, services, stepRun);
}

async function runOneCampaignIsolated(
  campaign: Campaign,
  services: Services,
  stepRun: StepRun,
): Promise<void> {
  try {
    await runOneCampaign(campaign, services, stepRun);
  } catch (err) {
    logger.error({ err, campaignId: campaign.id }, "automated_campaign_run_failed");
    await automatedCampaignRepo.setErrorAdmin(
      campaign.id,
      err instanceof Error ? err.message : "automated_campaign_run_failed",
    );
  }
}

async function runOneCampaign(
  campaign: Campaign,
  services: Services,
  stepRun: StepRun,
): Promise<void> {
  const tenantId = campaign.tenantId;
  const cid = campaign.id;

  // Fetched up front (not just before copy generation, as before) — lead
  // qualification during discovery/enrichment below needs the blueprint's
  // `leadQualification` criteria just as much as copy generation needs its
  // other sections.
  const blueprint = await withTenantTx({ tenantId }, (ctx) =>
    blueprintRepo.getById(ctx, campaign.blueprintId),
  );
  if (!blueprint?.sections) {
    // Throw (rather than silently return) so runOneCampaignIsolated's
    // existing catch flips the campaign to "error" with this message — a
    // campaign whose blueprint became unusable (deleted, archived without
    // ever generating sections) used to sit "active" forever, doing
    // nothing, with zero indication to the user of why nothing was
    // happening. This was reachable even with the blueprint-delete guard
    // added elsewhere, since that guard only covers the delete path, not
    // every way a blueprint could end up without sections.
    throw new Error(
      "This campaign's blueprint is missing or hasn't been generated yet — reassign a valid blueprint to resume.",
    );
  }
  const sections = blueprint.sections as BlueprintSections;
  const styleExamples = (campaign.styleExamples as string[] | null) ?? undefined;

  // ---- Phase 1: discover (one step) ----
  // `maxLeadsPerRun` is a target of USABLE (email-bearing) leads, not raw
  // discoveries — most raw candidates have no findable email, so stopping at
  // maxLeadsPerRun candidates would strand a campaign at zero forever in a
  // sparse area (each rerun re-finds the same already-no_email businesses,
  // dedup skips them, nothing new happens). Fetch a much larger candidate
  // pool up front and let enrichment below chew through it until the target
  // is met or the pool runs out.
  const { readyFound: readyFromDiscovery } = await stepRun(`discover-${cid}`, () =>
    discoverPhase(campaign, services, tenantId, sections),
  );

  // ---- Phase 2: enrich (email-finder waterfall) until the target is met ----
  // Keep pulling candidates until we've FOUND maxLeadsPerRun leads with an
  // email, the pool is exhausted, or the per-tick enrichment budget is spent
  // (bounds site fetches and Hunter/Apollo/Snov free-tier credit burn;
  // whatever is left stays "discovered" for the next tick). Listings that
  // arrived with an email already on them (source: osm) count toward the
  // target via readyFromDiscovery. Each batch is its own step (see
  // ENRICH_BATCH_SIZE's doc comment above).
  let readyFound = readyFromDiscovery;
  let enrichedThisTick = 0;
  let enrichBatchIndex = 0;
  while (readyFound < campaign.maxLeadsPerRun && enrichedThisTick < ENRICH_BUDGET_PER_TICK) {
    const batchLimit = Math.min(ENRICH_BATCH_SIZE, ENRICH_BUDGET_PER_TICK - enrichedThisTick);
    const batchResult = await stepRun(`enrich-${cid}-${enrichBatchIndex}`, () =>
      enrichBatch(campaign, services, tenantId, batchLimit, sections),
    );
    enrichBatchIndex++;
    if (batchResult.processed === 0) break; // pool exhausted
    readyFound += batchResult.readyDelta;
    enrichedThisTick += batchResult.processed;
  }

  // ---- Phase 3: generate copy, gated by the plan's daily cap ----

  // Budget is an ESTIMATE used to bound how many (potentially slow) AI calls
  // we attempt — the AUTHORITATIVE cap check happens later, in a short
  // locked transaction with no external I/O inside it (see Phase 4 below).
  // The cap is per-plan (see automatedDailySendCapFor); resolved once here
  // and reused below so a mid-tick plan change can't produce two different
  // budgets within the same run.
  const dailyCap = await automatedDailySendCapFor(tenantId);
  const sentSoFar = await withTenantTx({ tenantId }, (ctx) =>
    automatedSendRepo.countScheduledOrSentTodayForTenant(ctx),
  );
  const budget = Math.max(dailyCap - sentSoFar, 0);
  if (budget <= 0) return;

  const ready = await withTenantTx({ tenantId }, (ctx) =>
    automatedLeadRepo.listReadyForCopy(ctx, campaign.id, budget),
  );
  if (ready.length === 0) return;

  // Each batch of AI copy-generation calls is its own step — a full 50-lead
  // batch of real Gemini calls is exactly the kind of slow, external-I/O-
  // heavy work that must never run as one un-resumable unit.
  const generated: GeneratedCopy[] = [];
  for (let i = 0; i < ready.length; i += GENERATE_BATCH_SIZE) {
    const batch = ready.slice(i, i + GENERATE_BATCH_SIZE);
    const batchGenerated = await stepRun(`generate-${cid}-${i / GENERATE_BATCH_SIZE}`, () =>
      generateCopyBatch(batch, sections, styleExamples, campaign, services),
    );
    generated.push(...batchGenerated);
  }
  if (generated.length === 0) return;

  // ---- Phase 4: authoritative cap-check + schedule + enqueue (one step) ----
  // Kept as a single step deliberately: its work is DB-only plus a queue
  // call (fast, no slow external AI/HTTP calls), and combining "insert
  // scheduled sends" with "enqueue their send jobs" in one step avoids a
  // subtle correctness trap — Inngest persists a step's return value as
  // JSON, so a `Date` field returned from one step comes back as a plain
  // string on replay in any step that reads it. Doing both in one step means
  // nothing ever reads a schedule row's `scheduledAt` after it's crossed a
  // step boundary.
  await stepRun(`schedule-and-enqueue-${cid}`, () =>
    scheduleAndEnqueue(campaign, generated, tenantId, services, dailyCap),
  );
}

/** The free, no-AI-call path — resolves everything except the one genuinely
 *  ambiguous case (campaign wants businesses WITHOUT a good website, and
 *  this lead has a website URL, so whether this specific site counts as
 *  "good" needs real judgment). Returns null when that judgment call is the
 *  only thing left to decide. */
function qualifyLeadCheaply(
  q: BlueprintLeadQualification,
  lead: { website?: string | null },
): { qualified: boolean; reason: string } | null {
  const hasWebsite = !!lead.website;
  if (q.websiteRequirement === "any") {
    return { qualified: true, reason: "No targeting restriction" };
  }
  if (q.websiteRequirement === "no_or_weak_site") {
    return hasWebsite
      ? null
      : { qualified: true, reason: "No website found — matches target profile" };
  }
  // "has_site"
  return hasWebsite
    ? { qualified: true, reason: "Has an existing website" }
    : { qualified: false, reason: "No website found — campaign targets businesses with an existing site" };
}

async function qualifyLead(
  services: Services,
  sections: BlueprintSections,
  lead: { businessName: string; category?: string | null; website?: string | null },
): Promise<{ qualified: boolean; reason: string }> {
  const q = normalizeLeadQualification(sections.leadQualification);
  const cheap = qualifyLeadCheaply(q, lead);
  if (cheap) return cheap;
  try {
    return await services.leadQualifier.qualify({
      blueprint: sections,
      lead: {
        businessName: lead.businessName,
        category: lead.category ?? undefined,
        website: lead.website ?? undefined,
      },
    });
  } catch (err) {
    logger.warn({ err }, "automated_lead_qualification_failed_defaulting_to_qualified");
    return { qualified: true, reason: "Qualification check failed — defaulting to include" };
  }
}

async function discoverPhase(
  campaign: Campaign,
  services: Services,
  tenantId: string,
  sections: BlueprintSections,
): Promise<{ readyFound: number }> {
  const discoveryQuery = campaign.discoveryQuery as {
    category: string;
    location: { lat: number; lon: number; radiusMeters: number } | { text: string };
  };
  let discovered;
  try {
    discovered = await services.leadDiscovery.discover({
      category: discoveryQuery.category,
      location: discoveryQuery.location,
      limit: Math.min(campaign.maxLeadsPerRun * DISCOVERY_POOL_MULTIPLIER, DISCOVERY_POOL_CAP),
    });
  } catch (err) {
    // A transient discovery-provider outage must never permanently halt the
    // campaign (runAutomatedCampaigns' outer catch would mark it "error" and
    // it's excluded from every future cron tick — unrecoverable without a
    // human noticing days later). Skip this tick; the next one retries
    // discovery fresh, same as enrichBatch already does for email-finder.
    logger.warn({ err, campaignId: campaign.id }, "automated_campaign_discovery_failed_skipping_tick");
    return { readyFound: 0 };
  }
  const inserted = await withTenantTx({ tenantId }, (ctx) =>
    automatedLeadRepo.upsertDiscovered(ctx, campaign.id, discovered),
  );
  await automatedCampaignRepo.setLastDiscoveryRunAtAdmin(campaign.id, new Date());

  // Leads that arrived already "ready" via an OSM email tag bypass
  // enrichBatch entirely — qualify them here instead, before they're counted.
  let readyFound = 0;
  for (const lead of inserted.filter((l) => l.status === "ready")) {
    const { qualified, reason } = await qualifyLead(services, sections, lead);
    if (qualified) {
      readyFound++;
    } else {
      await withTenantTx({ tenantId }, (ctx) => automatedLeadRepo.setDisqualified(ctx, lead.id, reason));
    }
  }
  return { readyFound };
}

async function enrichBatch(
  campaign: Campaign,
  services: Services,
  tenantId: string,
  limit: number,
  sections: BlueprintSections,
): Promise<{ processed: number; readyDelta: number }> {
  const pending = await withTenantTx({ tenantId }, (ctx) =>
    automatedLeadRepo.listPendingEnrichment(ctx, campaign.id, limit),
  );
  let readyDelta = 0;
  for (const lead of pending) {
    let result;
    try {
      result = await services.emailFinder.find({
        website: lead.website ?? undefined,
        businessName: lead.businessName,
      });
    } catch (err) {
      logger.warn({ err, leadId: lead.id }, "automated_lead_enrich_failed");
      result = null;
    }
    if (!result) {
      await withTenantTx({ tenantId }, (ctx) =>
        automatedLeadRepo.markNoEmail(ctx, lead.id, "no email found via any configured source"),
      );
      continue;
    }
    const { qualified, reason } = await qualifyLead(services, sections, lead);
    if (qualified) readyDelta++;
    await withTenantTx({ tenantId }, (ctx) =>
      automatedLeadRepo.markEnriched(ctx, lead.id, {
        email: result.email,
        emailSource: result.source,
        emailConfidence: result.confidence,
        status: qualified ? "ready" : "disqualified",
        notes: reason,
      }),
    );
  }
  return { processed: pending.length, readyDelta };
}

function signEmail(campaign: Campaign, body: string): string {
  return (
    `${body}\n\n${campaign.signatureClosing}\n${campaign.signatureName}` +
    (campaign.signatureTitle ? `\n${campaign.signatureTitle}` : "")
  );
}

/** Generates the full Day 0/3/7 sequence per lead — up to 3 GeneratedCopy
 *  entries sharing one leadId. Day 0 must succeed for a lead to get ANY
 *  entries (no lead starts a sequence mid-step); a Day 3 or Day 7 failure
 *  only drops that one follow-up, not the whole lead's sequence, since a
 *  partial 2-of-3 sequence still gets a real cold email out. */
async function generateCopyBatch(
  leads: Lead[],
  sections: BlueprintSections,
  styleExamples: string[] | undefined,
  campaign: Campaign,
  services: Services,
): Promise<GeneratedCopy[]> {
  const out: GeneratedCopy[] = [];
  for (const lead of leads) {
    if (!lead.email) continue; // defensive — only "ready" leads (email required) reach here
    const leadArg = {
      businessName: lead.businessName,
      category: lead.category ?? undefined,
      location: lead.addressText ?? undefined,
    };

    let day0;
    try {
      day0 = await services.outreachCopywriter.generateEmail({ blueprint: sections, lead: leadArg, styleExamples });
    } catch (err) {
      logger.warn({ err, leadId: lead.id }, "automated_lead_copy_generation_failed");
      continue;
    }
    out.push({
      leadId: lead.id,
      email: lead.email,
      stepIndex: 0,
      subject: day0.subject,
      body: signEmail(campaign, day0.body),
    });

    for (const stepIndex of [1, 2] as const) {
      try {
        const followUp = await services.outreachCopywriter.generateEmail({
          blueprint: sections,
          lead: leadArg,
          styleExamples,
          followUp: { stepIndex, previousSubject: day0.subject },
        });
        out.push({
          leadId: lead.id,
          email: lead.email,
          stepIndex,
          subject: followUp.subject,
          body: signEmail(campaign, followUp.body),
        });
      } catch (err) {
        logger.warn({ err, leadId: lead.id, stepIndex }, "automated_lead_followup_generation_failed");
      }
    }
  }
  return out;
}

async function scheduleAndEnqueue(
  campaign: Campaign,
  generated: GeneratedCopy[],
  tenantId: string,
  services: Services,
  dailyCap: number,
): Promise<void> {
  // Authoritative, lock-protected cap re-check + insert — fast, DB-only.
  // `onConflictDoNothing` on (campaignId, leadId, stepIndex) is the
  // idempotency backstop; the cap applies to LEADS starting a NEW sequence
  // today (counted by their Day 0 row), not to raw row count — a lead that
  // makes it in gets all 3 of its steps inserted together, exactly mirroring
  // Bulk Fire's cascadeFollowups (which also doesn't re-check the cap for
  // the Day 3/7 rows it cascades off an already-capped Day 0 batch). Each
  // Day 0 row gets a STAGGERED scheduledAt via the same block+jitter
  // algorithm Bulk Fire uses (scheduleSends) — this is what stops a whole
  // batch firing in the same minute and reading as a spam blast; Day 3/7
  // inherit that same jittered time plus their day offset, same sender, so
  // all 3 steps land in one Gmail thread.
  const scheduledRows = await withTenantTx({ tenantId }, async (ctx) => {
    await lockTenantForAutomatedDailyCap(ctx);
    const sentNow = await automatedSendRepo.countScheduledOrSentTodayForTenant(ctx);
    const remainingNow = Math.max(dailyCap - sentNow, 0);
    const day0Entries = generated.filter((g) => g.stepIndex === 0);
    const leadIdsToSchedule = new Set(day0Entries.slice(0, remainingNow).map((g) => g.leadId));
    const toSchedule = generated.filter((g) => leadIdsToSchedule.has(g.leadId));
    if (toSchedule.length === 0) return [];

    const timing = scheduleSends({
      leadIds: [...leadIdsToSchedule],
      senderAccountIds: [campaign.senderAccountId],
      blockMinutes: AUTOMATED_SEND_BLOCK_MINUTES,
      now: new Date(),
    });
    const day0AtByLeadId = new Map(timing.map((t) => [t.leadId, t.scheduledAt]));
    const dayMs = 24 * 60 * 60 * 1000;

    const toInsert = toSchedule.map((g) => {
      const day0At = day0AtByLeadId.get(g.leadId) ?? new Date();
      const scheduledAt =
        g.stepIndex === 0 ? day0At : new Date(day0At.getTime() + FOLLOW_UP_DAY_OFFSETS[g.stepIndex] * dayMs);
      return {
        campaignId: campaign.id,
        leadId: g.leadId,
        senderAccountId: campaign.senderAccountId,
        stepIndex: g.stepIndex,
        subject: g.subject,
        body: g.body,
        scheduledAt,
      };
    });
    const inserted = await automatedSendRepo.bulkInsert(ctx, toInsert);
    await automatedLeadRepo.setStatusMany(
      ctx,
      inserted.filter((s) => s.stepIndex === 0).map((s) => s.leadId),
      "queued",
    );
    return inserted;
  });
  if (scheduledRows.length === 0) return;

  // ---- Enqueue each send as its own durable, delayed job ----
  // Never send synchronously here — each row's own staggered scheduledAt
  // is honored by the Inngest function's step.sleepUntil (see
  // send-automated-email.ts and its registration in api/inngest/route.ts),
  // exactly mirroring Bulk Fire's fireCampaign -> queue.enqueueBatch shape.
  // Enqueue happens OUTSIDE the transaction above (which already committed)
  // so a queue hiccup can never roll back writes that already landed.
  try {
    await services.queue.enqueueBatch(
      SEND_AUTOMATED_EMAIL_JOB,
      scheduledRows.map((s) => ({
        tenantId,
        sendId: s.id,
        targetSendAt: s.scheduledAt.toISOString(),
      })),
    );
  } catch (err) {
    // Rows are already "scheduled" in the DB but never made it to the
    // queue — log loudly; they'll simply sit unsent until manually
    // recovered (a background cron re-triggering this campaign is not a
    // safe auto-recovery here, since it could pick a fresh sender rotation
    // for unrelated leads). This mirrors fireCampaign's enqueue-failure
    // logging, minus the same-request rollback (that pattern relies on an
    // HTTP caller to report to; this is an unattended background tick).
    logger.error(
      { err, campaignId: campaign.id, count: scheduledRows.length },
      "automated_campaign_enqueue_failed",
    );
  }
}

export const RUN_AUTOMATED_CAMPAIGN_JOB = "runAutomatedCampaign";
/** Enqueued once, right when a campaign is activated — see
 *  automated-outreach.service.ts's activateCampaign and
 *  runAutomatedCampaignNow above. */
export const RUN_AUTOMATED_CAMPAIGN_NOW_JOB = "runAutomatedCampaignNow";
