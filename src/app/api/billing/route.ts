import { withAuth } from "@/server/http/with-api";
import { subscriptionRepo } from "@/server/repositories/subscription.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { userRepo } from "@/server/repositories/user.repo";
import { PLAN_PRICES } from "@/server/validation/billing";

/** GET /api/billing — get active subscription, seats limit and usage. */
export const GET = withAuth(async ({ ctx }) => {
  const sub = await subscriptionRepo.getByTenant(ctx);
  const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
  const seatsUsed = await userRepo.countActiveSeats(ctx);

  const plan = tenant?.plan || "starter";
  const pricePerSeat = PLAN_PRICES[plan] || 9900;

  return {
    data: {
      plan,
      pricePerSeat: pricePerSeat / 100, // major currency unit
      status: sub?.status || "trialing",
      seats: sub?.seats || tenant?.seatLimit || 1,
      seatsUsed,
      renewsAt: sub?.renewsAt || null,
    },
  };
});
