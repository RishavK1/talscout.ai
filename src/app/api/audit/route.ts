import { withAuth } from "@/server/http/with-api";
import { auditLogs, users } from "@/server/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { billingService } from "@/server/services/billing.service";
import { listAuditLogsQuerySchema, type ListAuditLogsQuery } from "@/server/validation/audit";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function clampOffset(offset?: number): number {
  if (offset == null || Number.isNaN(offset) || offset < 0) return 0;
  return Math.trunc(offset);
}

/** GET /api/audit — workspace audit trail (paginated). Scale plan only; admin role. */
export const GET = withAuth<undefined, ListAuditLogsQuery>(
  async ({ ctx, query }) => {
    await billingService.assertCapability(ctx, "audit_log"); // 402 if not on Scale

    const limit = clampLimit(query?.limit);
    const offset = clampOffset(query?.offset);

    const [logs, [{ n: total } = { n: 0 }]] = await Promise.all([
      ctx.tx
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
          actorEmail: users.email,
          actorRole: users.role,
        })
        .from(auditLogs)
        .leftJoin(
          users,
          and(eq(auditLogs.actorUserId, users.id), eq(users.tenantId, ctx.tenantId)),
        )
        .where(eq(auditLogs.tenantId, ctx.tenantId))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit)
        .offset(offset),
      ctx.tx
        .select({ n: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, ctx.tenantId)),
    ]);

    return { data: { logs, total, limit, offset } };
  },
  { role: "admin", querySchema: listAuditLogsQuerySchema },
);
