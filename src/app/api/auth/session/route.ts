import { withAuth } from "@/server/http/with-api";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { subscriptionRepo } from "@/server/repositories/subscription.repo";
import { userRepo } from "@/server/repositories/user.repo";

/**
 * GET /api/auth/session — returns the current user/tenant/role (DB truth).
 */
export const GET = withAuth(async ({ session }) => {
  const tenant = await tenantRepo.getByIdAdmin(session.tenantId);
  const sub = await subscriptionRepo.getByTenantAdmin(session.tenantId);
  const user = await userRepo.getByAuthUserIdAdmin(session.authUserId);
  return {
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      email: session.email,
      workspaceName: tenant?.name || "Workspace",
      subscriptionStatus: sub?.status || "incomplete",
      plan: tenant?.plan || "starter",
      logo: tenant?.logo || null,
      avatar: user?.avatar || null,
    },
  };
});

