import { userRepo } from "@/server/repositories/user.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { supabaseAdmin } from "@/server/auth/supabase-admin";

/**
 * Self-heals the "deleted-and-recreated Supabase Auth identity" failure
 * mode: a user's Supabase Auth account gets deleted (manual reset, testing,
 * etc.) and they sign back up with the SAME email — Supabase mints a
 * brand-new auth.users id, which matches no `users.authUserId`, so the
 * account looks unprovisioned even though its tenant/leads/campaigns are
 * all still there under the old, now-orphaned row. Without this, every such
 * cycle silently creates a duplicate tenant (confirmed happening 5x for one
 * account over several weeks before this fix).
 *
 * Only re-links when the row's PREVIOUS authUserId is verifiably gone from
 * Supabase Auth — confirmed via the admin API, never inferred from absence
 * in our own tables — so a still-live identity is never touched. Picks the
 * most recently created orphaned row if more than one exists for the email.
 * Returns null (never throws) on no match; callers treat that exactly like
 * "genuinely new account."
 */
export async function reclaimOrphanedAccount(newAuthUserId: string, email: string) {
  const candidates = await userRepo.listByEmailAdmin(email);
  for (const candidate of candidates) {
    if (!candidate.authUserId || candidate.authUserId === newAuthUserId) continue;

    const { data, error } = await supabaseAdmin().auth.admin.getUserById(candidate.authUserId);
    if (!error && data?.user) continue; // still a live identity — never touch it

    const relinked = await userRepo.relinkAuthUserIdAdmin(
      candidate.id,
      candidate.authUserId,
      newAuthUserId,
    );
    if (!relinked) continue; // lost a race to a concurrent request — try the next candidate

    const tenant = await tenantRepo.getByIdAdmin(relinked.tenantId);
    if (!tenant) continue; // shouldn't happen (FK cascade), but never return a dangling tenant
    return { user: relinked, tenant };
  }
  return null;
}
