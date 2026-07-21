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
  AUTOMATED_DAILY_SEND_CAP,
} from "@/server/services/automated-outreach.service";
import { SEND_AUTOMATED_EMAIL_JOB } from "@/server/jobs/send-automated-email";
import { inlineStepRun, type StepRun } from "@/server/jobs/step-runner";
import { logger } from "@/server/observability/logger";
import type { Services, BlueprintSections } from "@/server/ports";
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

type Campaign = typeof automatedCampaigns.$inferSelect;
type Lead = typeof automatedLeads.$inferSelect;
interface GeneratedCopy {
  leadId: string;
  email: string;
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
}

async function runOneCampaign(
  campaign: Campaign,
  services: Services,
  stepRun: StepRun,
): Promise<void> {
  const tenantId = campaign.tenantId;
  const cid = campaign.id;

  // ---- Phase 1: discover (one step) ----
  // `maxLeadsPerRun` is a target of USABLE (email-bearing) leads, not raw
  // discoveries — most raw candidates have no findable email, so stopping at
  // maxLeadsPerRun candidates would strand a campaign at zero forever in a
  // sparse area (each rerun re-finds the same already-no_email businesses,
  // dedup skips them, nothing new happens). Fetch a much larger candidate
  // pool up front and let enrichment below chew through it until the target
  // is met or the pool runs out.
  const { readyFound: readyFromDiscovery } = await stepRun(`discover-${cid}`, () =>
    discoverPhase(campaign, services, tenantId),
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
      enrichBatch(campaign, services, tenantId, batchLimit),
    );
    enrichBatchIndex++;
    if (batchResult.processed === 0) break; // pool exhausted
    readyFound += batchResult.readyDelta;
    enrichedThisTick += batchResult.processed;
  }

  // ---- Phase 3: generate copy, gated by the 50/day cap ----
  const blueprint = await withTenantTx({ tenantId }, (ctx) =>
    blueprintRepo.getById(ctx, campaign.blueprintId),
  );
  if (!blueprint?.sections) {
    logger.warn({ campaignId: campaign.id }, "automated_campaign_blueprint_unusable_skipping_send");
    return;
  }
  const sections = blueprint.sections as BlueprintSections;
  const styleExamples = (campaign.styleExamples as string[] | null) ?? undefined;

  // Budget is an ESTIMATE used to bound how many (potentially slow) AI calls
  // we attempt — the AUTHORITATIVE cap check happens later, in a short
  // locked transaction with no external I/O inside it (see Phase 4 below).
  const sentSoFar = await withTenantTx({ tenantId }, (ctx) =>
    automatedSendRepo.countScheduledOrSentTodayForTenant(ctx),
  );
  const budget = Math.max(AUTOMATED_DAILY_SEND_CAP - sentSoFar, 0);
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
  await stepRun(`schedule-and-enqueue-${cid}`, () => scheduleAndEnqueue(campaign, generated, tenantId, services));
}

async function discoverPhase(
  campaign: Campaign,
  services: Services,
  tenantId: string,
): Promise<{ readyFound: number }> {
  const discoveryQuery = campaign.discoveryQuery as {
    category: string;
    location: { lat: number; lon: number; radiusMeters: number } | { text: string };
  };
  const discovered = await services.leadDiscovery.discover({
    category: discoveryQuery.category,
    location: discoveryQuery.location,
    limit: Math.min(campaign.maxLeadsPerRun * DISCOVERY_POOL_MULTIPLIER, DISCOVERY_POOL_CAP),
  });
  const inserted = await withTenantTx({ tenantId }, (ctx) =>
    automatedLeadRepo.upsertDiscovered(ctx, campaign.id, discovered),
  );
  await automatedCampaignRepo.setLastDiscoveryRunAtAdmin(campaign.id, new Date());
  return { readyFound: inserted.filter((l) => l.status === "ready").length };
}

async function enrichBatch(
  campaign: Campaign,
  services: Services,
  tenantId: string,
  limit: number,
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
    if (result) readyDelta++;
    await withTenantTx({ tenantId }, (ctx) =>
      result
        ? automatedLeadRepo.markEnriched(ctx, lead.id, {
            email: result.email,
            emailSource: result.source,
            emailConfidence: result.confidence,
          })
        : automatedLeadRepo.markNoEmail(ctx, lead.id, "no email found via any configured source"),
    );
  }
  return { processed: pending.length, readyDelta };
}

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
    let copy;
    try {
      copy = await services.outreachCopywriter.generateEmail({
        blueprint: sections,
        lead: {
          businessName: lead.businessName,
          category: lead.category ?? undefined,
          location: lead.addressText ?? undefined,
        },
        styleExamples,
      });
    } catch (err) {
      logger.warn({ err, leadId: lead.id }, "automated_lead_copy_generation_failed");
      continue;
    }
    const signedBody =
      `${copy.body}\n\n${campaign.signatureClosing}\n${campaign.signatureName}` +
      (campaign.signatureTitle ? `\n${campaign.signatureTitle}` : "");
    out.push({ leadId: lead.id, email: lead.email, subject: copy.subject, body: signedBody });
  }
  return out;
}

async function scheduleAndEnqueue(
  campaign: Campaign,
  generated: GeneratedCopy[],
  tenantId: string,
  services: Services,
): Promise<void> {
  // Authoritative, lock-protected cap re-check + insert — fast, DB-only.
  // `onConflictDoNothing` on (campaignId, leadId) is the idempotency
  // backstop; the slice to `remainingNow` is the actual cap enforcement.
  // Each row gets a STAGGERED scheduledAt via the same block+jitter
  // algorithm Bulk Fire uses (scheduleSends) — this is what stops a whole
  // batch firing in the same minute and reading as a spam blast.
  const scheduledRows = await withTenantTx({ tenantId }, async (ctx) => {
    await lockTenantForAutomatedDailyCap(ctx);
    const sentNow = await automatedSendRepo.countScheduledOrSentTodayForTenant(ctx);
    const remainingNow = Math.max(AUTOMATED_DAILY_SEND_CAP - sentNow, 0);
    const toSchedule = generated.slice(0, remainingNow);
    if (toSchedule.length === 0) return [];

    const timing = scheduleSends({
      leadIds: toSchedule.map((g) => g.leadId),
      senderAccountIds: [campaign.senderAccountId],
      blockMinutes: AUTOMATED_SEND_BLOCK_MINUTES,
      now: new Date(),
    });
    const scheduledAtByLeadId = new Map(timing.map((t) => [t.leadId, t.scheduledAt]));

    const toInsert = toSchedule.map((g) => ({
      campaignId: campaign.id,
      leadId: g.leadId,
      senderAccountId: campaign.senderAccountId,
      subject: g.subject,
      body: g.body,
      scheduledAt: scheduledAtByLeadId.get(g.leadId) ?? new Date(),
    }));
    const inserted = await automatedSendRepo.bulkInsert(ctx, toInsert);
    await automatedLeadRepo.setStatusMany(
      ctx,
      inserted.map((s) => s.leadId),
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
