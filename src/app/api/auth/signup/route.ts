import { withPublic } from "@/server/http/with-api";
import { signupSchema, type SignupInput } from "@/server/validation/auth";
import { provisionWorkspace } from "@/server/services/auth.service";
import { BadRequest } from "@/server/http/errors";

/**
 * POST /api/auth/signup
 * Requires a valid Supabase JWT (the user authenticated client-side first),
 * then provisions the tenant + admin user. Idempotent.
 */
export const POST = withPublic<SignupInput>(
  async ({ auth, body }) => {
    if (!auth) throw new BadRequest("Missing token");
    if (!auth.email) throw new BadRequest("Token has no email claim");

    const result = await provisionWorkspace({
      authUserId: auth.authUserId,
      email: auth.email,
      workspaceName: body.workspaceName,
    });

    return {
      status: result.created ? 201 : 200,
      data: {
        tenantId: result.tenantId,
        role: result.role,
        workspaceName: result.workspaceName,
      },
    };
  },
  { verifyToken: true, bodySchema: signupSchema },
);
