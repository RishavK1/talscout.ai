import { z } from "zod";

/** Server-side price book (minor units). The client never sends amounts
 *  (PAY-10) — only the plan + seat count. */
export const PLAN_PRICES: Record<string, number> = {
  starter: 9900,
  growth: 19900,
  scale: 39900,
};

export const checkoutSchema = z.object({
  plan: z.enum(["starter", "growth", "scale"]),
  seats: z.number().int().min(1).max(1000),
});
export type CheckoutBody = z.infer<typeof checkoutSchema>;
