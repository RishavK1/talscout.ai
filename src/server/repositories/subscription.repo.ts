import { eq } from "drizzle-orm";
import { adminDb } from "@/server/db/client";
import { subscriptions } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

type SubStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export const subscriptionRepo = {
  /** Tenant-scoped read (RLS) for entitlement checks in the request path. */
  async getByTenant(ctx: TenantContext) {
    const [row] = await ctx.tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, ctx.tenantId))
      .limit(1);
    return row ?? null;
  },

  /** Webhook path (no session): privileged upsert keyed by the verified
   *  event's tenantId. */
  async upsertByTenantAdmin(
    tenantId: string,
    patch: {
      status?: SubStatus;
      seats?: number;
      stripeCustomerId?: string;
      stripeSubId?: string;
      renewsAt?: Date | null;
    },
  ) {
    await adminDb()
      .insert(subscriptions)
      .values({
        tenantId,
        status: patch.status ?? "active",
        seats: patch.seats ?? 1,
        stripeCustomerId: patch.stripeCustomerId,
        stripeSubId: patch.stripeSubId,
        renewsAt: patch.renewsAt ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.seats != null ? { seats: patch.seats } : {}),
          ...(patch.stripeCustomerId
            ? { stripeCustomerId: patch.stripeCustomerId }
            : {}),
          ...(patch.stripeSubId ? { stripeSubId: patch.stripeSubId } : {}),
          ...(patch.renewsAt !== undefined ? { renewsAt: patch.renewsAt } : {}),
          updatedAt: new Date(),
        },
      });
  },

  async getByTenantAdmin(tenantId: string) {
    const [row] = await adminDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);
    return row ?? null;
  },
};
