import { withPlatformAdmin } from "@/server/http/with-api";
import { adminRepo } from "@/server/repositories/admin.repo";

/** GET /api/admin/usage — platform-wide product usage: candidates processed
 *  and AI Agent adoption (conversations, messages, active scheduled tasks). */
export const GET = withPlatformAdmin(
  async () => {
    const [totalCandidates, agentAdoption] = await Promise.all([
      adminRepo.totalCandidates(),
      adminRepo.agentAdoption(),
    ]);
    return { data: { totalCandidates, agentAdoption } };
  },
  { rateLimit: { limit: 60, windowSeconds: 60, keyPrefix: "admin_usage" } },
);
