import { withTenantTx } from "@/server/db/tx";
import {
  automatedCampaignRepo,
  automatedLeadRepo,
  automatedSendRepo,
} from "@/server/repositories/automated-outreach.repo";
import { blueprintRepo } from "@/server/repositories/blueprint.repo";
import { senderAccountRepo } from "@/server/repositories/outreach.repo";
import { decryptSecret } from "@/server/lib/secret-box";
import {
  lockTenantForAutomatedDailyCap,
  AUTOMATED_DAILY_SEND_CAP,
} from "@/server/services/automated-outreach.service";
import { logger } from "@/server/observability/logger";
import type { Services, SenderAccountCredentials, BlueprintSections } from "@/server/ports";
import type { senderAccounts, automatedCampaigns } from "@/server/db/schema";

/** Independent copy of send-outreach-email.ts's toCredentials/
 *  generateMessageId — this job must never import from a bulk-fire-owned
 *  job file, so the small helper is duplicated rather than shared. */
function toCredentials(sender: typeof senderAccounts.$inferSelect): SenderAccountCredentials {
  if (sender.type === "gmail") {
    if (!sender.gmailRefreshTokenEnc) throw new Error("gmail_account_missing_refresh_token");
    return {
      type: "gmail",
      refreshToken: decryptSecret(sender.gmailRefreshTokenEnc),
      hasReadScope: sender.gmailHasReadScope,
    };
  }
  if (!sender.smtpHost || !sender.smtpPort || !sender.smtpUsername || !sender.smtpPasswordEnc) {
    throw new Error("smtp_account_missing_credentials");
  }
  return {
    type: "smtp",
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure ?? true,
    username: sender.smtpUsername,
    password: decryptSecret(sender.smtpPasswordEnc),
  };
}

function generateMessageId(senderEmail: string): string {
  const domain = senderEmail.includes("@") ? senderEmail.split("@")[1] : "talscout.local";
  return `<${crypto.randomUUID()}@${domain}>`;
}

/**
 * Cron-triggered (see the Inngest function registration in
 * src/app/api/inngest/route.ts — runs every 6 hours by default) discover →
 * enrich → generate → send pipeline, run once per ACTIVE automated campaign
 * across every tenant. One campaign's failure is isolated (logged, that
 * campaign marked "error") and never blocks the others in the same tick.
 */
export async function runAutomatedCampaigns(services: Services): Promise<void> {
  const campaigns = await automatedCampaignRepo.listActiveAdmin();
  for (const campaign of campaigns) {
    try {
      await runOneCampaign(campaign, services);
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
  campaign: typeof automatedCampaigns.$inferSelect,
  services: Services,
): Promise<void> {
  const tenantId = campaign.tenantId;

  // ---- Phase 1: discover ----
  // `maxLeadsPerRun` is a target of USABLE (email-bearing) leads, not raw
  // discoveries — most raw candidates have no findable email, so stopping at
  // maxLeadsPerRun candidates would strand a campaign at zero forever in a
  // sparse area (each rerun re-finds the same already-no_email businesses,
  // dedup skips them, nothing new happens). Fetch a much larger candidate
  // pool up front and let enrichment below chew through it until the target
  // is met or the pool runs out.
  const DISCOVERY_POOL_MULTIPLIER = 8;
  const DISCOVERY_POOL_CAP = 200;
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

  // ---- Phase 2: enrich (email-finder waterfall) until the target is met ----
  // Keep pulling candidates until we've FOUND maxLeadsPerRun leads with an
  // email, the pool is exhausted, or the per-tick enrichment budget is spent
  // (bounds site fetches and Hunter/Apollo free-tier credit burn; whatever
  // is left stays "discovered" for the next tick). Listings that arrived
  // with an email already on them (source: osm) count toward the target.
  const ENRICH_BUDGET_PER_TICK = 150;
  const ENRICH_BATCH_SIZE = 25;
  let readyFound = inserted.filter((l) => l.status === "ready").length;
  let enrichedThisTick = 0;
  while (readyFound < campaign.maxLeadsPerRun && enrichedThisTick < ENRICH_BUDGET_PER_TICK) {
    const pending = await withTenantTx({ tenantId }, (ctx) =>
      automatedLeadRepo.listPendingEnrichment(ctx, campaign.id, ENRICH_BATCH_SIZE),
    );
    if (pending.length === 0) break;
    for (const lead of pending) {
      if (readyFound >= campaign.maxLeadsPerRun || enrichedThisTick >= ENRICH_BUDGET_PER_TICK) {
        break;
      }
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
      enrichedThisTick++;
      if (result) readyFound++;
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
  }

  // ---- Phase 3: generate copy + schedule, gated by the 50/day cap ----
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
  // locked transaction with no external I/O inside it (see below). AI calls
  // must never run inside a held DB transaction.
  const sentSoFar = await withTenantTx({ tenantId }, (ctx) =>
    automatedSendRepo.countScheduledOrSentTodayForTenant(ctx),
  );
  const budget = Math.max(AUTOMATED_DAILY_SEND_CAP - sentSoFar, 0);
  if (budget <= 0) return;

  const ready = await withTenantTx({ tenantId }, (ctx) =>
    automatedLeadRepo.listReadyForCopy(ctx, campaign.id, budget),
  );
  if (ready.length === 0) return;

  const generated: { leadId: string; email: string; subject: string; body: string }[] = [];
  for (const lead of ready) {
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
    generated.push({ leadId: lead.id, email: lead.email, subject: copy.subject, body: signedBody });
  }
  if (generated.length === 0) return;

  // Authoritative, lock-protected cap re-check + insert — fast, DB-only.
  // `onConflictDoNothing` on (campaignId, leadId) is the idempotency
  // backstop; the slice to `remainingNow` is the actual cap enforcement.
  const scheduledRows = await withTenantTx({ tenantId }, async (ctx) => {
    await lockTenantForAutomatedDailyCap(ctx);
    const sentNow = await automatedSendRepo.countScheduledOrSentTodayForTenant(ctx);
    const remainingNow = Math.max(AUTOMATED_DAILY_SEND_CAP - sentNow, 0);
    const toInsert = generated.slice(0, remainingNow).map((g) => ({
      campaignId: campaign.id,
      leadId: g.leadId,
      senderAccountId: campaign.senderAccountId,
      subject: g.subject,
      body: g.body,
      scheduledAt: new Date(),
    }));
    if (toInsert.length === 0) return [];
    const inserted = await automatedSendRepo.bulkInsert(ctx, toInsert);
    await automatedLeadRepo.setStatusMany(
      ctx,
      inserted.map((s) => s.leadId),
      "queued",
    );
    return inserted;
  });
  if (scheduledRows.length === 0) return;

  // ---- Phase 4: send (same OutreachMailer port bulk-fire uses) ----
  const sender = await withTenantTx({ tenantId }, (ctx) =>
    senderAccountRepo.getById(ctx, campaign.senderAccountId),
  );
  if (!sender || sender.deletedAt) {
    logger.warn({ campaignId: campaign.id }, "automated_campaign_sender_unavailable");
    return;
  }
  const creds = toCredentials(sender);
  const emailByLeadId = new Map(generated.map((g) => [g.leadId, g.email]));

  for (const send of scheduledRows) {
    const to = emailByLeadId.get(send.leadId);
    if (!to) continue; // shouldn't happen — defensive
    try {
      const messageId = generateMessageId(sender.email);
      const result = await services.outreachMailer.send(creds, {
        from: sender.email,
        fromName: sender.fromName ?? undefined,
        to,
        subject: send.subject,
        text: send.body,
        replyTo: sender.email,
        messageId,
      });
      await withTenantTx({ tenantId }, async (ctx) => {
        await automatedSendRepo.markSent(ctx, send.id, {
          sentAt: new Date(),
          rfc822MessageId: messageId,
          gmailThreadId: result.gmailThreadId,
        });
        await automatedLeadRepo.setStatus(ctx, send.leadId, "sent");
      });
    } catch (err) {
      logger.warn({ err, sendId: send.id }, "automated_send_failed");
      await withTenantTx({ tenantId }, async (ctx) => {
        await automatedSendRepo.markFailed(
          ctx,
          send.id,
          err instanceof Error ? err.message : "send_failed",
        );
        await automatedLeadRepo.setStatus(ctx, send.leadId, "failed");
      });
    }
  }
}

export const RUN_AUTOMATED_CAMPAIGN_JOB = "runAutomatedCampaign";
