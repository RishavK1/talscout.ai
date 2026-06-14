import type { RateLimiter, RateLimitResult } from "@/server/ports";

/** Simple fixed-window in-memory rate limiter for development and tests (RL-04). */
export class MemoryRateLimiter implements RateLimiter {
  private store = new Map<string, { count: number; expiresAt: number }>();

  async limit(key: string, limitCount: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const entry = this.store.get(key);

    if (!entry || now > entry.expiresAt) {
      const expiresAt = now + windowMs;
      this.store.set(key, { count: 1, expiresAt });
      return {
        success: true,
        limit: limitCount,
        remaining: limitCount - 1,
        reset: expiresAt,
      };
    }

    if (entry.count >= limitCount) {
      return {
        success: false,
        limit: limitCount,
        remaining: 0,
        reset: entry.expiresAt,
      };
    }

    entry.count++;
    return {
      success: true,
      limit: limitCount,
      remaining: limitCount - entry.count,
      reset: entry.expiresAt,
    };
  }
}
