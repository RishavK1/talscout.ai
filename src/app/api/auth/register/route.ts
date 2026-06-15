import { withPublic } from "@/server/http/with-api";
import { registerSchema, type RegisterInput } from "@/server/validation/auth";
import { registerUser } from "@/server/services/auth.service";

/**
 * POST /api/auth/register — create a confirmed Supabase user (server-side).
 * The client then signs in. Rate-limited per IP.
 */
export const POST = withPublic<RegisterInput>(
  async ({ body }) => {
    await registerUser(body);
    return { status: 201, data: { ok: true } };
  },
  {
    bodySchema: registerSchema,
    rateLimit: { limit: 20, windowSeconds: 60, keyPrefix: "register" },
  },
);
