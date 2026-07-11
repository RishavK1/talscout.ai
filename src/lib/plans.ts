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
  | "sso" // SSO / SAML
  | "outreach_bulk_fire" // bulk-fire outreach campaigns at all
  | "outreach_scheduler"; // scheduling a fire for a future time

export const CAPABILITY_LABEL: Record<Capability, string> = {
  advanced_filters: "Advanced search filters",
  bulk_upload: "Bulk résumé upload",
  ats_export: "ATS export",
  audit_log: "Audit log",
  api_access: "API access",
  sso: "SSO / SAML",
  outreach_bulk_fire: "Bulk-fire outreach",
  outreach_scheduler: "Scheduled outreach sends",
};

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number; // USD / seat / month
  tagline: string;
  /** Résumé uploads allowed per workspace per month. */
  uploadsPerMonth: number;
  /** Outreach emails a workspace can send per day. 0 = outreach unavailable
   *  (mirrors capabilities.outreach_bulk_fire being absent); Infinity = no
   *  cap. */
  outreachDailySendCap: number;
  /** Sender (mailbox) accounts a workspace can connect for outreach. */
  outreachMaxSenderAccounts: number;
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
    outreachDailySendCap: 0,
    outreachMaxSenderAccounts: 0,
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
    outreachDailySendCap: 100,
    outreachMaxSenderAccounts: 1,
    capabilities: [
      "advanced_filters",
      "bulk_upload",
      "ats_export",
      "outreach_bulk_fire",
    ],
    features: [
      "Everything in Starter",
      "1,500 résumés / month",
      "Bulk upload & advanced filters",
      "ATS export (Bullhorn, Greenhouse, Lever)",
      "Bulk-fire outreach (100 emails/day, 1 sender)",
      "Priority support",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthlyPrice: 399,
    tagline: "For high-volume teams",
    uploadsPerMonth: 100000,
    outreachDailySendCap: Infinity,
    outreachMaxSenderAccounts: 5,
    capabilities: [
      "advanced_filters",
      "bulk_upload",
      "ats_export",
      "audit_log",
      "api_access",
      "sso",
      "outreach_bulk_fire",
      "outreach_scheduler",
    ],
    features: [
      "Everything in Growth",
      "Unlimited résumés",
      "API access",
      "SSO & audit log",
      "Unlimited outreach sends, 5 senders, scheduling",
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

export function outreachLimits(plan: string): {
  dailySendCap: number;
  maxSenderAccounts: number;
} {
  const p = getPlan(plan);
  return {
    dailySendCap: p.outreachDailySendCap,
    maxSenderAccounts: p.outreachMaxSenderAccounts,
  };
}
