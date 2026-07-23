"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/marketing/site-footer";
import { LandingNav } from "@/components/marketing/landing-nav";
import { LandingFaq } from "@/components/marketing/landing-faq";
import { useAuth } from "@/components/app/auth-provider";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

const WORKFLOW = [
  {
    number: "01",
    title: "Ingest every résumé",
    body: "Upload PDF and DOCX files individually or in bulk. TalScout handles inconsistent layouts and scanned documents.",
  },
  {
    number: "02",
    title: "Structure the intelligence",
    body: "Names, contacts, skills, experience, education and work history become clean, reviewable candidate profiles.",
  },
  {
    number: "03",
    title: "Search and take action",
    body: "Describe the person you need, understand why they match, shortlist them, and launch personalized outreach.",
  },
];

const TRUST_POINTS = [
  { icon: "database", title: "Tenant-isolated data", body: "Workspace boundaries are enforced at the database layer." },
  { icon: "fact_check", title: "Human review", body: "Recruiters approve extracted data before it becomes a source of truth." },
  { icon: "policy", title: "Role-based access", body: "Permissions and plan capabilities are enforced server-side." },
  { icon: "receipt_long", title: "Auditable workflows", body: "Scale plans include a workspace activity trail for accountability." },
];

function ProductWindow() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border-low-alpha bg-surface-white shadow-[0_34px_90px_-42px_rgba(15,23,42,0.42)]">
      <div className="flex h-11 items-center justify-between border-b border-border-low-alpha bg-surface-container-low/80 px-4">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-outline-variant" />
          <span className="size-2.5 rounded-full bg-outline-variant" />
          <span className="size-2.5 rounded-full bg-outline-variant" />
        </div>
        <span className="font-data-mono text-[10px] uppercase tracking-[0.14em] text-outline">
          Candidate intelligence
        </span>
        <span className="size-5" />
      </div>

      <div className="grid min-h-[430px] grid-cols-[54px_1fr] sm:grid-cols-[150px_1fr]">
        <aside className="border-r border-border-low-alpha bg-surface-white p-2.5 sm:p-4">
          <div className="mb-7 flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <span className="material-symbols-outlined text-[18px]">travel_explore</span>
            </span>
            <span className="hidden text-[13px] font-semibold text-on-surface sm:inline">TalScout</span>
          </div>
          {[
            ["search", "Search"],
            ["group", "Candidates"],
            ["star", "Shortlists"],
            ["insights", "Analytics"],
          ].map(([icon, label], index) => (
            <div
              key={label}
              className={`mb-1 flex h-9 items-center gap-2 rounded-lg px-2 ${
                index === 0 ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">{icon}</span>
              <span className="hidden text-[11px] sm:inline">{label}</span>
            </div>
          ))}
        </aside>

        <div className="min-w-0 bg-bg-cream p-4 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Semantic search</p>
              <h3 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-on-surface sm:text-[22px]">
                Find the right candidate
              </h3>
            </div>
            <span className="hidden rounded-lg border border-border-low-alpha bg-surface-white px-2.5 py-1.5 text-[10px] font-medium text-text-muted sm:inline">
              248 profiles
            </span>
          </div>

          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-border-low-alpha bg-surface-white px-3 py-3 shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-outline">search</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-on-surface-variant sm:text-[13px]">
              Senior product designer · design systems · remote
            </span>
            <span className="rounded-md bg-primary-fixed px-2 py-1 text-[9px] font-semibold text-primary">AI search</span>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-outline">Best matches</span>
            <span className="text-[10px] text-outline">Ranked by fit</span>
          </div>

          {[
            {
              initials: "ER",
              name: "Elena Rodriguez",
              role: "Lead Product Designer",
              location: "San Francisco · Remote",
              score: "94",
              reason: "Led a multi-product design system across 3 SaaS platforms.",
            },
            {
              initials: "MJ",
              name: "Marcus Johnson",
              role: "Senior Product Designer",
              location: "Austin · Remote",
              score: "91",
              reason: "Strong systems practice with enterprise workflow experience.",
            },
          ].map((candidate, index) => (
            <div
              key={candidate.name}
              className={`mb-3 rounded-xl border bg-surface-white p-3.5 ${
                index === 0 ? "border-primary/20 shadow-[0_8px_24px_-18px_rgba(13,148,136,0.55)]" : "border-border-low-alpha"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container text-[11px] font-semibold text-text-muted">
                  {candidate.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-on-surface">{candidate.name}</p>
                      <p className="truncate text-[10px] text-text-muted">
                        {candidate.role} · {candidate.location}
                      </p>
                    </div>
                    <span className="font-data-mono text-[12px] font-semibold text-primary">{candidate.score}%</span>
                  </div>
                  <p className="mt-2 hidden border-t border-border-low-alpha pt-2 text-[10px] leading-relaxed text-text-muted sm:block">
                    {candidate.reason}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OutreachWindow() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border-low-alpha bg-surface-white shadow-[0_28px_70px_-40px_rgba(15,23,42,0.38)]">
      <div className="flex items-center justify-between border-b border-border-low-alpha px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold text-on-surface">Senior engineering shortlist</p>
          <p className="mt-0.5 text-[10px] text-text-muted">Personalized candidate outreach</p>
        </div>
        <span className="rounded-md bg-tertiary-fixed px-2 py-1 text-[9px] font-semibold text-on-tertiary-fixed">
          Active
        </span>
      </div>
      <div className="p-5">
        <div className="mb-4 grid grid-cols-3 divide-x divide-border-low-alpha rounded-xl border border-border-low-alpha bg-bg-cream">
          {[
            ["84", "Candidates"],
            ["72", "Sent"],
            ["11", "Replies"],
          ].map(([value, label]) => (
            <div key={label} className="px-3 py-3 text-center">
              <p className="font-data-mono text-[17px] font-semibold text-on-surface">{value}</p>
              <p className="mt-0.5 text-[9px] text-text-muted">{label}</p>
            </div>
          ))}
        </div>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-outline">Sequence</p>
        {[
          ["01", "Personal introduction", "Sent", "Day 0"],
          ["02", "Role context and value", "Scheduled", "Day 3"],
          ["03", "Final follow-up", "Draft", "Day 7"],
        ].map(([step, title, status, day]) => (
          <div key={step} className="flex items-center gap-3 border-b border-border-low-alpha py-3 last:border-0">
            <span className="flex size-7 items-center justify-center rounded-lg bg-surface-container font-data-mono text-[9px] text-text-muted">
              {step}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-on-surface-variant">{title}</p>
              <p className="mt-0.5 text-[9px] text-outline">{day}</p>
            </div>
            <span className="text-[9px] font-medium text-text-muted">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const primaryHref = user ? "/dashboard" : "/signup";

  return (
    <div className="marketing-premium flex min-h-dvh flex-col bg-bg-cream text-on-surface antialiased">
      <LandingNav />

      <main className="flex-grow">
        <section className="relative overflow-hidden border-b border-border-low-alpha bg-bg-cream pt-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,var(--color-border-low-alpha)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-low-alpha)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)] dark:opacity-30"
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-[-420px] size-[780px] -translate-x-1/2 rounded-full bg-primary-fixed/60 blur-[140px] dark:bg-primary-container/15 dark:blur-[180px]"
          />

          <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-16 px-6 pb-20 pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-28 lg:pt-24">
            <Reveal>
              <p className="mb-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
                Talent intelligence for recruiting teams
              </p>
              <h1 className="max-w-[690px] text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] text-on-surface sm:text-[58px] lg:text-[66px]">
                Turn every résumé into a searchable talent advantage.
              </h1>
              <p className="mt-7 max-w-[590px] text-[17px] leading-8 text-text-muted sm:text-[19px]">
                TalScout structures candidate data, understands recruiter intent, and helps your team move from résumé to shortlist to outreach—without the manual work.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={primaryHref}
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary-container px-6 text-[14px] font-semibold text-on-primary-container shadow-[0_10px_28px_-12px_rgba(15,118,110,0.5)] transition-colors hover:bg-primary hover:text-on-primary"
                >
                  {user ? "Open your workspace" : "Start building your talent database"}
                  <span className="material-symbols-outlined text-[17px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
                </Link>
                <Link
                  href="/#product"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-outline-variant bg-surface-white px-6 text-[14px] font-semibold text-on-surface-variant transition-colors hover:border-outline hover:bg-bg-cream"
                >
                  See the product
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-[12px] text-text-muted">
                {["PDF and DOCX ingestion", "Human-reviewed profiles", "Tenant-isolated workspaces"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-primary">check</span>
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.08} className="relative lg:translate-y-5">
              <ProductWindow />
            </Reveal>
          </div>
        </section>

        <section className="border-b border-border-low-alpha bg-surface-white">
          <div className="mx-auto grid max-w-[1240px] grid-cols-2 divide-x divide-border-low-alpha px-6 sm:grid-cols-4 lg:px-8">
            {[
              ["AI parsing", "Structured, reviewable profiles"],
              ["Semantic search", "Meaning over keyword matching"],
              ["Shortlists", "Move the right people forward"],
              ["Outreach", "Personalized sequences at scale"],
            ].map(([title, body]) => (
              <div key={title} className="px-4 py-7 first:pl-0 sm:px-6">
                <p className="text-[12px] font-semibold text-on-surface">{title}</p>
                <p className="mt-1 hidden text-[11px] text-text-muted sm:block">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-24 bg-surface-white px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="grid gap-8 border-b border-border-low-alpha pb-12 lg:grid-cols-[0.8fr_1.2fr]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">One connected workflow</p>
              <div>
                <h2 className="max-w-3xl text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] text-on-surface sm:text-[44px]">
                  From document chaos to confident action.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-7 text-text-muted">
                  The value is not another isolated AI feature. It is a dependable system that makes candidate information useful at every stage of recruiting.
                </p>
              </div>
            </Reveal>

            <div className="grid gap-0 lg:grid-cols-3">
              {WORKFLOW.map((step) => (
                <Reveal
                  key={step.number}
                  className="border-b border-border-low-alpha py-10 lg:border-b-0 lg:border-r lg:px-8 lg:py-14 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
                >
                  <span className="font-data-mono text-[12px] text-primary">{step.number}</span>
                  <h3 className="mt-8 text-[19px] font-semibold tracking-[-0.02em] text-on-surface">{step.title}</h3>
                  <p className="mt-3 max-w-sm text-[14px] leading-6 text-text-muted">{step.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="scroll-mt-24 bg-bg-cream px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
              <Reveal>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Search intelligence</p>
                <h2 className="mt-5 max-w-xl text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  Find people by fit, not by exact phrasing.
                </h2>
                <p className="mt-6 max-w-xl text-[16px] leading-7 text-text-muted">
                  Describe the role in plain English. TalScout retrieves relevant profiles, reranks them by genuine fit, and explains why each candidate surfaced.
                </p>
                <div className="mt-8 space-y-5">
                  {[
                    ["Two-stage matching", "Semantic retrieval followed by profile-level reranking."],
                    ["Explainable results", "Every match includes a concise reason your recruiter can evaluate."],
                    ["Structured filters", "Combine meaning with location, experience and skills."],
                  ].map(([title, body]) => (
                    <div key={title} className="grid grid-cols-[20px_1fr] gap-3">
                      <span className="material-symbols-outlined mt-0.5 text-[17px] text-primary">check_circle</span>
                      <div>
                        <p className="text-[14px] font-semibold text-on-surface">{title}</p>
                        <p className="mt-1 text-[13px] leading-5 text-text-muted">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <div className="rounded-[22px] border border-border-low-alpha bg-surface-white p-5 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.4)]">
                  <div className="rounded-xl border border-border-low-alpha bg-bg-cream p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-outline">Search request</p>
                    <p className="mt-2 text-[13px] font-medium text-on-surface-variant">
                      “ICU nurse in Texas, 3+ years, comfortable with night shifts”
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Dana Kim", "ICU RN · Houston", "96%", "5 years critical care; current night-shift rotation."],
                      ["Luis Peña", "Critical Care RN · Dallas", "92%", "Trauma ICU background with 4 years of experience."],
                      ["Amara Okafor", "ICU Nurse · Austin", "89%", "Strong acute-care experience; flexible shift preference."],
                    ].map(([name, role, score, reason]) => (
                      <div key={name} className="rounded-xl border border-border-low-alpha p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[12px] font-semibold text-on-surface">{name}</p>
                            <p className="mt-0.5 text-[10px] text-text-muted">{role}</p>
                          </div>
                          <span className="font-data-mono text-[12px] font-semibold text-primary">{score}</span>
                        </div>
                        <p className="mt-3 border-t border-border-low-alpha pt-3 text-[10px] leading-4 text-text-muted">{reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>

            <div className="my-24 h-px bg-surface-container-high lg:my-32" />

            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
              <Reveal className="lg:order-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Outreach execution</p>
                <h2 className="mt-5 max-w-xl text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  Move from shortlist to conversation.
                </h2>
                <p className="mt-6 max-w-xl text-[16px] leading-7 text-text-muted">
                  Build a reusable sequence, personalize it to each recipient, and manage sends without leaving the candidate workflow.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-6 border-t border-border-low-alpha pt-7">
                  <div>
                    <p className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface">Email + WhatsApp</p>
                    <p className="mt-1 text-[12px] text-text-muted">Channel support by plan</p>
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface">Human approval</p>
                    <p className="mt-1 text-[12px] text-text-muted">Review before messages send</p>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={0.08} className="lg:order-1">
                <OutreachWindow />
              </Reveal>
            </div>
          </div>
        </section>

        <section className="bg-primary-container px-6 py-24 text-on-primary-container dark:border-y dark:border-border-low-alpha dark:bg-surface dark:text-on-surface lg:px-8 lg:py-28">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary-fixed dark:text-primary">Built for trust</p>
                <h2 className="mt-5 max-w-md text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] sm:text-[42px]">
                  Candidate data deserves production-grade boundaries.
                </h2>
              </div>
              <div className="grid gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 dark:border-outline-variant dark:bg-border-low-alpha sm:grid-cols-2">
                {TRUST_POINTS.map((point) => (
                  <div key={point.title} className="bg-primary-container p-7 dark:bg-surface-container-low">
                    <span className="material-symbols-outlined text-[21px] text-primary-fixed dark:text-primary">{point.icon}</span>
                    <h3 className="mt-5 text-[14px] font-semibold text-on-primary-container dark:text-on-surface">{point.title}</h3>
                    <p className="mt-2 text-[12px] leading-5 text-primary-fixed-dim dark:text-text-muted">{point.body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 bg-surface-white px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Straightforward pricing</p>
              <div>
                <h2 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  Choose the operating scale your team needs.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-7 text-text-muted">
                  Core parsing and semantic search are included on every paid plan. Higher tiers add volume, workflow controls, and outreach capabilities.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 grid overflow-hidden rounded-[22px] border border-border-low-alpha lg:grid-cols-3">
              {PLAN_ORDER.map((id, index) => {
                const plan = PLANS[id];
                return (
                  <div
                    key={plan.id}
                    className={`relative p-7 sm:p-8 ${
                      index < PLAN_ORDER.length - 1 ? "border-b border-border-low-alpha lg:border-b-0 lg:border-r" : ""
                    } ${
                      plan.recommended
                        ? "bg-primary-container text-on-primary-container dark:bg-surface-container-low dark:text-on-surface dark:ring-1 dark:ring-inset dark:ring-outline-variant"
                        : "bg-surface-white"
                    }`}
                  >
                    {plan.recommended && (
                      <span className="absolute right-6 top-6 text-[10px] font-semibold uppercase tracking-[0.13em] text-primary-fixed dark:text-primary">
                        Recommended
                      </span>
                    )}
                    <p className={`text-[14px] font-semibold ${plan.recommended ? "text-on-primary-container dark:text-on-surface" : "text-on-surface"}`}>{plan.name}</p>
                    <p className={`mt-2 text-[12px] ${plan.recommended ? "text-primary-fixed-dim dark:text-text-muted" : "text-text-muted"}`}>{plan.tagline}</p>
                    <div className="mt-8 flex items-end gap-2">
                      <span className="text-[38px] font-semibold leading-none tracking-[-0.04em]">${plan.monthlyPrice}</span>
                      <span className={`pb-1 text-[11px] ${plan.recommended ? "text-primary-fixed-dim dark:text-text-muted" : "text-text-muted"}`}>/ seat / month</span>
                    </div>
                    <div className={`my-7 h-px ${plan.recommended ? "bg-surface-white/10 dark:bg-outline-variant" : "bg-surface-container-high"}`} />
                    <ul className="space-y-3">
                      {plan.features.slice(0, 5).map((feature) => (
                        <li key={feature} className={`flex gap-2.5 text-[12px] leading-5 ${plan.recommended ? "text-primary-fixed-dim dark:text-text-muted" : "text-text-muted"}`}>
                          <span className={`material-symbols-outlined mt-0.5 text-[14px] ${plan.recommended ? "text-primary-fixed dark:text-primary" : "text-primary"}`}>check</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={user ? "/billing" : "/pricing"}
                      className={`mt-8 flex h-11 items-center justify-center rounded-xl text-[13px] font-semibold transition-colors ${
                        plan.recommended
                          ? "bg-surface-white text-on-surface hover:bg-primary-fixed dark:bg-primary-container dark:text-on-primary-container dark:hover:bg-primary"
                          : "border border-outline-variant text-on-surface-variant hover:border-outline hover:bg-bg-cream"
                      }`}
                    >
                      View {plan.name}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 border-t border-border-low-alpha bg-bg-cream px-6 py-24 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[0.65fr_1.35fr]">
            <Reveal>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">FAQ</p>
              <h2 className="mt-5 text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] text-on-surface sm:text-[42px]">
                Questions worth answering.
              </h2>
              <p className="mt-5 max-w-sm text-[14px] leading-6 text-text-muted">
                Need a deeper product or security conversation? Contact our team and we will walk through your workflow.
              </p>
            </Reveal>
            <Reveal delay={0.06}>
              <LandingFaq />
            </Reveal>
          </div>
        </section>

        <section className="bg-surface-white px-6 py-20 lg:px-8 lg:py-24">
          <Reveal className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-9 rounded-[24px] bg-primary-container px-7 py-12 text-on-primary-container shadow-[0_32px_80px_-44px_rgba(15,118,110,0.75)] dark:border dark:border-outline-variant dark:bg-surface-container-low dark:text-on-surface dark:shadow-[0_28px_70px_-42px_rgba(0,0,0,0.9)] sm:px-10 lg:flex-row lg:items-center lg:px-14 lg:py-14">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary-fixed dark:text-primary">Build a better talent system</p>
              <h2 className="mt-4 max-w-2xl text-[32px] font-semibold leading-[1.12] tracking-[-0.035em] sm:text-[40px]">
                Make your candidate database useful again.
              </h2>
            </div>
            <Link
              href={primaryHref}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-surface-white px-6 text-[14px] font-semibold text-on-surface transition-colors hover:bg-primary-fixed dark:bg-primary-container dark:text-on-primary-container dark:hover:bg-primary"
            >
              {user ? "Open dashboard" : "Get started"}
              <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
            </Link>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
