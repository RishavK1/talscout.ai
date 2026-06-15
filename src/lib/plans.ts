/**
 * Single source of truth for plans — used by the pricing UI, onboarding, and
 * the backend (quota enforcement). Core features (AI parsing + semantic search)
 * are on EVERY paid plan; tiers differ by quotas, seats and extras.
 */
export type PlanId = "starter" | "growth" | "scale";

/** Gated, premium capabilities (core parsing + semantic search are NOT here —
 *  they're available on every plan). */
export type Capability =
  | "advanced_filters" // structured filters on semantic search
  | "bulk_upload" // upload many résumés at once
  | "ats_export" // export to Bullhorn/Greenhouse/Lever
  | "audit_log" // workspace audit trail
  | "api_access" // REST API
  | "sso"; // SSO / SAML

export const CAPABILITY_LABEL: Record<Capability, string> = {
  advanced_filters: "Advanced search filters",
  bulk_upload: "Bulk résumé upload",
  ats_export: "ATS export",
  audit_log: "Audit log",
  api_access: "API access",
  sso: "SSO / SAML",
};

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number; // USD / seat / month
  tagline: string;
  /** Résumé uploads allowed per workspace per month. */
  uploadsPerMonth: number;
  recommended?: boolean;
  features: string[];
  capabilities: Capability[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 99,
    tagline: "For small teams getting started",
    uploadsPerMonth: 200,
    capabilities: [],
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
    capabilities: ["advanced_filters", "bulk_upload", "ats_export"],
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
    capabilities: [
      "advanced_filters",
      "bulk_upload",
      "ats_export",
      "audit_log",
      "api_access",
      "sso",
    ],
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

export function capabilitiesForPlan(plan: string): Capability[] {
  return getPlan(plan).capabilities;
}

export function planHasCapability(plan: string, cap: Capability): boolean {
  return capabilitiesForPlan(plan).includes(cap);
}
