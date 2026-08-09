import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/config/env";

/**
 * Signs/verifies the `state` param for the Composio "Connect an app" flow.
 * Composio lands the browser back on our callback route as a plain
 * navigation (no Authorization header, no guarantee our session cookie
 * survives the cross-domain OAuth hop), so — same reasoning as
 * `oauth-state.ts` for the existing direct-Gmail flow — the callback can't
 * use `withAuth` and instead recovers identity from this signed token
 * rather than trusting anything Composio itself appends to the redirect.
 * Kept separate from `oauth-state.ts` (not generalized into it) because
 * that file's `OAuthStatePayload` is a fixed shape already depended on
 * elsewhere; this one additionally carries which toolkit was being
 * connected, needed to reconcile the right pending row on return.
 */
export interface ConnectStatePayload {
  tenantId: string;
  userId: string;
  toolkitSlug: string;
  /** Where the callback route sends the browser back to once the OAuth
   *  hop completes — "settings" (the default, unchanged behavior for
   *  Settings' own connect flow) or "chat" for the agent's connect_app
   *  tool. Without this, a connection started mid-conversation always
   *  landed the user on Settings with no way back to the chat they were
   *  just in — confusing on its own, and worse once Settings' curated
   *  card doesn't even recognize a non-curated toolkit (see connect_app's
   *  own doc comment on the "calendar" vs "googlecalendar" bug this was
   *  found alongside). */
  returnTo?: "settings" | "chat";
  /** Which chat to land back on when returnTo is "chat" — without this the
   *  redirect target is just the bare /agent page (no conversation
   *  selected), losing the user's place in the exact conversation they
   *  asked to connect something from. */
  conversationId?: string;
}

const MAX_AGE_MS = 10 * 60_000;

function key(): Buffer {
  return Buffer.from(getEnv().SUPABASE_JWT_SECRET);
}

export function signConnectState(payload: ConnectStatePayload): string {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyConnectState(state: string): ConnectStatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConnectStatePayload & {
      ts: number;
    };
    if (Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return {
      tenantId: parsed.tenantId,
      userId: parsed.userId,
      toolkitSlug: parsed.toolkitSlug,
      returnTo: parsed.returnTo,
      conversationId: parsed.conversationId,
    };
  } catch {
    return null;
  }
}
