import { userRepo } from "@/server/repositories/user.repo";
import { withConnectRetry } from "@/server/db/client";

type Identity = Awaited<ReturnType<typeof userRepo.getSessionIdentityAdmin>>;

// In-flight lookups keyed by the verified token `sub` (authUserId). We store
// ONLY promises that are still pending — the entry is deleted the moment the
// lookup settles. This coalesces the concurrent burst a single page load fires
// (e.g. the dashboard's ~6 simultaneous authenticated requests) into ONE
// admin-pool query instead of N that queue behind the 2-connection cap, WITHOUT
// ever returning a stale result: once a lookup resolves it is dropped, so the
// next request reads DB truth again. This keeps role/status/tenant revocation
// immediate (RBAC-04/05, AUTH-06) while still removing the burst contention.
const inFlight = new Map<string, Promise<Identity>>();

/**
 * Deduped wrapper over `getSessionIdentityAdmin`. Concurrent callers for the
 * same authUserId share one query; sequential callers each get a fresh read.
 */
export async function getCachedSessionIdentity(
  authUserId: string,
): Promise<Identity> {
  const pending = inFlight.get(authUserId);
  if (pending) return pending;

  const promise = withConnectRetry(() =>
    userRepo.getSessionIdentityAdmin(authUserId),
  );
  inFlight.set(authUserId, promise);
  try {
    return await promise;
  } finally {
    // Drop as soon as it settles (success OR failure) — no result is ever
    // reused across the request that shared it.
    inFlight.delete(authUserId);
  }
}
