import { userRepo } from "@/server/repositories/user.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505";
}

export interface ProvisionResult {
  tenantId: string;
  userId: string;
  role: string;
  workspaceName?: string;
  created: boolean;
}

/**
 * Provision a workspace for a freshly-signed-up Supabase user. Idempotent and
 * race-safe (AUTH-11): if a user row already exists for this auth id — or a
 * concurrent request created it — we return the existing workspace rather than
 * creating a duplicate.
 */
export async function provisionWorkspace(input: {
  authUserId: string;
  email: string;
  workspaceName: string;
}): Promise<ProvisionResult> {
  const existing = await userRepo.getByAuthUserIdAdmin(input.authUserId);
  if (existing) {
    const tenant = await tenantRepo.getByIdAdmin(existing.tenantId);
    return {
      tenantId: existing.tenantId,
      userId: existing.id,
      role: existing.role,
      workspaceName: tenant?.name,
      created: false,
    };
  }

  try {
    const { tenant, user } = await tenantRepo.createTenantWithAdmin(input);
    return {
      tenantId: tenant.id,
      userId: user.id,
      role: user.role,
      workspaceName: tenant.name,
      created: true,
    };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const u = await userRepo.getByAuthUserIdAdmin(input.authUserId);
      if (u) {
        const tenant = await tenantRepo.getByIdAdmin(u.tenantId);
        return {
          tenantId: u.tenantId,
          userId: u.id,
          role: u.role,
          workspaceName: tenant?.name,
          created: false,
        };
      }
    }
    throw e;
  }
}
