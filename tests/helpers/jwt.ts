import { SignJWT } from "jose";

// Must match vitest.config.ts test.env.SUPABASE_JWT_SECRET
const SECRET = new TextEncoder().encode(
  "test-jwt-secret-0123456789abcdef0123456789",
);
const WRONG_SECRET = new TextEncoder().encode("a-totally-different-secret-value");

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export async function mintToken(
  sub: string,
  opts: { email?: string; ttl?: number } = {},
): Promise<string> {
  const iat = nowSec();
  return new SignJWT({ email: opts.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + (opts.ttl ?? 3600))
    .sign(SECRET);
}

export async function mintExpired(sub: string, email?: string): Promise<string> {
  const past = nowSec() - 7200;
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt(past)
    .setExpirationTime(past + 60) // expired ~2h ago
    .sign(SECRET);
}

export async function mintWrongSecret(
  sub: string,
  email?: string,
): Promise<string> {
  const iat = nowSec();
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(WRONG_SECRET);
}

/** Hand-craft an unsigned `alg:none` token (algorithm-confusion attack). */
export function makeAlgNone(sub: string, email?: string): string {
  const b64u = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64u({ alg: "none", typ: "JWT" });
  const payload = b64u({ sub, email, exp: nowSec() + 3600 });
  return `${header}.${payload}.`;
}
