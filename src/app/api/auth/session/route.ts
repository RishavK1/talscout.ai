import { withAuth } from "@/server/http/with-api";
import { tenantRepo } from "@/server/repositories/tenant.repo";

/**
 * GET /api/auth/session — returns the current user/tenant/role (DB truth).
 */
export const GET = withAuth(async ({ session }) => {
  const tenant = await tenantRepo.getByIdAdmin(session.tenantId);
  return {
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      email: session.email,
      workspaceName: tenant?.name || "Workspace",
    },
  };
});

