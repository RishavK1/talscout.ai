import { seedTenant, seedUser, seedSubscription } from "./seed";
import { mintToken } from "./jwt";
import type { Role } from "../../src/server/auth/rbac";

/** Create a tenant (or reuse one) + a user of the given role + a valid token. */
export async function makeUser(
  role: Role,
  opts: { tenant?: { id: string }; tenantName?: string; withSubscription?: boolean } = {},
) {
  const tenant = opts.tenant ?? (await seedTenant(opts.tenantName ?? "Workspace"));
  if (opts.withSubscription !== false && !opts.tenant) {
    await seedSubscription(tenant.id, { status: "active", seats: 100 });
  }
  const authUserId = crypto.randomUUID();
  const user = await seedUser(tenant.id, {
    role,
    authUserId,
    email: `${role}-${authUserId.slice(0, 8)}@example.com`,
  });
  const token = await mintToken(authUserId, { email: user.email });
  return { tenant, user, token };
}
