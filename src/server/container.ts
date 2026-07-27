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
import {
  MockBlueprintResearcher,
  MockBlueprintGenerator,
} from "@/server/adapters/mock.blueprint";
import {
  GeminiBlueprintResearcher,
  GeminiBlueprintGenerator,
} from "@/server/adapters/gemini.blueprint";
import {
  OpenRouterBlueprintResearcher,
  OpenRouterBlueprintGenerator,
} from "@/server/adapters/openrouter.blueprint";
import {
  PerplexityBlueprintResearcher,
  PerplexityBlueprintGenerator,
} from "@/server/adapters/perplexity.blueprint";
import { PerplexityLeadQualifier } from "@/server/adapters/perplexity.lead-qualifier";
import { MockWebResearcher } from "@/server/adapters/mock.web-researcher";
import { PerplexityWebResearcher } from "@/server/adapters/perplexity.web-researcher";
import { MockLeadDiscovery } from "@/server/adapters/mock.lead-discovery";
import { OverpassLeadDiscovery } from "@/server/adapters/overpass.lead-discovery";
import { GeoapifyLeadDiscovery } from "@/server/adapters/geoapify.lead-discovery";
import { GooglePlacesLeadDiscovery } from "@/server/adapters/google-places.lead-discovery";
import { FallbackLeadDiscovery } from "@/server/adapters/fallback.lead-discovery";
import { MockEmailFinder } from "@/server/adapters/mock.email-finder";
import { SiteScrapeEmailFinder } from "@/server/adapters/site-scrape.email-finder";
import { FirecrawlEmailFinder } from "@/server/adapters/firecrawl.email-finder";
import { HunterEmailFinder } from "@/server/adapters/hunter.email-finder";
import { SnovEmailFinder } from "@/server/adapters/snov.email-finder";
import { ApolloEmailFinder } from "@/server/adapters/apollo.email-finder";
import { WaterfallEmailFinder } from "@/server/adapters/waterfall.email-finder";
import { MockOutreachCopywriter } from "@/server/adapters/mock.outreach-copywriter";
import { GeminiOutreachCopywriter } from "@/server/adapters/gemini.outreach-copywriter";
import { OpenRouterOutreachCopywriter } from "@/server/adapters/openrouter.outreach-copywriter";
import { MockLeadQualifier } from "@/server/adapters/mock.lead-qualifier";
import { GeminiLeadQualifier } from "@/server/adapters/gemini.lead-qualifier";
import { OpenRouterLeadQualifier } from "@/server/adapters/openrouter.lead-qualifier";
import { MockReplyDrafter } from "@/server/adapters/mock.reply-drafter";
import { GeminiReplyDrafter } from "@/server/adapters/gemini.reply-drafter";
import { OpenRouterReplyDrafter } from "@/server/adapters/openrouter.reply-drafter";
import {
  FallbackBlueprintResearcher,
  FallbackBlueprintGenerator,
  FallbackOutreachCopywriter,
  FallbackLeadQualifier,
  FallbackReplyDrafter,
} from "@/server/adapters/fallback-ai";
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
import {
  runAutomatedCampaigns,
  runAutomatedCampaignNow,
  RUN_AUTOMATED_CAMPAIGN_JOB,
  RUN_AUTOMATED_CAMPAIGN_NOW_JOB,
} from "@/server/jobs/run-automated-campaign";
import {
  pollAutomatedReplies,
  POLL_AUTOMATED_REPLIES_JOB,
} from "@/server/jobs/poll-automated-replies";
import {
  sendAutomatedEmail,
  SEND_AUTOMATED_EMAIL_JOB,
  type SendAutomatedEmailPayload,
} from "@/server/jobs/send-automated-email";

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
      blueprintResearcher: new MockBlueprintResearcher(),
      blueprintGenerator: new MockBlueprintGenerator(),
      webResearcher: new MockWebResearcher(),
      leadDiscovery: new MockLeadDiscovery(),
      emailFinder: new MockEmailFinder(),
      leadQualifier: new MockLeadQualifier(),
      outreachCopywriter: new MockOutreachCopywriter(),
      replyDrafter: new MockReplyDrafter(),
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
    // Same "no real cron under InProcessQueue" note as above — registered so
    // a manual enqueue (e.g. from a test) still resolves to a handler.
    queue.register(RUN_AUTOMATED_CAMPAIGN_JOB, () =>
      runAutomatedCampaigns(services as Services),
    );
    queue.register(RUN_AUTOMATED_CAMPAIGN_NOW_JOB, (payload) =>
      runAutomatedCampaignNow((payload as { campaignId: string }).campaignId, services as Services),
    );
    queue.register(POLL_AUTOMATED_REPLIES_JOB, () =>
      pollAutomatedReplies(services as Services),
    );
    // Same inline-vs-deferred caveat as SEND_OUTREACH_EMAIL_JOB above.
    queue.register(SEND_AUTOMATED_EMAIL_JOB, (payload) => {
      const data = payload as SendAutomatedEmailPayload & { targetSendAt: string };
      return sendAutomatedEmail(
        { tenantId: data.tenantId, sendId: data.sendId },
        services as Services,
      );
    });
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

    // Blueprint AI runs on Gemini (free tier) when a key is present; without
    // one we fall back to the deterministic mock so the feature still works
    // end-to-end (with generic, editable suggestions) rather than 500-ing.
    // When OPENROUTER_API_KEY is ALSO set, it's wired in as a last-resort
    // fallback tier below Gemini (never the primary) — reached only once
    // Gemini's own primary+fallback model both fail, e.g. its free daily
    // quota is exhausted. See fallback-ai.ts / openrouter.client.ts.
    //
    // When PERPLEXITY_API_KEY_PRIMARY is ALSO set (a second, separate
    // Perplexity account/key on its own credit budget — distinct from
    // PERPLEXITY_API_KEY's web-research role below), it's wired as the
    // FIRST tier ahead of Gemini: Perplexity → Gemini → OpenRouter. See
    // perplexity.client.ts.
    const perplexityBlueprintResearcher = env.PERPLEXITY_API_KEY_PRIMARY
      ? new PerplexityBlueprintResearcher()
      : null;
    const perplexityBlueprintGenerator = env.PERPLEXITY_API_KEY_PRIMARY
      ? new PerplexityBlueprintGenerator()
      : null;
    const geminiBlueprintResearcher = env.GEMINI_API_KEY ? new GeminiBlueprintResearcher() : null;
    const geminiBlueprintGenerator = env.GEMINI_API_KEY ? new GeminiBlueprintGenerator() : null;
    const openRouterBlueprintResearcher = env.OPENROUTER_API_KEY
      ? new OpenRouterBlueprintResearcher()
      : null;
    const openRouterBlueprintGenerator = env.OPENROUTER_API_KEY
      ? new OpenRouterBlueprintGenerator()
      : null;
    const geminiThenOpenRouterResearcher =
      geminiBlueprintResearcher && openRouterBlueprintResearcher
        ? new FallbackBlueprintResearcher(geminiBlueprintResearcher, openRouterBlueprintResearcher)
        : (geminiBlueprintResearcher ?? openRouterBlueprintResearcher);
    const blueprintResearcher =
      perplexityBlueprintResearcher && geminiThenOpenRouterResearcher
        ? new FallbackBlueprintResearcher(perplexityBlueprintResearcher, geminiThenOpenRouterResearcher)
        : (perplexityBlueprintResearcher ?? geminiThenOpenRouterResearcher ?? new MockBlueprintResearcher());
    const geminiThenOpenRouterGenerator =
      geminiBlueprintGenerator && openRouterBlueprintGenerator
        ? new FallbackBlueprintGenerator(geminiBlueprintGenerator, openRouterBlueprintGenerator)
        : (geminiBlueprintGenerator ?? openRouterBlueprintGenerator);
    const blueprintGenerator =
      perplexityBlueprintGenerator && geminiThenOpenRouterGenerator
        ? new FallbackBlueprintGenerator(perplexityBlueprintGenerator, geminiThenOpenRouterGenerator)
        : (perplexityBlueprintGenerator ?? geminiThenOpenRouterGenerator ?? new MockBlueprintGenerator());

    // Perplexity Sonar — metered, unlike every other adapter above, so it's
    // wired ONLY into blueprint generate() (once per blueprint), never into
    // the free-forever suggest/qualify/copy paths. No fallback chain: a
    // missing key or a failed call both just mean "no extra research this
    // time" (see WebResearcher's doc comment), never a hard failure.
    const webResearcher = env.PERPLEXITY_API_KEY ? new PerplexityWebResearcher() : new MockWebResearcher();

    // Automated outreach: lead discovery is free-by-default (OpenStreetMap,
    // no key). Fallbacks are tried in order, each only topping up a short
    // result: Geoapify (free, 3,000 credits/day) first if configured, then
    // Google Places — the one OPTIONAL, NOT-free source in the chain,
    // constructed and referenced ONLY when GOOGLE_PLACES_API_KEY is set, so
    // there is no code path that ever touches it without that key present.
    const overpassDiscovery = new OverpassLeadDiscovery();
    const discoveryFallbacks = [
      env.GEOAPIFY_API_KEY ? new GeoapifyLeadDiscovery() : null,
      env.GOOGLE_PLACES_API_KEY ? new GooglePlacesLeadDiscovery() : null,
    ].filter((f): f is NonNullable<typeof f> => f !== null);
    const leadDiscovery = discoveryFallbacks.length
      ? new FallbackLeadDiscovery(overpassDiscovery, discoveryFallbacks)
      : overpassDiscovery;

    // Email finding: free website-scrape first (plus Firecrawl's JS-rendering
    // scrape as a same-tier fallback for client-rendered sites), then
    // Hunter/Snov/Apollo free tiers only if their keys are configured. Each
    // stays free-forever; the waterfall degrades gracefully with fewer
    // sources if keys are absent.
    const emailFinder = new WaterfallEmailFinder(
      [
        new SiteScrapeEmailFinder(),
        env.FIRECRAWL_API_KEY ? new FirecrawlEmailFinder() : null,
        env.HUNTER_API_KEY ? new HunterEmailFinder() : null,
        env.SNOV_CLIENT_ID && env.SNOV_CLIENT_SECRET ? new SnovEmailFinder() : null,
        env.APOLLO_API_KEY ? new ApolloEmailFinder() : null,
      ].filter((f): f is NonNullable<typeof f> => f !== null),
    );

    // Same Gemini-primary / OpenRouter-last-resort-fallback pattern as the
    // blueprint adapters above.
    const geminiOutreachCopywriter = env.GEMINI_API_KEY ? new GeminiOutreachCopywriter() : null;
    const openRouterOutreachCopywriter = env.OPENROUTER_API_KEY
      ? new OpenRouterOutreachCopywriter()
      : null;
    const outreachCopywriter =
      geminiOutreachCopywriter && openRouterOutreachCopywriter
        ? new FallbackOutreachCopywriter(geminiOutreachCopywriter, openRouterOutreachCopywriter)
        : (geminiOutreachCopywriter ?? openRouterOutreachCopywriter ?? new MockOutreachCopywriter());

    // Perplexity-primary (PERPLEXITY_API_KEY_PRIMARY) → Gemini →
    // OpenRouter-last-resort-fallback — only ever called for the one case
    // run-automated-campaign.ts's own free rule-based checks can't decide
    // (see qualifyLeadCheaply there).
    const perplexityLeadQualifier = env.PERPLEXITY_API_KEY_PRIMARY ? new PerplexityLeadQualifier() : null;
    const geminiLeadQualifier = env.GEMINI_API_KEY ? new GeminiLeadQualifier() : null;
    const openRouterLeadQualifier = env.OPENROUTER_API_KEY ? new OpenRouterLeadQualifier() : null;
    const geminiThenOpenRouterQualifier =
      geminiLeadQualifier && openRouterLeadQualifier
        ? new FallbackLeadQualifier(geminiLeadQualifier, openRouterLeadQualifier)
        : (geminiLeadQualifier ?? openRouterLeadQualifier);
    const leadQualifier =
      perplexityLeadQualifier && geminiThenOpenRouterQualifier
        ? new FallbackLeadQualifier(perplexityLeadQualifier, geminiThenOpenRouterQualifier)
        : (perplexityLeadQualifier ?? geminiThenOpenRouterQualifier ?? new MockLeadQualifier());

    const geminiReplyDrafter = env.GEMINI_API_KEY ? new GeminiReplyDrafter() : null;
    const openRouterReplyDrafter = env.OPENROUTER_API_KEY ? new OpenRouterReplyDrafter() : null;
    const replyDrafter =
      geminiReplyDrafter && openRouterReplyDrafter
        ? new FallbackReplyDrafter(geminiReplyDrafter, openRouterReplyDrafter)
        : (geminiReplyDrafter ?? openRouterReplyDrafter ?? new MockReplyDrafter());

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
      blueprintResearcher,
      blueprintGenerator,
      webResearcher,
      leadDiscovery,
      emailFinder,
      leadQualifier,
      outreachCopywriter,
      replyDrafter,
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
      queue.register(RUN_AUTOMATED_CAMPAIGN_JOB, () =>
        runAutomatedCampaigns(services as Services),
      );
      queue.register(RUN_AUTOMATED_CAMPAIGN_NOW_JOB, (payload) =>
        runAutomatedCampaignNow((payload as { campaignId: string }).campaignId, services as Services),
      );
      queue.register(POLL_AUTOMATED_REPLIES_JOB, () =>
        pollAutomatedReplies(services as Services),
      );
      queue.register(SEND_AUTOMATED_EMAIL_JOB, (payload) => {
        const data = payload as SendAutomatedEmailPayload & { targetSendAt: string };
        return sendAutomatedEmail(
          { tenantId: data.tenantId, sendId: data.sendId },
          services as Services,
        );
      });
    }
  }

  return services;
}

/** Test-only: reset the singleton so each suite gets a clean container. */
export function resetServices(): void {
  services = null;
}
