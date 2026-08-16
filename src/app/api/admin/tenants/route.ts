import { withPlatformAdmin } from "@/server/http/with-api";
import { adminRepo } from "@/server/repositories/admin.repo";
import { adminService } from "@/server/services/admin.service";
import { listTenantsQuerySchema, type ListTenantsQuery } from "@/server/validation/admin";

const PAGE_SIZE = 20;

/** GET /api/admin/tenants — signup list + daily trend, newest first,
 *  optional status/search. The trend always covers the full unfiltered
 *  last-30-days signal, independent of the status/q filters applied to the
 *  list below it. */
export const GET = withPlatformAdmin<undefined, ListTenantsQuery>(
  async ({ query }) => {
    const page = query?.page ?? 1;
    const [{ rows, total }, dailySeries] = await Promise.all([
      adminRepo.recentTenants({
        status: query?.status,
        q: query?.q,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      adminService.signupsSeries(30),
    ]);
    return { data: { tenants: rows, total, page, pageSize: PAGE_SIZE, dailySeries } };
  },
  {
    querySchema: listTenantsQuerySchema,
    rateLimit: { limit: 60, windowSeconds: 60, keyPrefix: "admin_tenants" },
  },
);
