import { getEnv } from "@/server/config/env";
import type { Services } from "@/server/ports";
import { MockStorage } from "@/server/adapters/mock.storage";
import { MockExtractor } from "@/server/adapters/mock.extractor";
import { MockEmbedder } from "@/server/adapters/mock.embedder";
import { MockReranker } from "@/server/adapters/mock.reranker";
import { GeminiReranker } from "@/server/adapters/gemini.reranker";
import { MockPaymentProvider } from "@/server/adapters/mock.payment";
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
    };
    queue.register(PARSE_RESUME_JOB, (payload) =>
      parseResume(payload as ParseResumePayload, services as Services),
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
    };

    if (queue instanceof InProcessQueue) {
      queue.register(PARSE_RESUME_JOB, (payload) =>
        parseResume(payload as ParseResumePayload, services as Services),
      );
    }
  }

  return services;
}

/** Test-only: reset the singleton so each suite gets a clean container. */
export function resetServices(): void {
  services = null;
}
