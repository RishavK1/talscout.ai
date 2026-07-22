import { sql } from "drizzle-orm";
import { withTenantTx, type TenantContext } from "@/server/db/tx";
import {
  automatedCampaignRepo,
  automatedLeadRepo,
  automatedSendRepo,
  automatedReplyDraftRepo,
} from "@/server/repositories/automated-outreach.repo";
import { blueprintRepo } from "@/server/repositories/blueprint.repo";
import { senderAccountRepo } from "@/server/repositories/outreach.repo";
import { getServices } from "@/server/container";
import { toCredentials, generateMessageId } from "@/server/lib/automated-mail-credentials";
import { NotFound, Conflict, BadRequest } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";
import { RUN_AUTOMATED_CAMPAIGN_NOW_JOB } from "@/server/jobs/run-automated-campaign";
import type {
  CreateAutomatedCampaignBody,
  UpdateAutomatedCampaignBody,
  ListAutomatedLeadsQuery,
} from "@/server/validation/automated-outreach";
import type { BlueprintSections } from "@/server/ports";

/** Independent of Bulk Fire's plan-based daily cap — an entirely separate
 *  counter against automated_sends, enforced with its own advisory-lock
 *  key (see lockTenantForAutomatedDailyCap) so the two features' concurrent-
 *  send serialization never contends with each other. */
export const AUTOMATED_DAILY_SEND_CAP = 50;

async function lockTenantForAutomatedDailyCap(ctx: TenantContext) {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${ctx.tenantId} || ':automated'))`,
  );
}

async function assertBlueprintUsable(ctx: TenantContext, blueprintId: string) {
  const blueprint = await blueprintRepo.getById(ctx, blueprintId);
  if (!blueprint) throw new NotFound("Blueprint not found");
  if (blueprint.status !== "active" || !blueprint.sections) {
    throw new BadRequest(
      "Blueprint must be generated (status: active) before it can power a campaign",
    );
  }
  return blueprint;
}

async function assertSenderUsable(
  ctx: TenantContext,
  senderAccountId: string,
  replyPollingEnabled: boolean,
) {
  const sender = await senderAccountRepo.getById(ctx, senderAccountId);
  if (!sender || sender.deletedAt) throw new NotFound("Sender account not found");
  if (replyPollingEnabled && (sender.type !== "gmail" || !sender.gmailHasReadScope)) {
    throw new BadRequest(
      "Reply polling requires a Gmail sender connected with read access — reconnect Gmail with read scope, or turn off reply polling for this campaign.",
    );
  }
  return sender;
}

export const automatedOutreachService = {
  async listCampaigns(ctx: TenantContext) {
    return await automatedCampaignRepo.list(ctx);
  },

  async getCampaign(ctx: TenantContext, id: string) {
    const row = await automatedCampaignRepo.getById(ctx, id);
    if (!row) throw new NotFound("Campaign not found");
    return row;
  },

  async createCampaign(ctx: TenantContext, body: CreateAutomatedCampaignBody) {
    await assertBlueprintUsable(ctx, body.blueprintId);
    await assertSenderUsable(ctx, body.senderAccountId, body.replyPollingEnabled ?? true);
    return await automatedCampaignRepo.create(ctx, body);
  },

  async updateCampaign(ctx: TenantContext, id: string, body: UpdateAutomatedCampaignBody) {
    const existing = await automatedOutreachService.getCampaign(ctx, id);
    const nextReplyPolling = body.replyPollingEnabled ?? existing.replyPollingEnabled;
    if (nextReplyPolling) {
      // Re-validate on every update where polling stays/becomes on — the
      // sender itself never changes via this route, but a stale connection
      // (revoked scope) should still be caught before enabling.
      await assertSenderUsable(ctx, existing.senderAccountId, true);
    }
    const row = await automatedCampaignRepo.update(ctx, id, body);
    if (!row) throw new NotFound("Campaign not found");
    return row;
  },

  async deleteCampaign(ctx: TenantContext, id: string) {
    const row = await automatedCampaignRepo.remove(ctx, id);
    if (!row) throw new NotFound("Campaign not found");
    return { id: row.id };
  },

  async pauseCampaign(ctx: TenantContext, id: string) {
    const existing = await automatedOutreachService.getCampaign(ctx, id);
    if (existing.status !== "active") {
      throw new Conflict("Only an active campaign can be paused");
    }
    const row = await automatedCampaignRepo.update(ctx, id, { status: "paused" });
    if (!row) throw new NotFound("Campaign not found");
    return row;
  },

  async resumeCampaign(ctx: TenantContext, id: string) {
    const existing = await automatedOutreachService.getCampaign(ctx, id);
    if (existing.status !== "paused" && existing.status !== "draft") {
      throw new Conflict("Only a paused or draft campaign can be activated");
    }
    // Re-validate blueprint/sender still qualify — either could have
    // drifted (blueprint archived, sender disconnected) since creation.
    await assertBlueprintUsable(ctx, existing.blueprintId);
    await assertSenderUsable(ctx, existing.senderAccountId, existing.replyPollingEnabled);
    const row = await automatedCampaignRepo.update(ctx, id, { status: "active" });
    if (!row) throw new NotFound("Campaign not found");
    return {
      result: row,
      // Must run AFTER this transaction commits — enqueuing here (still
      // inside withTenantTx) would let the job's own admin-scoped read see
      // this row's PRE-update status (still "draft"/"paused"), since that
      // read is on a separate connection and this write hasn't committed
      // yet. See HandlerResult.afterCommit's doc comment in with-api.ts. A
      // queue hiccup here must never fail the activation itself — the row
      // is already "active" and the next cron sweep picks it up regardless.
      afterCommit: async () => {
        try {
          await getServices().queue.enqueue(RUN_AUTOMATED_CAMPAIGN_NOW_JOB, { campaignId: id });
        } catch (err) {
          logger.warn({ err, campaignId: id }, "automated_campaign_run_now_enqueue_failed");
        }
      },
    };
  },

  async listLeads(ctx: TenantContext, campaignId: string, query: ListAutomatedLeadsQuery) {
    await automatedOutreachService.getCampaign(ctx, campaignId); // 404 + tenant scoping
    const filter = { status: query.status, source: query.source };
    const [leads, total] = await Promise.all([
      automatedLeadRepo.list(ctx, campaignId, {
        ...filter,
        limit: query.limit && query.limit > 0 && query.limit <= 200 ? query.limit : 50,
        offset: query.offset && query.offset >= 0 ? query.offset : 0,
      }),
      automatedLeadRepo.count(ctx, campaignId, filter),
    ]);
    return { leads, total };
  },

  /** The Day 0/3/7 rows for one lead — backs the "View emails" modal. Each
   *  row's content is already fully AI-generated and committed at
   *  generation time (unlike Bulk Fire's template-based equivalent), so
   *  this reads real send rows, not resolved templates. */
  async listLeadSends(ctx: TenantContext, campaignId: string, leadId: string) {
    await automatedOutreachService.getCampaign(ctx, campaignId); // 404 + tenant scoping
    const lead = await automatedLeadRepo.getById(ctx, leadId);
    if (!lead || lead.campaignId !== campaignId) throw new NotFound("Lead not found");
    return await automatedSendRepo.listByLead(ctx, campaignId, leadId);
  },

  async listPendingReplyDrafts(ctx: TenantContext, params: { limit?: number; offset?: number }) {
    const limit = params.limit && params.limit > 0 && params.limit <= 200 ? params.limit : 50;
    const offset = params.offset && params.offset >= 0 ? params.offset : 0;
    return await automatedReplyDraftRepo.listPending(ctx, limit, offset);
  },

  async getReplyDraft(ctx: TenantContext, id: string) {
    const row = await automatedReplyDraftRepo.getById(ctx, id);
    if (!row) throw new NotFound("Reply draft not found");
    return row;
  },

  async updateReplyDraftBody(ctx: TenantContext, id: string, draftBody: string) {
    await automatedOutreachService.getReplyDraft(ctx, id); // 404 check
    const row = await automatedReplyDraftRepo.updateDraftBody(ctx, id, draftBody);
    if (!row) throw new Conflict("Draft can only be edited while pending review");
    return row;
  },

  async rejectReplyDraft(ctx: TenantContext, id: string) {
    const existing = await automatedOutreachService.getReplyDraft(ctx, id);
    if (existing.status !== "pending") throw new Conflict("Draft already reviewed");
    const row = await automatedReplyDraftRepo.setStatus(ctx, id, "rejected");
    if (!row) throw new Conflict("Draft already reviewed");
    return row;
  },

  async regenerateReplyDraft(ctx: TenantContext, id: string) {
    const existing = await automatedOutreachService.getReplyDraft(ctx, id);
    if (existing.status !== "pending") throw new Conflict("Draft already reviewed");

    const [campaign, lead, send] = await Promise.all([
      automatedCampaignRepo.getById(ctx, existing.campaignId),
      automatedLeadRepo.getById(ctx, existing.leadId),
      automatedSendRepo.getById(ctx, existing.sendId),
    ]);
    if (!campaign || !lead || !send) throw new NotFound("Related campaign/lead/send not found");
    const blueprint = await blueprintRepo.getById(ctx, campaign.blueprintId);
    if (!blueprint?.sections) throw new BadRequest("Blueprint no longer has generated sections");

    let draft;
    try {
      draft = await getServices().replyDrafter.draft({
        blueprint: blueprint.sections as BlueprintSections,
        lead: { businessName: lead.businessName },
        originalSend: { subject: send.subject, body: send.body },
        inboundMessage: { subject: existing.inboundSubject ?? "", body: existing.inboundBody },
        styleExamples: (campaign.styleExamples as string[] | null) ?? undefined,
      });
    } catch (err) {
      logger.error({ err, draftId: id }, "reply_draft_regenerate_failed");
      throw new BadRequest("Failed to regenerate reply — please try again");
    }

    const row = await automatedReplyDraftRepo.upsertBySendId(ctx, {
      campaignId: existing.campaignId,
      leadId: existing.leadId,
      sendId: existing.sendId,
      inboundSubject: existing.inboundSubject ?? undefined,
      inboundBody: existing.inboundBody,
      draftBody: draft.body,
      reasoning: draft.reasoning,
      confidence: draft.confidence,
    });
    if (!row) throw new Conflict("Draft was reviewed by someone else — refresh and try again");
    return row;
  },

  /**
   * The single send path for a reply. Marks "approved" inside the request's
   * own transaction, but the actual outreachMailer.send() call happens in
   * `afterCommit` — slow external I/O must never run inside a DB tx (see
   * HandlerResult.afterCommit's doc comment in with-api.ts). A follow-up
   * short transaction then persists "sent" (or "approved" + errorReason on
   * failure, leaving a retry-via-re-approve path).
   */
  async approveReplyDraft(ctx: TenantContext, id: string, finalBodyOverride?: string) {
    const draft = await automatedOutreachService.getReplyDraft(ctx, id);
    if (draft.status !== "pending" && draft.status !== "approved") {
      throw new Conflict("Draft already reviewed");
    }

    const finalBody = finalBodyOverride ?? draft.draftBody;
    if (finalBodyOverride && finalBodyOverride !== draft.draftBody) {
      await automatedReplyDraftRepo.updateDraftBody(ctx, id, finalBodyOverride);
    }

    const [campaign, lead, send] = await Promise.all([
      automatedCampaignRepo.getById(ctx, draft.campaignId),
      automatedLeadRepo.getById(ctx, draft.leadId),
      automatedSendRepo.getById(ctx, draft.sendId),
    ]);
    if (!campaign || !lead?.email || !send) {
      throw new NotFound("Related campaign/lead/send not found");
    }
    const sender = await senderAccountRepo.getById(ctx, campaign.senderAccountId);
    if (!sender || sender.deletedAt) {
      throw new BadRequest("Campaign's sender account is no longer connected");
    }

    await automatedReplyDraftRepo.setStatus(ctx, id, "approved");

    const tenantId = ctx.tenantId;
    const draftId = id;
    const leadEmail = lead.email;
    const originalSubject = send.subject;
    const inReplyTo = send.rfc822MessageId ?? undefined;
    const gmailThreadId = send.gmailThreadId ?? undefined;

    return {
      result: { id: draftId, status: "approved" as const },
      afterCommit: async () => {
        try {
          const creds = toCredentials(sender);
          const messageId = generateMessageId(sender.email);
          const sendResult = await getServices().outreachMailer.send(creds, {
            from: sender.email,
            fromName: sender.fromName ?? undefined,
            to: leadEmail,
            subject: originalSubject.startsWith("Re: ") ? originalSubject : `Re: ${originalSubject}`,
            text: finalBody,
            replyTo: sender.email,
            messageId,
            inReplyTo,
            gmailThreadId,
          });
          await withTenantTx({ tenantId }, (recoveryCtx) =>
            automatedReplyDraftRepo.setStatus(recoveryCtx, draftId, "sent", {
              sentAt: new Date(),
            }),
          );
          void sendResult;
        } catch (e) {
          logger.error({ err: e, draftId, tenantId }, "automated_reply_approve_send_failed");
          await withTenantTx({ tenantId }, (recoveryCtx) =>
            automatedReplyDraftRepo.setStatus(recoveryCtx, draftId, "approved", {
              errorReason: e instanceof Error ? e.message : "send failed",
            }),
          );
        }
      },
    };
  },
};

export { lockTenantForAutomatedDailyCap };
