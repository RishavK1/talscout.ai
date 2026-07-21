import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { domainFromWebsite } from "@/server/lib/safe-fetch";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Snov.io free tier (50 credits/month, no card) domain-search email finder —
 * constructed only when BOTH SNOV_CLIENT_ID and SNOV_CLIENT_SECRET are
 * configured. Another rung in the waterfall alongside Hunter/Apollo: same
 * "harvest any public email on this domain" shape as Hunter, not a
 * named-person lookup.
 *
 * Snov uses OAuth2 client-credentials (not a single static API key) — the
 * access token is short-lived, so it's fetched lazily and cached in memory
 * for the life of this instance, refreshed a minute before expiry.
 */
const SNOV_TOKEN_ENDPOINT = "https://api.snov.io/v1/oauth/access_token";
const SNOV_DOMAIN_SEARCH_ENDPOINT = "https://api.snov.io/v2/domain-emails-with-info";

interface SnovTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface SnovEmailEntry {
  email?: string;
  status?: string; // e.g. "valid" | "not_valid" | "unknown"
}

export class SnovEmailFinder implements EmailFinder {
  private clientId: string;
  private clientSecret: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor() {
    const env = getEnv();
    if (!env.SNOV_CLIENT_ID || !env.SNOV_CLIENT_SECRET) {
      throw new Error("SNOV_CLIENT_ID and SNOV_CLIENT_SECRET are required for SnovEmailFinder");
    }
    this.clientId = env.SNOV_CLIENT_ID;
    this.clientSecret = env.SNOV_CLIENT_SECRET;
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(SNOV_TOKEN_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "snov_token_non_ok");
        return null;
      }
      const data = (await res.json()) as SnovTokenResponse;
      if (!data.access_token) return null;
      // Refresh a minute early so a call never races an expiring token.
      const ttlMs = Math.max((data.expires_in ?? 3600) - 60, 60) * 1000;
      this.cachedToken = { value: data.access_token, expiresAt: Date.now() + ttlMs };
      return data.access_token;
    } catch (err) {
      logger.warn({ err }, "snov_token_failed");
      return null;
    }
  }

  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    const domain = domainFromWebsite(args.website);
    if (!domain) return null;
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const params = new URLSearchParams({
        access_token: token,
        domain,
        type: "all",
        limit: "10",
      });
      const res = await fetch(`${SNOV_DOMAIN_SEARCH_ENDPOINT}?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "snov_find_non_ok");
        return null;
      }
      const data = (await res.json()) as { emails?: SnovEmailEntry[] };
      const emails = data.emails ?? [];
      const best = emails.find((e) => e.email && e.status === "valid") ?? emails.find((e) => e.email);
      if (!best?.email) return null;
      return { email: best.email, source: "snov" };
    } catch (err) {
      logger.warn({ err }, "snov_find_failed");
      return null;
    }
  }
}
