"use client";

import Link from "next/link";
import { FaqAccordion } from "@/components/pricing/faq-accordion";
import { PricingPlans } from "@/components/pricing/pricing-plans";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PLANS, PLAN_ORDER, CAPABILITY_LABEL, planHasCapability } from "@/lib/plans";

const COMPARISON_ROWS: { label: string; render: (planId: (typeof PLAN_ORDER)[number]) => string }[] = [
  {
    label: "Résumés / month",
    render: (id) => {
      const n = PLANS[id].uploadsPerMonth;
      return n >= 100000 ? "Unlimited" : n.toLocaleString();
    },
  },
  { label: "Semantic candidate search", render: () => "Included" },
  {
    label: CAPABILITY_LABEL.bulk_upload,
    render: (id) => (planHasCapability(id, "bulk_upload") ? "Included" : "—"),
  },
  {
    label: CAPABILITY_LABEL.advanced_filters,
    render: (id) => (planHasCapability(id, "advanced_filters") ? "Included" : "—"),
  },
  {
    label: CAPABILITY_LABEL.ats_export,
    render: (id) => (planHasCapability(id, "ats_export") ? "Included" : "—"),
  },
  {
    label: CAPABILITY_LABEL.api_access,
    render: (id) => (planHasCapability(id, "api_access") ? "Included" : "—"),
  },
  {
    label: CAPABILITY_LABEL.audit_log,
    render: (id) => (planHasCapability(id, "audit_log") ? "Included" : "—"),
  },
  {
    label: CAPABILITY_LABEL.sso,
    render: (id) => (planHasCapability(id, "sso") ? "Included" : "—"),
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
            Pay per recruiter. Upgrade any time — downgrades and cancellations go through support.
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
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.label} className={i < COMPARISON_ROWS.length - 1 ? "border-b border-border-low-alpha" : undefined}>
                    <td className="p-6">{row.label}</td>
                    {PLAN_ORDER.map((id) => (
                      <td key={id} className="p-6">{row.render(id)}</td>
                    ))}
                  </tr>
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
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="border-r border-white/20 h-full"></div>
                <div className="h-full"></div>
              </div>
            </div>
            <div className="relative z-10 text-center md:text-left">
              <h2 className="font-display-lg text-headline-lg text-white mb-2">
                Ready to transform your recruitment?
              </h2>
              <p className="font-body-md text-white/80">Set up your workspace and start parsing résumés in minutes.</p>
            </div>
            <Link
              href="/signup"
              className="relative z-10 bg-primary text-white px-10 py-4 rounded-lg font-label-md text-label-md hover:bg-primary-container transition-all shadow-xl"
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
