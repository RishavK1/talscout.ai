import { withAuth } from "@/server/http/with-api";
import { auditLogs, users } from "@/server/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { billingService } from "@/server/services/billing.service";

/** GET /api/audit — workspace audit trail. Scale plan only; admin role. */
export const GET = withAuth(
  async ({ ctx }) => {
    await billingService.assertCapability(ctx, "audit_log"); // 402 if not on Scale

    const logs = await ctx.tx
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
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);

    return { data: { logs } };
  },
  { role: "admin" },
);
