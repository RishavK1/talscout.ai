import { withPublic } from "@/server/http/with-api";
import { appPool } from "@/server/db/client";

/**
 * GET /api/health — liveness + DB readiness (ERR-06).
 */
export const GET = withPublic(async () => {
  await appPool().query("SELECT 1");
  return { data: { status: "ok", db: "ready" } };
});
