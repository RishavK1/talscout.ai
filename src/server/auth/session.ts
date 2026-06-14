import { verifyJwt, extractBearer } from "./verify-jwt";
import { userRepo } from "@/server/repositories/user.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
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

  const user = await userRepo.getByAuthUserIdAdmin(authUserId);
  if (!user) throw new Unauthorized("No account provisioned"); // AUTH-05
  if (user.status !== "active") throw new Forbidden("Account is disabled"); // RBAC-04

  const tenant = await tenantRepo.getByIdAdmin(user.tenantId);
  if (!tenant) throw new Forbidden("Workspace not found");
  if (tenant.status !== "active") throw new Forbidden("Workspace is suspended"); // AUTH-06

  return {
    authUserId,
    email: email ?? user.email,
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as Role,
  };
}
