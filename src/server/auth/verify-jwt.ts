import { jwtVerify, errors as joseErrors } from "jose";
import { getEnv } from "@/server/config/env";
import { Unauthorized } from "@/server/http/errors";

export interface VerifiedToken {
  authUserId: string;
  email?: string;
}

let secretKey: Uint8Array | null = null;
function key(): Uint8Array {
  if (!secretKey) {
    secretKey = new TextEncoder().encode(getEnv().SUPABASE_JWT_SECRET);
  }
  return secretKey;
}

/** Pull the bearer token from the Authorization header, or null. */
export function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/**
 * Verify a Supabase-issued JWT. We PIN the algorithm to HS256 so `alg:none`
 * and algorithm-confusion attacks are rejected (AUTH-07). Signature/expiry are
 * always verified — we never decode-without-verify.
 */
export async function verifyJwt(token: string): Promise<VerifiedToken> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.sub !== "string") {
      throw new Unauthorized("Invalid token subject");
    }
    const email =
      typeof payload.email === "string" ? payload.email : undefined;
    return { authUserId: payload.sub, email };
  } catch (err) {
    if (err instanceof Unauthorized) throw err;
    // Normalize every jose failure (expired, bad signature, malformed, alg)
    // into a single generic 401 — no detail leaked (AUTH-01..04, 07).
    if (
      err instanceof joseErrors.JOSEError ||
      err instanceof Error
    ) {
      throw new Unauthorized("Invalid or expired token");
    }
    throw new Unauthorized();
  }
}
