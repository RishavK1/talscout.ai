import { withAuth } from "@/server/http/with-api";

/**
 * GET /api/auth/session — returns the current user/tenant/role (DB truth).
 */
export const GET = withAuth(async ({ session }) => ({
  data: {
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    email: session.email,
  },
}));
