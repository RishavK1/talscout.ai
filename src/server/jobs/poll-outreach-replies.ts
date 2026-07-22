import { withTenantTx } from "@/server/db/tx";
import {
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "@/server/repositories/outreach.repo";
import { decryptSecret } from "@/server/lib/secret-box";
import { inlineStepRun, type StepRun } from "@/server/jobs/step-runner";
import { logger } from "@/server/observability/logger";
import type { Services, SenderAccountCredentials } from "@/server/ports";
import type { senderAccounts, outreachSends, outreachCampaigns } from "@/server/db/schema";

const POLL_WINDOW_DAYS = 30;

/** Same batching rationale as poll-automated-replies.ts's POLL_BATCH_SIZE —
 *  each batch of Gmail API calls is its own Inngest step. */
const POLL_BATCH_SIZE = 15;

/** Independent copy of send-outreach-email.ts's toCredentials — every job
 *  file in this codebase keeps its own rather than importing across job
 *  files (see the matching note in poll-automated-replies.ts). */
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

type SentWindowRow = Awaited<ReturnType<typeof outreachSendRepo.listSentWithinWindowAdmin>>[number];
type Campaign = typeof outreachCampaigns.$inferSelect;
type Send = typeof outreachSends.$inferSelect;

/**
 * Cron-triggered (registered in src/app/api/inngest/route.ts, every 20
 * minutes) reply poll for Bulk Fire's own campaigns — mirrors
 * poll-automated-replies.ts's Gmail-thread check but stops at marking the
 * lead "replied" (no AI draft/review step; Bulk Fire has no Reply Review
 * page). That "replied" status is what powers the Analytics page's Bulk
 * Fire "Replied" stat and is also what the existing reply-stop guard in
 * send-outreach-email.ts already checks live before every follow-up send —
 * this job just makes that same signal visible after the fact, for
 * campaigns/leads a follow-up never happens to touch again.
 */
export async function pollOutreachReplies(
  services: Services,
  stepRun: StepRun = inlineStepRun,
): Promise<void> {
  const rows = await outreachSendRepo.listSentWithinWindowAdmin(POLL_WINDOW_DAYS);

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
    } catch (err) {
      logger.error({ err, campaignId }, "outreach_reply_poll_campaign_failed");
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
  // senderAccountIds is null/empty for "every active sender" campaigns, so
  // resolving one sender per campaign (like the automated equivalent does)
  // isn't right here — each send already recorded which sender it went out
  // from, so credentials are resolved per-send in the batch below instead.
  const senderIds = [...new Set(sends.map((s) => s.senderAccountId))];
  const senders = await withTenantTx({ tenantId }, async (ctx) => {
    const rows = await Promise.all(senderIds.map((id) => senderAccountRepo.getById(ctx, id)));
    return new Map(rows.filter((r): r is NonNullable<typeof r> => !!r).map((r) => [r.id, r]));
  });

  // Same Day 0/3/7-share-one-thread dedupe as poll-automated-replies.ts.
  const latestByLead = new Map<string, Send>();
  for (const send of sends) {
    const current = latestByLead.get(send.leadId);
    if (!current || (send.sentAt && (!current.sentAt || send.sentAt > current.sentAt))) {
      latestByLead.set(send.leadId, send);
    }
  }
  const representativeSends = [...latestByLead.values()];

  for (let i = 0; i < representativeSends.length; i += POLL_BATCH_SIZE) {
    const batch = representativeSends.slice(i, i + POLL_BATCH_SIZE);
    await stepRun(`poll-outreach-${campaign.id}-${i / POLL_BATCH_SIZE}`, () =>
      pollSendBatch(batch, senders, tenantId, services),
    );
  }
}

async function pollSendBatch(
  sends: Send[],
  senders: Map<string, typeof senderAccounts.$inferSelect>,
  tenantId: string,
  services: Services,
): Promise<{ processed: number }> {
  let processed = 0;
  for (const send of sends) {
    if (!send.gmailThreadId) continue;
    const sender = senders.get(send.senderAccountId);
    if (!sender || sender.deletedAt || sender.type !== "gmail" || !sender.gmailHasReadScope) continue;
    try {
      const lead = await withTenantTx({ tenantId }, (ctx) => outreachLeadRepo.getById(ctx, send.leadId));
      if (!lead || lead.status === "replied") continue; // already recorded

      const creds = toCredentials(sender);
      const replyState = await services.outreachMailer.threadHasReply(creds, {
        gmailThreadId: send.gmailThreadId,
        senderEmail: sender.email,
      });
      if (replyState !== "replied") continue;

      await withTenantTx({ tenantId }, (ctx) => outreachLeadRepo.setStatus(ctx, send.leadId, "replied"));
      processed++;
    } catch (err) {
      logger.warn({ err, sendId: send.id }, "outreach_reply_poll_send_failed");
    }
  }
  return { processed };
}

export const POLL_OUTREACH_REPLIES_JOB = "pollOutreachReplies";
