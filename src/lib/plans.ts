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
  | "automated_outreach" // AI automated outreach (discover → qualify → write → send)
  | "blueprint_web_research" // live Perplexity web research when generating a blueprint
  | "outreach_bulk_fire" // bulk-fire outreach campaigns at all
  | "outreach_scheduler" // scheduling a fire for a future time
  | "whatsapp_channel"; // WhatsApp Business as an outreach channel

export const CAPABILITY_LABEL: Record<Capability, string> = {
  advanced_filters: "Advanced search filters",
  bulk_upload: "Bulk résumé upload",
  ats_export: "ATS export",
  audit_log: "Audit log",
  api_access: "API access",
  sso: "SSO / SAML",
  automated_outreach: "AI Automated Outreach",
  blueprint_web_research: "Live web research for blueprints",
  outreach_bulk_fire: "Bulk-fire outreach",
  outreach_scheduler: "Scheduled outreach sends",
  whatsapp_channel: "WhatsApp outreach channel",
};

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number; // USD / seat / month
  tagline: string;
  /** Résumé uploads allowed per workspace per month. */
  uploadsPerMonth: number;
  /** Bulk-fire emails a workspace can send per day. 0 = bulk fire unavailable
   *  (mirrors capabilities.outreach_bulk_fire being absent); Infinity = no
   *  cap. */
  outreachDailySendCap: number;
  /** AI Automated Outreach emails a workspace can send per day. Deliberately
   *  a separate budget from `outreachDailySendCap` — the two features have
   *  independent caps and independent locks server-side (see
   *  AUTOMATED_DAILY_SEND_CAP's replacement in automated-outreach.service.ts).
   *  Never Infinity: uncapped cold email wrecks the customer's own domain
   *  reputation and is unbounded cost per lead (discovery + email-finder
   *  credit + AI qualification + AI copy). */
  automatedDailySendCap: number;
  /** Blueprints a workspace may keep (live, non-deleted). */
  maxBlueprints: number;
  /** Automated campaigns that may be active (running) at once. Draft/paused
   *  campaigns don't count — this bounds concurrent pipeline cost, not how
   *  many campaigns a workspace can author. */
  maxActiveAutomatedCampaigns: number;
  /** Sender (mailbox) accounts a workspace can connect for outreach. Shared
   *  across Bulk Fire and Automated Outreach — they draw on the same
   *  `sender_accounts` table. */
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
    tagline: "Both engines, at a starting scale",
    uploadsPerMonth: 200,
    outreachDailySendCap: 0,
    automatedDailySendCap: 25,
    maxBlueprints: 1,
    maxActiveAutomatedCampaigns: 1,
    outreachMaxSenderAccounts: 1,
    capabilities: ["automated_outreach"],
    features: [
      "AI résumé parsing & semantic search",
      "200 résumés / month",
      "AI Automated Outreach (25 emails/day, 1 sender)",
      "1 blueprint & 1 active campaign",
      "AI reply drafting with approval",
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
    automatedDailySendCap: 150,
    maxBlueprints: 5,
    maxActiveAutomatedCampaigns: 5,
    outreachMaxSenderAccounts: 3,
    capabilities: [
      "advanced_filters",
      "bulk_upload",
      "ats_export",
      "automated_outreach",
      "blueprint_web_research",
      "outreach_bulk_fire",
    ],
    features: [
      "Everything in Starter",
      "1,500 résumés / month",
      "Automated Outreach (150 emails/day, 3 senders)",
      "5 blueprints with live web research",
      "Bulk Fire (100 emails/day) & ATS export",
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
    automatedDailySendCap: 500,
    maxBlueprints: Infinity,
    maxActiveAutomatedCampaigns: Infinity,
    outreachMaxSenderAccounts: 10,
    capabilities: [
      "advanced_filters",
      "bulk_upload",
      "ats_export",
      "audit_log",
      "api_access",
      "sso",
      "automated_outreach",
      "blueprint_web_research",
      "outreach_bulk_fire",
      "outreach_scheduler",
      "whatsapp_channel",
    ],
    features: [
      "Everything in Growth",
      "Unlimited résumés & blueprints",
      "Automated Outreach (500 emails/day, 10 senders)",
      "Unlimited Bulk Fire sends & scheduling",
      "WhatsApp Business outreach channel",
      "API access, SSO & audit log",
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

/** Automated-outreach quotas — deliberately separate from `outreachLimits`
 *  above, which covers Bulk Fire. The two features have independent daily
 *  budgets and independent locks server-side. */
export function automatedOutreachLimits(plan: string): {
  dailySendCap: number;
  maxBlueprints: number;
  maxActiveCampaigns: number;
  maxSenderAccounts: number;
} {
  const p = getPlan(plan);
  return {
    dailySendCap: p.automatedDailySendCap,
    maxBlueprints: p.maxBlueprints,
    maxActiveCampaigns: p.maxActiveAutomatedCampaigns,
    maxSenderAccounts: p.outreachMaxSenderAccounts,
  };
}
