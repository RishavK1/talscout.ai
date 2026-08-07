import { withTenantTx } from "@/server/db/tx";
import {
  automatedCampaignRepo,
  automatedSendRepo,
  automatedReplyDraftRepo,
  automatedLeadRepo,
} from "@/server/repositories/automated-outreach.repo";
import { blueprintRepo } from "@/server/repositories/blueprint.repo";
import { senderAccountRepo } from "@/server/repositories/outreach.repo";
import { decryptSecret } from "@/server/lib/secret-box";
import { isBounceNotification, isSenderRateLimited, isAutoReply } from "@/server/lib/bounce-detection";
import { inlineStepRun, type StepRun } from "@/server/jobs/step-runner";
import { logger } from "@/server/observability/logger";
import type { Services, SenderAccountCredentials, BlueprintSections } from "@/server/ports";
import type { senderAccounts, automatedSends, automatedCampaigns } from "@/server/db/schema";

const POLL_WINDOW_DAYS = 30;

/** Gmail read calls (threadHasReply + getThreadReplyContent) plus an AI
 *  drafting call per replied thread — each batch is its own Inngest step so
 *  a tenant with many historical sends never turns one tick into one
 *  un-resumable scan of thousands of sequential Gmail API calls. */
const POLL_BATCH_SIZE = 15;

/** Independent copy of send-outreach-email.ts's toCredentials — see the same
 *  note in run-automated-campaign.ts. */
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

type SentWindowRow = Awaited<ReturnType<typeof automatedSendRepo.listSentWithinWindowAdmin>>[number];
type Campaign = typeof automatedCampaigns.$inferSelect;
type Send = typeof automatedSends.$inferSelect;

/**
 * Cron-triggered (see the Inngest function registration in
 * src/app/api/inngest/route.ts — runs every 20 minutes by default) reply
 * poll: walks recently-sent automated_sends whose campaign has reply
 * polling enabled, checks Gmail for a reply, and — if found — drafts one for
 * human review. Never sends anything itself: ReplyDrafter has no send
 * capability by design (see ports/index.ts's doc comment). One draft per
 * send by design (unique on sendId) — once a draft is reviewed
 * (approved/rejected/sent), that thread is never re-polled.
 *
 * `stepRun` is Inngest's real step-checkpointing hook when called from the
 * cron function, or the inline no-op default for tests/manual runs — see
 * step-runner.ts.
 */
export async function pollAutomatedReplies(
  services: Services,
  stepRun: StepRun = inlineStepRun,
): Promise<void> {
  const rows = await automatedSendRepo.listSentWithinWindowAdmin(POLL_WINDOW_DAYS);

  // Group by campaign so the sender/blueprint are fetched once per campaign,
  // not once per send.
  const byCampaign = new Map<string, SentWindowRow[]>();
  for (const row of rows) {
    const list = byCampaign.get(row.send.campaignId) ?? [];
    list.push(row);
    byCampaign.set(row.send.campaignId, list);
  }

  for (const [campaignId, campaignRows] of byCampaign) {
    const campaign = campaignRows[0].campaign;
    const tenantId = campaign.tenantId;
    try {
      await pollOneCampaign(
        campaign,
        campaignRows.map((r) => r.send),
        tenantId,
        services,
        stepRun,
      );
      await automatedCampaignRepo.setLastReplyPollAtAdmin(campaignId, new Date());
    } catch (err) {
      logger.error({ err, campaignId }, "automated_reply_poll_campaign_failed");
    }
  }
}

async function pollOneCampaign(
  campaign: Campaign,
  sends: Send[],
  tenantId: string,
  services: Services,
  stepRun: StepRun,
): Promise<void> {
  const [sender, blueprint] = await Promise.all([
    withTenantTx({ tenantId }, (ctx) => senderAccountRepo.getById(ctx, campaign.senderAccountId)),
    withTenantTx({ tenantId }, (ctx) => blueprintRepo.getById(ctx, campaign.blueprintId)),
  ]);
  if (!sender || sender.deletedAt || sender.type !== "gmail" || !sender.gmailHasReadScope) {
    return; // can't poll this campaign's threads — no read-scope Gmail sender
  }
  if (!blueprint?.sections) return;

  const sections = blueprint.sections as BlueprintSections;
  const styleExamples = (campaign.styleExamples as string[] | null) ?? undefined;

  // Day 0/3/7 all thread into the same Gmail conversation — checking every
  // sent step independently would draft up to 3 near-duplicate replies for
  // one actual reply. Dedupe to one representative row per lead: the most
  // recently sent step, since that's the email the lead is actually
  // replying to.
  const latestByLead = new Map<string, Send>();
  for (const send of sends) {
    const current = latestByLead.get(send.leadId);
    if (!current || (send.sentAt && (!current.sentAt || send.sentAt > current.sentAt))) {
      latestByLead.set(send.leadId, send);
    }
  }
  const representativeSends = [...latestByLead.values()];

  // Each batch of Gmail-heavy per-send checks is its own step — see
  // POLL_BATCH_SIZE's doc comment above.
  for (let i = 0; i < representativeSends.length; i += POLL_BATCH_SIZE) {
    const batch = representativeSends.slice(i, i + POLL_BATCH_SIZE);
    await stepRun(`poll-${campaign.id}-${i / POLL_BATCH_SIZE}`, () =>
      pollSendBatch(batch, sender, campaign, sections, styleExamples, tenantId, services),
    );
  }
}

async function pollSendBatch(
  sends: Send[],
  sender: typeof senderAccounts.$inferSelect,
  campaign: Campaign,
  sections: BlueprintSections,
  styleExamples: string[] | undefined,
  tenantId: string,
  services: Services,
): Promise<{ processed: number }> {
  const creds = toCredentials(sender);
  let processed = 0;
  for (const send of sends) {
    if (!send.gmailThreadId) continue;
    try {
      const existing = await withTenantTx({ tenantId }, (ctx) =>
        automatedReplyDraftRepo.getBySendId(ctx, send.id),
      );
      if (existing && existing.status !== "pending") continue; // already reviewed

      const replyState = await services.outreachMailer.threadHasReply(creds, {
        gmailThreadId: send.gmailThreadId,
        senderEmail: sender.email,
      });
      if (replyState !== "replied") continue;

      const content = await services.outreachMailer.getThreadReplyContent(creds, {
        gmailThreadId: send.gmailThreadId,
        senderEmail: sender.email,
      });
      if (!content) continue;

      const lead = await withTenantTx({ tenantId }, (ctx) => automatedLeadRepo.getById(ctx, send.leadId));
      if (!lead) continue;

      // Checked BEFORE isBounceNotification — see isSenderRateLimited's doc
      // comment. Both a genuine bounce and a sender-side throttle notice
      // arrive from mailer-daemon@..., but a throttle notice means "this
      // ACCOUNT can't send right now", not "this recipient is bad" — a real
      // incident where 33 perfectly good leads got permanently marked
      // "bounced" (and suppressed) because Gmail's own daily send cap
      // generated this exact notice mid-campaign. The lead is left
      // untouched; the CAMPAIGN is paused so sending stops immediately
      // instead of continuing to hammer a blocked account.
      if (isSenderRateLimited(content)) {
        logger.warn(
          { campaignId: campaign.id, senderId: sender.id, leadId: send.leadId },
          "automated_campaign_sender_rate_limited_pausing",
        );
        await automatedCampaignRepo.setErrorAdmin(
          campaign.id,
          `Sending account ${sender.email} hit its provider's sending limit — campaign paused. ` +
            `Resume once the account's limit resets, or switch to a different sender.`,
        );
        processed++;
        continue;
      }

      // Two cheap, deterministic pre-filters BEFORE ever calling the AI
      // drafter — both catch messages that read as "replied" (someone other
      // than us sent it) but aren't a human decision worth drafting a reply
      // to. See lib/bounce-detection.ts for why this is pattern-based, not
      // AI-classified.
      if (isBounceNotification(content)) {
        // Terminal: this address can't receive mail. Same "stop the
        // sequence now" treatment as a real reply — see
        // cancelScheduledForLeadAdmin's doc comment — but no draft, and the
        // lead is marked "bounced" rather than "replied" so this reads
        // honestly everywhere it's shown instead of looking like engagement.
        await withTenantTx({ tenantId }, (ctx) =>
          automatedLeadRepo.setStatus(ctx, send.leadId, "bounced"),
        );
        await automatedSendRepo.cancelScheduledForLeadAdmin(send.leadId, "bounced");
        processed++;
        continue;
      }
      if (isAutoReply(content)) {
        // NOT terminal — an out-of-office is not a human decision, so the
        // sequence keeps running its course. Just nothing to draft yet;
        // next tick re-checks the same thread fresh (no draft row is
        // created here, so there's nothing to get stuck on).
        continue;
      }

      let draft;
      try {
        draft = await services.replyDrafter.draft({
          blueprint: sections,
          lead: { businessName: lead.businessName },
          originalSend: { subject: send.subject, body: send.body },
          inboundMessage: { subject: content.subject, body: content.body },
          styleExamples,
        });
      } catch (err) {
        logger.warn({ err, sendId: send.id }, "automated_reply_draft_generation_failed");
        continue;
      }

      await withTenantTx({ tenantId }, (ctx) =>
        automatedReplyDraftRepo.upsertBySendId(ctx, {
          campaignId: send.campaignId,
          leadId: send.leadId,
          sendId: send.id,
          inboundSubject: content.subject,
          inboundBody: content.body,
          draftBody: draft.body,
          reasoning: draft.reasoning,
          confidence: draft.confidence,
          intent: draft.intent,
        }),
      );
      await withTenantTx({ tenantId }, (ctx) => automatedLeadRepo.setStatus(ctx, send.leadId, "replied"));
      // Stop the rest of this lead's sequence NOW rather than waiting for
      // each remaining step's own send-time self-check — see
      // cancelScheduledForLeadAdmin's doc comment.
      await automatedSendRepo.cancelScheduledForLeadAdmin(send.leadId, "lead_replied");
      processed++;
    } catch (err) {
      logger.warn({ err, sendId: send.id }, "automated_reply_poll_send_failed");
    }
  }
  return { processed };
}

export const POLL_AUTOMATED_REPLIES_JOB = "pollAutomatedReplies";
