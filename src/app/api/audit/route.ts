import { withAuth } from "@/server/http/with-api";
import { db } from "@/server/db/client";
import { auditLogs, users } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";

export const GET = withAuth(
  async ({ ctx }) => {
    const logs = await db()
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
      .leftJoin(users, eq(auditLogs.actorUserId, users.authUserId))
      .where(eq(auditLogs.tenantId, ctx.tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100); // safety boundary

    return { data: { logs } };
  },
  { role: "viewer" }
);
