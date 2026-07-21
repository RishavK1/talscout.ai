import { verifyJwt, extractBearer } from "./verify-jwt";
import { getCachedSessionIdentity } from "./session-cache";
import { reclaimOrphanedAccount } from "./reclaim-orphaned-account";
import { Unauthorized, Forbidden } from "@/server/http/errors";
import type { Role } from "./rbac";

export interface Session {
  authUserId: string;
  email?: string;
  userId: string;
  tenantId: string;
  role: Role;
}

/** Just the verified token identity (no provisioned account required). */
export async function authenticate(
  req: Request,
): Promise<{ authUserId: string; email?: string }> {
  const token = extractBearer(req);
  if (!token) throw new Unauthorized("Missing bearer token");
  return verifyJwt(token);
}

/**
 * Full session resolution. Verifies the JWT, then loads the provisioned user +
 * tenant from the DB — tenant and role are DB truth, never read from the token
 * (AUTH-08). Fails closed on every ambiguity.
 */
export async function resolveSession(req: Request): Promise<Session> {
  const { authUserId, email } = await authenticate(req);

  let identity = await getCachedSessionIdentity(authUserId);
  if (!identity && email) {
    // Self-heal: this email may already have an account whose Supabase Auth
    // identity was deleted and recreated (see reclaim-orphaned-account.ts) —
    // recover it instead of treating a returning user as brand new. Runs
    // only on the failure path, so the normal (found-on-first-try) case
    // pays zero extra cost.
    const reclaimed = await reclaimOrphanedAccount(authUserId, email);
    if (reclaimed) identity = reclaimed;
  }
  if (!identity) throw new Unauthorized("No account provisioned"); // AUTH-05
  const { user, tenant } = identity;
  if (user.status !== "active") throw new Forbidden("Account is disabled"); // RBAC-04
  if (tenant.status !== "active") throw new Forbidden("Workspace is suspended"); // AUTH-06

  return {
    authUserId,
    email: email ?? user.email,
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as Role,
  };
}
