/**
 * Single source of truth for plans — used by the pricing UI, onboarding, and
 * the backend (quota enforcement). Core features (AI parsing + semantic search)
 * are on EVERY paid plan; tiers differ by quotas, seats and extras.
 */
export type PlanId = "starter" | "growth" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number; // USD / seat / month
  tagline: string;
  /** Résumé uploads allowed per workspace per month. */
  uploadsPerMonth: number;
  recommended?: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 99,
    tagline: "For small teams getting started",
    uploadsPerMonth: 200,
    features: [
      "AI résumé parsing",
      "Semantic candidate search",
      "Candidate database & shortlists",
      "200 résumés / month",
      "Email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPrice: 199,
    tagline: "For scaling agencies",
    recommended: true,
    uploadsPerMonth: 1500,
    features: [
      "Everything in Starter",
      "1,500 résumés / month",
      "Bulk upload & advanced filters",
      "ATS export (Bullhorn, Greenhouse, Lever)",
      "Priority support",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthlyPrice: 399,
    tagline: "For high-volume teams",
    uploadsPerMonth: 100000,
    features: [
      "Everything in Growth",
      "Unlimited résumés",
      "API access",
      "SSO & audit log",
      "Dedicated support",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["starter", "growth", "scale"];

export function getPlan(plan: string): Plan {
  return (PLANS as Record<string, Plan>)[plan] ?? PLANS.starter;
}

export function uploadsPerMonth(plan: string): number {
  return getPlan(plan).uploadsPerMonth;
}
