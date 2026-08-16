import { withPlatformAdmin } from "@/server/http/with-api";
import { adminRepo } from "@/server/repositories/admin.repo";
import { uuidOr404 } from "@/server/validation/common";
import { setTenantStatusSchema, type SetTenantStatusBody } from "@/server/validation/admin";
import { NotFound } from "@/server/http/errors";

/** PATCH /api/admin/tenants/:id — the real suspend/reactivate action. */
export const PATCH = withPlatformAdmin<SetTenantStatusBody>(
  async ({ params, body, email }) => {
    const tenantId = uuidOr404(params.id, "Tenant not found");
    const row = await adminRepo.setTenantStatus(tenantId, body.status, email);
    if (!row) throw new NotFound("Tenant not found");
    return { data: row };
  },
  {
    bodySchema: setTenantStatusSchema,
    rateLimit: { limit: 30, windowSeconds: 60, keyPrefix: "admin_tenant_status" },
  },
);
