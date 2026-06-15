import {
  jwtVerify,
  createRemoteJWKSet,
  decodeProtectedHeader,
  errors as joseErrors,
  type JWTPayload,
} from "jose";
import { getEnv } from "@/server/config/env";
import { Unauthorized } from "@/server/http/errors";

export interface VerifiedToken {
  authUserId: string;
  email?: string;
}

let secretKey: Uint8Array | null = null;
function hsKey(): Uint8Array {
  if (!secretKey) {
    secretKey = new TextEncoder().encode(getEnv().SUPABASE_JWT_SECRET);
  }
  return secretKey;
}

// Supabase asymmetric signing keys (ES256/RS256) — public JWKS, cached by jose.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const url = getEnv().SUPABASE_URL ?? "";
    jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
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
 * Verify a Supabase-issued JWT. Supports BOTH signing schemes:
 *  - HS256 (legacy shared JWT secret) — service tokens / older projects / tests.
 *  - ES256/RS256 (new asymmetric "JWT signing keys") — current user tokens,
 *    verified against the project's public JWKS.
 * We pick the verifier from the token's `alg` header (never `alg:none`), and
 * always verify signature + expiry — we never decode-without-verify.
 */
export async function verifyJwt(token: string): Promise<VerifiedToken> {
  try {
    const { alg } = decodeProtectedHeader(token);
    let payload: JWTPayload;

    if (alg === "HS256") {
      ({ payload } = await jwtVerify(token, hsKey(), { algorithms: ["HS256"] }));
    } else if (alg === "ES256" || alg === "RS256") {
      ({ payload } = await jwtVerify(token, getJwks(), {
        algorithms: ["ES256", "RS256"],
      }));
    } else {
      throw new Unauthorized("Unsupported token algorithm"); // rejects alg:none (AUTH-07)
    }

    if (!payload.sub || typeof payload.sub !== "string") {
      throw new Unauthorized("Invalid token subject");
    }
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { authUserId: payload.sub, email };
  } catch (err) {
    if (err instanceof Unauthorized) throw err;
    // Normalize every jose failure (expired, bad signature, malformed) into a
    // single generic 401 — no detail leaked (AUTH-01..04, 07).
    if (err instanceof joseErrors.JOSEError || err instanceof Error) {
      throw new Unauthorized("Invalid or expired token");
    }
    throw new Unauthorized();
  }
}
