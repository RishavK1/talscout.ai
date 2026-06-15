import { userRepo } from "@/server/repositories/user.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { supabaseAdmin } from "@/server/auth/supabase-admin";
import { Conflict, BadRequest } from "@/server/http/errors";

function isUniqueViolation(e: unknown): boolean {
  if (typeof e === "object" && e !== null) {
    if ("code" in e && (e as { code: string }).code === "23505") {
      return true;
    }
    if ("cause" in e) {
      return isUniqueViolation((e as { cause: unknown }).cause);
    }
  }
  return false;
}

/**
 * Create a Supabase auth user server-side (email pre-confirmed) so browser
 * signup works without depending on the project's email-confirmation toggle.
 * The client then signs in to get a session; workspace provisioning happens
 * separately at onboarding via provisionWorkspace().
 */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string; email: string }> {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.name },
  });
  if (error) {
    if (/already|exist|registered/i.test(error.message)) {
      throw new Conflict("An account with that email already exists");
    }
    throw new BadRequest(error.message);
  }
  return { userId: data.user!.id, email: input.email };
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
