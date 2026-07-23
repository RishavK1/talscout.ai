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
import {
  sendOutreachWhatsapp,
  type SendOutreachWhatsAppPayload,
} from "@/server/jobs/send-outreach-whatsapp";
import { syncWhatsAppTemplates } from "@/server/jobs/sync-whatsapp-templates";
import { runAutomatedCampaigns, runAutomatedCampaignNow } from "@/server/jobs/run-automated-campaign";
import { pollAutomatedReplies } from "@/server/jobs/poll-automated-replies";
import { pollOutreachReplies } from "@/server/jobs/poll-outreach-replies";
import type { StepRun } from "@/server/jobs/step-runner";
import {
  sendAutomatedEmail,
  type SendAutomatedEmailPayload,
} from "@/server/jobs/send-automated-email";
import { getServices } from "@/server/container";
import { withTenantTx } from "@/server/db/tx";
import {
  outreachSendRepo,
  outreachLeadRepo,
  outreachCampaignRepo,
} from "@/server/repositories/outreach.repo";
import { automatedSendRepo, automatedLeadRepo } from "@/server/repositories/automated-outreach.repo";
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
 * Automated-outreach counterpart of sendOutreachEmailFunction above — same
 * durable-sleep shape, fully separate job/queue from Bulk Fire. Enqueued
 * once per row by run-automated-campaign.ts, each carrying its own
 * `targetSendAt` computed by the same block+jitter pacing algorithm
 * (scheduleSends) Bulk Fire uses, so a whole campaign's leads never fire in
 * the same minute.
 */
const sendAutomatedEmailFunction = inngest.createFunction(
  {
    id: "send-automated-email",
    name: "Automated Outreach Send Email",
    triggers: [{ event: "job/send-automated-email" }],
    // Same defense-in-depth as sendOutreachEmailFunction.onFailure above.
    onFailure: async ({ event, error }) => {
      const { tenantId, sendId } = event.data.event.data as SendAutomatedEmailPayload;
      logger.error({ err: error, sendId }, "send_automated_email_exhausted_retries");
      await withTenantTx({ tenantId }, async (ctx) => {
        const send = await automatedSendRepo.getById(ctx, sendId);
        if (!send || send.status !== "scheduled") return;
        await automatedSendRepo.markFailed(ctx, sendId, error.message || "exhausted_retries");
        await automatedLeadRepo.setStatus(ctx, send.leadId, "failed");
      });
    },
  },
  async ({
    event,
    step,
  }: {
    event: { data: SendAutomatedEmailPayload & { targetSendAt: string } };
    step: GetStepTools<typeof inngest>;
  }) => {
    const { targetSendAt, ...payload } = event.data;
    await step.sleepUntil("wait-for-send-slot", targetSendAt);
    await step.run("send", async () => {
      const services = getServices();
      await sendAutomatedEmail(payload, services);
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

/**
 * Structural sibling of sendOutreachEmailFunction — same durable-sleep shell,
 * forked into its own job because Meta's send/error shapes don't map onto
 * SMTP/Gmail's (see send-outreach-whatsapp.ts).
 */
const sendOutreachWhatsappFunction = inngest.createFunction(
  {
    id: "send-outreach-whatsapp",
    name: "Bulk Fire Send WhatsApp",
    triggers: [{ event: "job/send-outreach-whatsapp" }],
    // Same defense-in-depth as sendOutreachEmailFunction.onFailure above.
    onFailure: async ({ event, error }) => {
      const { tenantId, sendId } = event.data.event.data as SendOutreachWhatsAppPayload;
      logger.error({ err: error, sendId }, "send_outreach_whatsapp_exhausted_retries");
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
    event: { data: SendOutreachWhatsAppPayload & { targetSendAt: string } };
    step: GetStepTools<typeof inngest>;
  }) => {
    const { targetSendAt, ...payload } = event.data;
    await step.sleepUntil("wait-for-send-slot", targetSendAt);
    await step.run("send", async () => {
      const services = getServices();
      await sendOutreachWhatsapp(payload, services);
    });
  }
);

/**
 * Cron-triggered backstop for Meta's template-approval webhook (plan §2) —
 * distinct registration pattern from the event-triggered functions above:
 * no `event.data`, just a schedule.
 */
const syncWhatsAppTemplatesFunction = inngest.createFunction(
  {
    id: "sync-whatsapp-templates",
    name: "WhatsApp Template Status Sync",
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async () => {
    const services = getServices();
    await syncWhatsAppTemplates(services);
  }
);

/**
 * Cron-triggered automated-outreach pipeline (discover → enrich → generate →
 * send) — same no-event, schedule-only pattern as syncWhatsAppTemplatesFunction
 * above. Fully separate from every Bulk Fire function in this file.
 *
 * `concurrency: { limit: 1 }` — a tick that runs long under real load (many
 * active campaigns, each doing dozens of external lookups/AI calls) must
 * never overlap with the next scheduled trigger; without this, two
 * concurrent ticks would process the same campaigns at once and double the
 * rate-limited free-tier API/AI spend for zero benefit (data itself stays
 * safe either way via the unique indexes on leads/sends).
 *
 * `step` is passed straight into runAutomatedCampaigns as its checkpointing
 * hook (see step-runner.ts) — each campaign's discover/enrich/generate
 * phases run in small, independently-retryable batches instead of one
 * long, un-resumable function body. A crash or platform timeout mid-tick
 * now resumes from the next unfinished batch on retry instead of redoing
 * already-completed (and quota-costly) work from scratch.
 */
const runAutomatedCampaignsFunction = inngest.createFunction(
  {
    id: "run-automated-campaigns",
    name: "Automated Outreach Campaign Run",
    triggers: [{ cron: "0 0,6,12,18 * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }: { step: GetStepTools<typeof inngest> }) => {
    const services = getServices();
    // Inngest's real step.run types its return as Jsonify<Awaited<T>> (it
    // really does round-trip through JSON for durability) — every payload
    // this job's steps return is already a plain, JSON-safe shape (numbers/
    // strings only, no Date/undefined fields), so the cast below is safe.
    const stepRun: StepRun = <T,>(id: string, fn: () => Promise<T>) =>
      step.run(id, fn) as unknown as Promise<T>;
    await runAutomatedCampaigns(services, stepRun);
  }
);

/**
 * Event-triggered (NOT cron) — enqueued once, right when a campaign is
 * activated (see automated-outreach.service.ts's activateCampaign), so the
 * first discovery run happens within seconds instead of waiting for the
 * next fixed cron slot (up to 6 hours away). Runs the exact same
 * discover→enrich→qualify→generate→send pipeline, scoped to just this one
 * campaign, with the same step-checkpointing and error isolation as the
 * cron sweep. `concurrency` is keyed per-campaign (not global limit:1 like
 * the sweep) so activating several campaigns at once doesn't queue behind
 * each other, but the SAME campaign can't have two overlapping runs (this
 * event racing a cron tick that happens to land at the same moment).
 */
const runAutomatedCampaignNowFunction = inngest.createFunction(
  {
    id: "run-automated-campaign-now",
    name: "Automated Outreach Campaign — Run Now (on activation)",
    triggers: [{ event: "job/run-automated-campaign-now" }],
    concurrency: { limit: 1, key: "event.data.campaignId" },
  },
  async ({
    event,
    step,
  }: {
    event: { data: { campaignId: string } };
    step: GetStepTools<typeof inngest>;
  }) => {
    const services = getServices();
    const stepRun: StepRun = <T,>(id: string, fn: () => Promise<T>) =>
      step.run(id, fn) as unknown as Promise<T>;
    await runAutomatedCampaignNow(event.data.campaignId, services, stepRun);
  }
);

/** Cron-triggered reply poll for automated-outreach campaigns — drafts
 *  AI replies for human review, never sends anything itself.
 *
 *  Same `concurrency: { limit: 1 }` + step-checkpointing rationale as
 *  runAutomatedCampaignsFunction above — the 20-minute interval here is
 *  tight enough that an overlapping run is a real risk once there are many
 *  tenants with many sent emails in the 30-day poll window. */
const pollAutomatedRepliesFunction = inngest.createFunction(
  {
    id: "poll-automated-replies",
    name: "Automated Outreach Reply Poll",
    triggers: [{ cron: "*/20 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }: { step: GetStepTools<typeof inngest> }) => {
    const services = getServices();
    // See the matching comment in runAutomatedCampaignsFunction above.
    const stepRun: StepRun = <T,>(id: string, fn: () => Promise<T>) =>
      step.run(id, fn) as unknown as Promise<T>;
    await pollAutomatedReplies(services, stepRun);
  }
);

/** Cron-triggered reply poll for Bulk Fire's own campaigns — same shape and
 *  interval as pollAutomatedRepliesFunction above, just without the AI-draft
 *  step (see poll-outreach-replies.ts's doc comment). */
const pollOutreachRepliesFunction = inngest.createFunction(
  {
    id: "poll-outreach-replies",
    name: "Bulk Fire Reply Poll",
    triggers: [{ cron: "*/20 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }: { step: GetStepTools<typeof inngest> }) => {
    const services = getServices();
    const stepRun: StepRun = <T,>(id: string, fn: () => Promise<T>) =>
      step.run(id, fn) as unknown as Promise<T>;
    await pollOutreachReplies(services, stepRun);
  }
);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    parseResumeFunction,
    parseLeadsDocxFunction,
    sendOutreachEmailFunction,
    fireScheduledCampaignFunction,
    sendOutreachWhatsappFunction,
    syncWhatsAppTemplatesFunction,
    runAutomatedCampaignsFunction,
    runAutomatedCampaignNowFunction,
    pollAutomatedRepliesFunction,
    sendAutomatedEmailFunction,
    pollOutreachRepliesFunction,
  ],
});
