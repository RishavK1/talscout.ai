import { serve } from "inngest/next";
import type { GetStepTools } from "inngest";
import { inngest } from "@/server/jobs/inngest-client";
import { parseResume, type ParseResumePayload } from "@/server/jobs/parse-resume";
import {
  parseLeadsDocxJob,
  type ParseLeadsDocxPayload,
} from "@/server/jobs/parse-leads-docx";
import {
  sendOutreachEmail,
  type SendOutreachEmailPayload,
} from "@/server/jobs/send-outreach-email";
import {
  fireScheduledCampaign,
  type FireScheduledCampaignPayload,
} from "@/server/jobs/fire-scheduled-campaign";
import { getServices } from "@/server/container";
import { withTenantTx } from "@/server/db/tx";
import {
  outreachSendRepo,
  outreachLeadRepo,
  outreachCampaignRepo,
} from "@/server/repositories/outreach.repo";
import { logger } from "@/server/observability/logger";

const parseResumeFunction = inngest.createFunction(
  {
    id: "parse-resume",
    name: "Parse Resume Ingestion",
    triggers: [{ event: "job/parse-resume" }],
  },
  async ({ event }: { event: { data: ParseResumePayload } }) => {
    const payload = event.data;
    // Serve runs under live DB configuration when deployed
    const services = getServices();
    await parseResume(payload, services);
  }
);

const parseLeadsDocxFunction = inngest.createFunction(
  {
    id: "parse-leads-docx",
    name: "Bulk Fire Leads Docx Import",
    triggers: [{ event: "job/parse-leads-docx" }],
  },
  async ({ event }: { event: { data: ParseLeadsDocxPayload } }) => {
    const payload = event.data;
    const services = getServices();
    await parseLeadsDocxJob(payload, services);
  }
);

/**
 * Enqueued once per scheduled `outreachSends` row (see the fire flow in
 * outreach.service.ts), each carrying its own `targetSendAt`. `step.sleepUntil`
 * is the durable replacement for the old CRM's browser `setTimeout` loop —
 * this suspends the function (no process kept alive, no tab required) and
 * Inngest wakes it back up at the target time even across redeploys.
 */
const sendOutreachEmailFunction = inngest.createFunction(
  {
    id: "send-outreach-email",
    name: "Bulk Fire Send Email",
    triggers: [{ event: "job/send-outreach-email" }],
    // Guards against infra-level failures (e.g. a misconfigured signing key)
    // that stop the run before `sendOutreachEmail`'s own try/catch ever
    // executes — without this, Inngest correctly shows the run "Failed" but
    // the send/lead rows stay "scheduled" forever since nothing else ever
    // updates them.
    onFailure: async ({ event, error }) => {
      const { tenantId, sendId } = event.data.event.data as SendOutreachEmailPayload;
      logger.error({ err: error, sendId }, "send_outreach_email_exhausted_retries");
      await withTenantTx({ tenantId }, async (ctx) => {
        const send = await outreachSendRepo.getById(ctx, sendId);
        if (!send || send.status !== "scheduled") return;
        await outreachSendRepo.markFailed(ctx, sendId, error.message || "exhausted_retries");
        await outreachLeadRepo.setStatus(ctx, send.leadId, "failed");
      });
    },
  },
  async ({
    event,
    step,
  }: {
    event: { data: SendOutreachEmailPayload & { targetSendAt: string } };
    step: GetStepTools<typeof inngest>;
  }) => {
    const { targetSendAt, ...payload } = event.data;
    await step.sleepUntil("wait-for-send-slot", targetSendAt);
    await step.run("send", async () => {
      const services = getServices();
      await sendOutreachEmail(payload, services);
    });
  }
);

/**
 * Enqueued once per schedule-fire request (see outreachService.scheduleFire),
 * carrying the chosen `scheduledFireAt`. Same durable-sleep shape as
 * sendOutreachEmailFunction above, one level up: this suspends until the
 * chosen fire time, then runs fireScheduledCampaign, which re-validates
 * against the campaign's live scheduledFireAt before doing anything — a
 * cancel/reschedule just makes this wake-up a no-op.
 */
const fireScheduledCampaignFunction = inngest.createFunction(
  {
    id: "fire-scheduled-campaign",
    name: "Bulk Fire Scheduled Campaign Fire",
    triggers: [{ event: "job/fire-scheduled-campaign" }],
    // Same defense-in-depth as sendOutreachEmailFunction.onFailure above:
    // fireScheduledCampaign's own try/catch only fires once its code actually
    // runs, so an infra-level failure before that needs this fallback too.
    onFailure: async ({ event, error }) => {
      const { tenantId, campaignId } = event.data.event
        .data as FireScheduledCampaignPayload;
      logger.error(
        { err: error, campaignId },
        "fire_scheduled_campaign_exhausted_retries",
      );
      await withTenantTx({ tenantId }, async (ctx) => {
        await outreachCampaignRepo.clearScheduledFire(ctx, campaignId);
        await outreachCampaignRepo.setStatus(
          ctx,
          campaignId,
          "error",
          error.message || "exhausted_retries",
        );
      });
    },
  },
  async ({
    event,
    step,
  }: {
    event: { data: FireScheduledCampaignPayload };
    step: GetStepTools<typeof inngest>;
  }) => {
    const payload = event.data;
    await step.sleepUntil("wait-for-scheduled-fire", payload.scheduledFireAt);
    await step.run("fire", async () => {
      const services = getServices();
      await fireScheduledCampaign(payload, services);
    });
  }
);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    parseResumeFunction,
    parseLeadsDocxFunction,
    sendOutreachEmailFunction,
    fireScheduledCampaignFunction,
  ],
});
