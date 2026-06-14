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
    await ctx.tx.insert(auditLogs).values({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
    });
  },
};
