"use client";

import { Fragment } from "react";
import Link from "next/link";
import { FaqAccordion } from "@/components/pricing/faq-accordion";
import { PricingPlans } from "@/components/pricing/pricing-plans";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PLANS, PLAN_ORDER, CAPABILITY_LABEL, planHasCapability } from "@/lib/plans";

type PlanIdT = (typeof PLAN_ORDER)[number];
type Row = { label: string; render: (planId: PlanIdT) => string };

const num = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : "Unlimited");
const yesNo = (id: PlanIdT, cap: Parameters<typeof planHasCapability>[1]) =>
  planHasCapability(id, cap) ? "Included" : "—";
/** api_access and sso are on the Scale capability list (so the rest of the
 *  app can gate on them once built), but the backend for both doesn't exist
 *  yet — see settings/page.tsx's DeveloperCard, which already says "In
 *  development" rather than showing a fake console. This mirrors that same
 *  honesty on the page a prospective customer actually decides from, instead
 *  of promising "Included" for something not yet shippable. */
const NOT_YET_SHIPPED = new Set(["api_access", "sso"]);
const yesNoOrComingSoon = (id: PlanIdT, cap: Parameters<typeof planHasCapability>[1]) =>
  NOT_YET_SHIPPED.has(cap) ? (planHasCapability(id, cap) ? "Coming soon" : "—") : yesNo(id, cap);

/** Grouped so the two engines read as equally complete offerings rather than
 *  one long undifferentiated list. */
const COMPARISON_GROUPS: { heading: string; rows: Row[] }[] = [
  {
    heading: "AI Outreach",
    rows: [
      { label: CAPABILITY_LABEL.automated_outreach, render: (id) => yesNo(id, "automated_outreach") },
      { label: "Automated emails / day", render: (id) => num(PLANS[id].automatedDailySendCap) },
      { label: "Blueprints", render: (id) => num(PLANS[id].maxBlueprints) },
      { label: "Active campaigns", render: (id) => num(PLANS[id].maxActiveAutomatedCampaigns) },
      { label: "Lead discovery & email finding", render: () => "Included" },
      { label: "AI qualification & reply drafting", render: () => "Included" },
      {
        label: CAPABILITY_LABEL.blueprint_web_research,
        render: (id) => yesNo(id, "blueprint_web_research"),
      },
      { label: "Sender mailboxes", render: (id) => num(PLANS[id].outreachMaxSenderAccounts) },
    ],
  },
  {
    heading: "AI Agent",
    rows: [
      { label: CAPABILITY_LABEL.ai_agent, render: (id) => yesNo(id, "ai_agent") },
      { label: "Connect Gmail, Calendar, Notion & 1,000+ apps", render: (id) => yesNo(id, "ai_agent") },
      { label: "Saved reusable Skills", render: (id) => yesNo(id, "ai_agent") },
      { label: "Scheduled background tasks", render: (id) => yesNo(id, "ai_agent") },
    ],
  },
  {
    heading: "Bulk Fire",
    rows: [
      { label: CAPABILITY_LABEL.outreach_bulk_fire, render: (id) => yesNo(id, "outreach_bulk_fire") },
      {
        label: "Bulk Fire emails / day",
        render: (id) => {
          const cap = PLANS[id].outreachDailySendCap;
          return cap === 0 ? "—" : num(cap);
        },
      },
      { label: CAPABILITY_LABEL.outreach_scheduler, render: (id) => yesNo(id, "outreach_scheduler") },
      { label: CAPABILITY_LABEL.whatsapp_channel, render: (id) => yesNo(id, "whatsapp_channel") },
    ],
  },
  {
    heading: "Talent",
    rows: [
      {
        label: "Résumés / month",
        render: (id) => {
          const n = PLANS[id].uploadsPerMonth;
          return n >= 100000 ? "Unlimited" : n.toLocaleString();
        },
      },
      { label: "AI parsing & semantic search", render: () => "Included" },
      { label: CAPABILITY_LABEL.bulk_upload, render: (id) => yesNo(id, "bulk_upload") },
      { label: CAPABILITY_LABEL.advanced_filters, render: (id) => yesNo(id, "advanced_filters") },
      { label: CAPABILITY_LABEL.ats_export, render: (id) => yesNo(id, "ats_export") },
    ],
  },
  {
    heading: "Platform",
    rows: [
      { label: CAPABILITY_LABEL.api_access, render: (id) => yesNoOrComingSoon(id, "api_access") },
      { label: CAPABILITY_LABEL.sso, render: (id) => yesNoOrComingSoon(id, "sso") },
      { label: CAPABILITY_LABEL.audit_log, render: (id) => yesNo(id, "audit_log") },
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="font-body-md text-on-surface selection:bg-secondary-container bg-bg-cream">
      <SiteNav />
      <main className="pt-32 pb-12 sm:pb-16 lg:pb-24">
        {/* Hero Section */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 text-center">
          <h1 className="font-display-lg text-3xl sm:text-display-lg text-primary mb-4">Simple per-seat pricing</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Pay per seat. Both engines are on every plan — higher tiers add volume, mailboxes and Bulk Fire. Upgrade any time; downgrades and cancellations go through support.
          </p>
          <PricingPlans />
        </section>
        {/* Comparison Table */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 mb-24">
          <h2 className="font-headline-lg text-headline-lg text-primary text-center mb-12">
            Detailed Feature Comparison
          </h2>
          <div className="bg-surface-white rounded-xl overflow-hidden border border-border-low-alpha shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left border-collapse">
              <thead>
                <tr className="bg-bg-secondary">
                  <th className="p-6 font-label-md text-label-md text-on-surface-variant border-b border-border-low-alpha">
                    Feature
                  </th>
                  {PLAN_ORDER.map((id) => (
                    <th key={id} className="p-6 font-label-md text-label-md text-primary border-b border-border-low-alpha">
                      {PLANS[id].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md">
                {COMPARISON_GROUPS.map((group) => (
                  <Fragment key={group.heading}>
                    <tr className="bg-bg-secondary">
                      <th
                        scope="colgroup"
                        colSpan={PLAN_ORDER.length + 1}
                        className="px-6 py-3 text-left font-label-md text-label-md uppercase tracking-[0.12em] text-on-surface-variant border-y border-border-low-alpha"
                      >
                        {group.heading}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label} className="border-b border-border-low-alpha">
                        <td className="p-6">{row.label}</td>
                        {PLAN_ORDER.map((id) => (
                          <td key={id} className="p-6">{row.render(id)}</td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        </section>
        {/* FAQ Section */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-12 mb-24">
          <h2 className="font-headline-lg text-headline-lg text-primary text-center mb-12">
            Frequently Asked Questions
          </h2>
          <FaqAccordion />
        </section>
        {/* CTA Band */}
        <section className="max-w-[1280px] mx-auto px-4 sm:px-6 mb-12">
          <div className="bg-secondary p-6 sm:p-12 md:p-16 rounded-xl flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              {/* Subtle background pattern */}
              <div className="grid grid-cols-12 w-full h-full">
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="border-r border-on-secondary/20 h-full"></div>
                <div className="h-full"></div>
              </div>
            </div>
            <div className="relative z-10 text-center md:text-left">
              <h2 className="font-display-lg text-headline-lg text-on-secondary mb-2">
                Ready to fill your pipeline?
              </h2>
              <p className="font-body-md text-on-secondary/80">Set up your workspace and launch your first campaign in minutes.</p>
            </div>
            <Link
              href="/signup"
              className="relative z-10 bg-primary text-on-primary px-10 py-4 rounded-lg font-label-md text-label-md hover:brightness-110 transition-all shadow-xl"
            >
              Get started now
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
