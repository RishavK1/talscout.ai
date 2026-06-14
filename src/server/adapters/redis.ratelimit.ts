import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { RateLimiter, RateLimitResult } from "@/server/ports";
import { getEnv } from "@/server/config/env";

/** Production-grade sliding-window rate limiter powered by Upstash Redis (RL-04). */
export class RedisRateLimiter implements RateLimiter {
  private redis: Redis;

  constructor() {
    const env = getEnv();
    const url = env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is required for RedisRateLimiter");
    }
    this.redis = new Redis({
      url,
      token: env.REDIS_TOKEN ?? "",
    });
  }

  async limit(key: string, limitCount: number, windowSeconds: number): Promise<RateLimitResult> {
    const limiter = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(limitCount, `${windowSeconds} s`),
      analytics: true,
      prefix: "@talscout/ratelimit",
    });

    const result = await limiter.limit(key);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  }
}
