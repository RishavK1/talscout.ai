import { google } from "googleapis";
import { withTenantTx, type TenantContext } from "@/server/db/tx";
import {
  outreachCampaignRepo,
  outreachLeadRepo,
  outreachSendRepo,
  senderAccountRepo,
} from "@/server/repositories/outreach.repo";
import { scheduleSends } from "@/server/lib/spintax";
import { encryptSecret } from "@/server/lib/secret-box";
import { signOAuthState, verifyOAuthState } from "@/server/lib/oauth-state";
import { getServices } from "@/server/container";
import { getEnv } from "@/server/config/env";
import { auditRepo } from "@/server/repositories/audit.repo";
import { MAX_UPLOAD_BYTES } from "@/server/ingestion/file-type";
import { PARSE_LEADS_DOCX_JOB } from "@/server/jobs/parse-leads-docx";
import { SEND_OUTREACH_EMAIL_JOB } from "@/server/jobs/send-outreach-email";
import { NotFound, Conflict, BadRequest, PayloadTooLarge } from "@/server/http/errors";
import type {
  CreateCampaignBody,
  SetSequenceBody,
  RequestLeadsUploadBody,
  CompleteLeadsUploadBody,
  CreateSmtpSenderBody,
} from "@/server/validation/outreach";

const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

/** `senderAccountRepo` rows carry `smtpPasswordEnc`/`gmailRefreshTokenEnc` —
 *  ciphertext, not plaintext, but still an internal column that should never
 *  round-trip to the client. `withAuth` serializes whatever a handler returns
 *  verbatim, so every method that surfaces a sender row maps through this
 *  first rather than relying on callers to remember to strip it. */
function toPublicSender(row: Awaited<ReturnType<typeof senderAccountRepo.list>>[number]) {
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
    const [counts, leads] = await Promise.all([
      outreachSendRepo.countsByCampaign(ctx, campaignId),
      outreachLeadRepo.listByCampaign(ctx, campaignId),
    ]);
    return { campaign, counts, leadCount: leads.length };
  },

  async createCampaign(ctx: TenantContext, body: CreateCampaignBody) {
    const campaign = await outreachCampaignRepo.create(ctx, body.name);
    await auditRepo.log(ctx, {
      action: "outreach.campaign.create",
      targetType: "outreach_campaign",
      targetId: campaign.id,
    });
    return campaign;
  },

  async setSequence(ctx: TenantContext, campaignId: string, body: SetSequenceBody) {
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

  async listLeads(ctx: TenantContext, campaignId: string) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    return await outreachLeadRepo.listByCampaign(ctx, campaignId);
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

    await outreachCampaignRepo.setStatus(ctx, campaignId, "importing");
    await auditRepo.log(ctx, {
      action: "outreach.leads.upload_complete",
      targetType: "outreach_campaign",
      targetId: campaignId,
    });

    await getServices().queue.enqueue(PARSE_LEADS_DOCX_JOB, {
      tenantId: ctx.tenantId,
      campaignId,
      fileKey: body.fileKey,
    });

    return { id: campaignId, status: "importing" as const };
  },

  /**
   * A single Fire sends ONE sequence step to every currently-eligible lead —
   * a lead that already got its day0 send is still eligible for day3 (see
   * `outreachLeadRepo.listEligibleForStep`). Each scheduled send is its own
   * Inngest job carrying its own `targetSendAt`, so pause/stop only need to
   * flip `campaign.status` — there's no in-memory queue state to lose, unlike
   * the old CRM's setTimeout loop.
   */
  async fireCampaign(ctx: TenantContext, campaignId: string, stepIndex: number) {
    const campaign = await outreachCampaignRepo.getById(ctx, campaignId);
    if (!campaign) throw new NotFound("Campaign not found");
    if (campaign.status !== "ready" && campaign.status !== "running") {
      throw new Conflict(
        `Campaign must be ready or running to fire (current status: ${campaign.status})`,
      );
    }

    const senders = await senderAccountRepo.listActive(ctx);
    if (senders.length === 0) {
      throw new BadRequest("Connect at least one sender account before firing");
    }

    const leads = await outreachLeadRepo.listEligibleForStep(ctx, campaignId, stepIndex);
    if (leads.length === 0) {
      throw new Conflict("No eligible leads for this step");
    }

    const scheduled = scheduleSends({
      leadIds: leads.map((l) => l.id),
      senderAccountIds: senders.map((s) => s.id),
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

    await Promise.all(leads.map((l) => outreachLeadRepo.setStatus(ctx, l.id, "scheduled")));
    await outreachCampaignRepo.setStatus(ctx, campaignId, "running");
    await auditRepo.log(ctx, {
      action: "outreach.campaign.fire",
      targetType: "outreach_campaign",
      targetId: campaignId,
      metadata: { stepIndex, count: sends.length },
    });

    for (const send of sends) {
      await getServices().queue.enqueue(SEND_OUTREACH_EMAIL_JOB, {
        tenantId: ctx.tenantId,
        sendId: send.id,
        targetSendAt: send.scheduledAt.toISOString(),
      });
    }

    return { id: campaignId, status: "running" as const, scheduled: sends.length };
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
    const existing = await senderAccountRepo.getByEmail(ctx, body.email);
    if (existing) throw new Conflict("A sender account with this email already exists");

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

  async setSenderActive(ctx: TenantContext, senderId: string, isActive: boolean) {
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
  buildGmailOAuthUrl(tenantId: string, userId: string | undefined, appOrigin: string): string {
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
  async completeGmailOAuth(params: { code: string; state: string; appOrigin: string }) {
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

    return await withTenantTx(
      { tenantId: claims.tenantId, userId: claims.userId || undefined },
      async (ctx) => {
        const existing = await senderAccountRepo.getByEmail(ctx, email);
        if (existing) throw new Conflict("This Gmail account is already connected");
        const sender = await senderAccountRepo.createGmail(ctx, {
          label: email,
          email,
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
