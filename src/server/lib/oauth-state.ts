import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/config/env";

/**
 * Signs/verifies the `state` param for the Gmail "Connect" OAuth flow.
 * Google's redirect back to our callback is a plain browser navigation with
 * no Authorization header, so the callback can't use `withAuth` — this is
 * how it recovers *which* tenant/user started the flow without a session,
 * while still rejecting a forged or stale `state`. Signed with
 * SUPABASE_JWT_SECRET (already always required) rather than introducing a
 * new required key just for this.
 */
export interface OAuthStatePayload {
  tenantId: string;
  userId: string;
}

const MAX_AGE_MS = 10 * 60_000; // 10 minutes — long enough for the consent screen

function key(): Buffer {
  return Buffer.from(getEnv().SUPABASE_JWT_SECRET);
}

export function signOAuthState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Returns the payload if the signature is valid and it isn't stale, else null. */
export function verifyOAuthState(state: string): OAuthStatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload & {
      ts: number;
    };
    if (Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return { tenantId: parsed.tenantId, userId: parsed.userId };
  } catch {
    return null;
  }
}
