import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import type { Services } from "@/server/ports";
import { MockStorage } from "@/server/adapters/mock.storage";
import { MockExtractor } from "@/server/adapters/mock.extractor";
import { MockEmbedder } from "@/server/adapters/mock.embedder";
import { MockReranker } from "@/server/adapters/mock.reranker";
import { GeminiReranker } from "@/server/adapters/gemini.reranker";
import { MockPaymentProvider } from "@/server/adapters/mock.payment";
import { MockMailer } from "@/server/adapters/mock.mailer";
import { ResendMailer } from "@/server/adapters/resend.mailer";
import { MockOutreachMailer } from "@/server/adapters/mock.outreach-mailer";
import { OutreachMailerAdapter } from "@/server/adapters/outreach.mailer";
import { MockWhatsAppSender } from "@/server/adapters/mock.whatsapp-sender";
import { WhatsAppSenderAdapter } from "@/server/adapters/whatsapp.sender";
import { MockWhatsAppTemplateManager } from "@/server/adapters/mock.whatsapp-template-manager";
import { WhatsAppTemplateManagerAdapter } from "@/server/adapters/whatsapp.template-manager";
import { InProcessQueue } from "@/server/adapters/inprocess.queue";
import { ClaudeExtractor } from "@/server/adapters/claude.extractor";
import { GeminiExtractor } from "@/server/adapters/gemini.extractor";
import { VoyageEmbedder } from "@/server/adapters/voyage.embedder";
import { StripePaymentProvider } from "@/server/adapters/stripe.payment";
import { SupabaseStorage } from "@/server/adapters/supabase.storage";
import { MemoryRateLimiter } from "@/server/adapters/memory.ratelimit";
import { RedisRateLimiter } from "@/server/adapters/redis.ratelimit";
import { InngestQueue } from "@/server/adapters/inngest.queue";
import {
  parseResume,
  PARSE_RESUME_JOB,
  type ParseResumePayload,
} from "@/server/jobs/parse-resume";
import {
  parseLeadsDocxJob,
  PARSE_LEADS_DOCX_JOB,
  type ParseLeadsDocxPayload,
} from "@/server/jobs/parse-leads-docx";
import {
  sendOutreachEmail,
  SEND_OUTREACH_EMAIL_JOB,
  type SendOutreachEmailPayload,
} from "@/server/jobs/send-outreach-email";
import {
  fireScheduledCampaign,
  FIRE_SCHEDULED_CAMPAIGN_JOB,
  type FireScheduledCampaignPayload,
} from "@/server/jobs/fire-scheduled-campaign";
import {
  sendOutreachWhatsapp,
  SEND_OUTREACH_WHATSAPP_JOB,
  type SendOutreachWhatsAppPayload,
} from "@/server/jobs/send-outreach-whatsapp";
import {
  syncWhatsAppTemplates,
  SYNC_WHATSAPP_TEMPLATES_JOB,
} from "@/server/jobs/sync-whatsapp-templates";

let services: Services | null = null;

/** Build (once) and return the wired service container. APP_MODE selects mock
 *  vs live adapters. Live adapters are added in B7 (go-real). */
export function getServices(): Services {
  if (services) return services;
  const env = getEnv();

  if (env.APP_MODE === "mock") {
    const queue = new InProcessQueue();
    services = {
      storage: new MockStorage(),
      extractor: new MockExtractor(),
      embedder: new MockEmbedder(),
      reranker: new MockReranker(),
      payment: new MockPaymentProvider(),
      queue,
      limiter: new MemoryRateLimiter(),
      mailer: new MockMailer(),
      outreachMailer: new MockOutreachMailer(),
      whatsappSender: new MockWhatsAppSender(),
      whatsappTemplateManager: new MockWhatsAppTemplateManager(),
    };
    queue.register(PARSE_RESUME_JOB, (payload) =>
      parseResume(payload as ParseResumePayload, services as Services),
    );
    queue.register(PARSE_LEADS_DOCX_JOB, (payload) =>
      parseLeadsDocxJob(payload as ParseLeadsDocxPayload, services as Services),
    );
    // No sleepUntil here — InProcessQueue runs handlers inline for deterministic
    // tests/dev, so a scheduled send just fires immediately instead of waiting
    // for its block; the pacing delay only matters against a real Inngest queue.
    queue.register(SEND_OUTREACH_EMAIL_JOB, (payload) => {
      const data = payload as SendOutreachEmailPayload & { targetSendAt: string };
      return sendOutreachEmail(
        { tenantId: data.tenantId, sendId: data.sendId },
        services as Services,
      );
    });
    // Same inline-vs-deferred caveat as SEND_OUTREACH_EMAIL_JOB above — the
    // payload field is scheduledFireAt, not targetSendAt, so InProcessQueue
    // runs this immediately rather than waiting; real delay only happens
    // under a live Inngest queue.
    queue.register(FIRE_SCHEDULED_CAMPAIGN_JOB, (payload) =>
      fireScheduledCampaign(
        payload as FireScheduledCampaignPayload,
        services as Services,
      ),
    );
    // Same inline-vs-deferred caveat as SEND_OUTREACH_EMAIL_JOB above.
    queue.register(SEND_OUTREACH_WHATSAPP_JOB, (payload) => {
      const data = payload as SendOutreachWhatsAppPayload & { targetSendAt: string };
      return sendOutreachWhatsapp(
        { tenantId: data.tenantId, sendId: data.sendId },
        services as Services,
      );
    });
    // No real cron under InProcessQueue/mock mode — nothing to reconcile
    // against a live Meta API in dev/test anyway. Registered so a manual
    // enqueue (e.g. from a test) still resolves to a handler.
    queue.register(SYNC_WHATSAPP_TEMPLATES_JOB, () =>
      syncWhatsAppTemplates(services as Services),
    );
  } else {
    // APP_MODE=live — real services.
    // In serverless production, use InngestQueue to prevent background job freezing.
    // In local development / staging, default to InProcessQueue if INNGEST_EVENT_KEY is not set
    // so smoke tests and local dev work with zero configuration.
    const useInngest = env.NODE_ENV === "production" || !!process.env.INNGEST_EVENT_KEY;
    const queue = useInngest ? new InngestQueue() : new InProcessQueue();

    // Extractor: Gemini (free tier) if GEMINI_API_KEY is set, else Claude.
    const extractor = env.GEMINI_API_KEY
      ? new GeminiExtractor()
      : new ClaudeExtractor();

    // MemoryRateLimiter's counters live in this process's memory only — on a
    // serverless/horizontally-scaled deployment, every instance gets its own
    // independent counter, so a limit of e.g. 20/hour actually allows
    // 20 × (instance count)/hour, silently. That's not a hypothetical: this
    // app already forces InngestQueue over InProcessQueue in production for
    // the exact same "multiple instances, no shared state" reason (see
    // `useInngest` above). Fail loud here so a missing REDIS_URL in
    // production is caught at deploy time, not discovered as an outreach
    // route quietly not rate-limiting anyone.
    if (!env.REDIS_URL && env.NODE_ENV === "production") {
      logger.error(
        "REDIS_URL is not set in production — falling back to MemoryRateLimiter, " +
          "which does not share state across instances and will NOT enforce rate " +
          "limits correctly under horizontal scaling. Set REDIS_URL (Upstash) to fix.",
      );
    }
    const limiter = env.REDIS_URL ? new RedisRateLimiter() : new MemoryRateLimiter();

    // LLM reranking needs an AI key. With Gemini available we rerank for real;
    // otherwise we degrade gracefully to pure vector order (identity rerank).
    const reranker = env.GEMINI_API_KEY ? new GeminiReranker() : new MockReranker();

    services = {
      storage: new SupabaseStorage(),
      extractor,
      embedder: new VoyageEmbedder(),
      reranker,
      payment: new StripePaymentProvider(),
      queue,
      limiter,
      mailer: env.RESEND_API_KEY ? new ResendMailer() : new MockMailer(),
      outreachMailer: new OutreachMailerAdapter(),
      whatsappSender: new WhatsAppSenderAdapter(),
      whatsappTemplateManager: new WhatsAppTemplateManagerAdapter(),
    };

    if (queue instanceof InProcessQueue) {
      queue.register(PARSE_RESUME_JOB, (payload) =>
        parseResume(payload as ParseResumePayload, services as Services),
      );
      queue.register(PARSE_LEADS_DOCX_JOB, (payload) =>
        parseLeadsDocxJob(payload as ParseLeadsDocxPayload, services as Services),
      );
      queue.register(SEND_OUTREACH_EMAIL_JOB, (payload) => {
        const data = payload as SendOutreachEmailPayload & { targetSendAt: string };
        return sendOutreachEmail(
          { tenantId: data.tenantId, sendId: data.sendId },
          services as Services,
        );
      });
      queue.register(FIRE_SCHEDULED_CAMPAIGN_JOB, (payload) =>
        fireScheduledCampaign(
          payload as FireScheduledCampaignPayload,
          services as Services,
        ),
      );
      queue.register(SEND_OUTREACH_WHATSAPP_JOB, (payload) => {
        const data = payload as SendOutreachWhatsAppPayload & { targetSendAt: string };
        return sendOutreachWhatsapp(
          { tenantId: data.tenantId, sendId: data.sendId },
          services as Services,
        );
      });
      queue.register(SYNC_WHATSAPP_TEMPLATES_JOB, () =>
        syncWhatsAppTemplates(services as Services),
      );
    }
  }

  return services;
}

/** Test-only: reset the singleton so each suite gets a clean container. */
export function resetServices(): void {
  services = null;
}
