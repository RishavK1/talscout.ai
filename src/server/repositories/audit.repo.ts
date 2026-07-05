import { auditLogs } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: unknown;
}

/**
 * Append-only audit log (DATA-07). Written inside the same tenant transaction
 * as the action it records, so it commits/rolls back atomically with it.
 */
export const auditRepo = {
  async log(ctx: TenantContext, entry: AuditEntry) {
    // Fold the real client IP (from the verified request context) into the
    // metadata so the audit trail shows actual origin, not a fabricated value.
    const base =
      typeof entry.metadata === "object" && entry.metadata !== null
        ? (entry.metadata as Record<string, unknown>)
        : {};
    const metadata = ctx.ip ? { ...base, ip: ctx.ip } : entry.metadata ?? null;

    await ctx.tx.insert(auditLogs).values({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata,
    });
  },
};
