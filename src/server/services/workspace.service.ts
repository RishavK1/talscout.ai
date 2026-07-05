import { eq } from "drizzle-orm";
import { tenants, resumeFiles } from "@/server/db/schema";
import { getServices } from "@/server/container";
import { logger } from "@/server/observability/logger";
import type { TenantContext } from "@/server/db/tx";

export const workspaceService = {
  /**
   * Permanently delete the tenant and everything under it. Every tenant-scoped
   * table (users, candidates, resume_files, shortlists, subscriptions,
   * usage_counters, audit_logs) references tenants with ON DELETE CASCADE, so
   * deleting the tenants row is enough at the DB level — and RLS restricts the
   * delete to the caller's OWN tenant (`tenant_isolation` policy), so this can
   * never touch another workspace even if the id were ever wrong.
   *
   * Storage objects live outside Postgres, so we read their keys before the
   * cascade wipes resume_files, then purge them best-effort.
   *
   * audit_logs is itself tenant-scoped and about to be cascaded away, so this
   * one irreversible action is recorded in the structured server log instead
   * of the (doomed) DB audit trail.
   */
  async deleteWorkspace(ctx: TenantContext) {
    const files = await ctx.tx
      .select({ fileKey: resumeFiles.fileKey })
      .from(resumeFiles)
      .where(eq(resumeFiles.tenantId, ctx.tenantId));

    await ctx.tx.delete(tenants).where(eq(tenants.id, ctx.tenantId));

    for (const f of files) {
      try {
        await getServices().storage.deleteObject(f.fileKey);
      } catch (err) {
        logger.error(
          { err, fileKey: f.fileKey, tenantId: ctx.tenantId },
          "workspace_delete_storage_cleanup_failed",
        );
      }
    }

    logger.warn(
      { tenantId: ctx.tenantId, actorUserId: ctx.userId },
      "workspace_deleted",
    );

    return { deleted: true };
  },
};
