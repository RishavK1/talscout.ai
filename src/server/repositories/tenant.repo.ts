import { eq } from "drizzle-orm";
import { adminDb } from "@/server/db/client";
import { tenants, users, subscriptions } from "@/server/db/schema";

/**
 * Tenant bootstrap (signup) is a privileged operation: the very first row of a
 * tenant can't satisfy RLS yet (no session tenant exists), so it runs on the
 * admin connection in a single transaction.
 */
export const tenantRepo = {
  async getByIdAdmin(id: string) {
    const [row] = await adminDb()
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return row ?? null;
  },

  /** Webhook path: keep tenant plan/seatLimit in sync with the subscription. */
  async updateAdmin(
    id: string,
    patch: { plan?: string; seatLimit?: number; logo?: string | null },
  ) {
    await adminDb()
      .update(tenants)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tenants.id, id));
  },

  async createTenantWithAdmin(input: {
    workspaceName: string;
    authUserId: string;
    email: string;
  }) {
    return adminDb().transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: input.workspaceName })
        .returning();
      const [user] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          authUserId: input.authUserId,
          email: input.email,
          role: "admin",
        })
        .returning();
      await tx.insert(subscriptions).values({
        tenantId: tenant.id,
        status: "incomplete",
        seats: tenant.seatLimit,
      });
      return { tenant, user };
    });
  },
};
