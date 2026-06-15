"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/marketing/site-footer";
import { LandingNav } from "@/components/marketing/landing-nav";
import { useAuth } from "@/components/app/auth-provider";
import { LandingFaq } from "@/components/marketing/landing-faq";
import { PointerGlow } from "@/components/marketing/pointer-glow";
import { SpotlightCard } from "@/components/marketing/spotlight-card";

const TRUST_LOGOS = [
  "Vertex Staffing",
  "NorthBridge Talent",
  "Apex Recruiting",
  "Meridian Search",
  "Summit Staffing",
  "Caldera Talent",
  "Hartwell Group",
];

const STATS = [
  { value: "2.4M", label: "résumés parsed" },
  { value: "< 1s", label: "average search" },
  { value: "100%", label: "tenant-isolated data" },
  { value: "8 hrs", label: "saved per recruiter / week" },
];

const STEPS = [
  {
    icon: "upload_file",
    title: "Upload résumés",
    body: "Drag-and-drop any PDF or Word doc — one at a time or in bulk. We handle messy formatting and scanned files.",
  },
  {
    icon: "auto_awesome",
    title: "AI structures everything",
    body: "TalScout extracts name, skills, experience and education into clean fields automatically. You just review and approve.",
  },
  {
    icon: "search",
    title: "Search by meaning",
    body: "Describe who you need in plain English. Get ranked, explained matches — even when the words don't line up.",
  },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col bg-bg-cream text-on-surface antialiased">
      <LandingNav />

      <main className="flex-grow">
        {/* ===================== HERO ===================== */}
        <PointerGlow
          className="overflow-hidden bg-aurora"
          glowColor="rgba(0, 90, 95, 0.16)"
          glowSize={720}
        >
          {/* floating colour orbs */}
          <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-primary-container/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 top-10 h-80 w-80 rounded-full bg-tertiary-fixed/20 blur-3xl" />

          <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-16 px-6 pb-28 pt-36 md:px-12 lg:grid-cols-2 lg:pt-40">
            {/* copy */}
            <Reveal className="max-w-xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border-low-alpha bg-surface-white/70 px-3 py-1.5 backdrop-blur-sm">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-tertiary-fixed">
                  <span className="material-symbols-outlined text-[12px] text-on-tertiary-fixed">
                    bolt
                  </span>
                </span>
                <span className="font-label-md text-label-md text-on-surface-variant">
                  Your AI talent scout
                </span>
              </div>

              <h1 className="mb-6 font-display-lg text-[44px] leading-[1.04] tracking-tight text-on-surface sm:text-[58px] lg:text-[68px]">
                Stop typing résumés.
                <br />
                <span className="text-gradient-teal">Start finding talent.</span>
              </h1>

              <p className="mb-9 max-w-md font-body-lg text-body-lg leading-relaxed text-text-muted">
                TalScout reads every résumé for you and lets you search your
                entire candidate database in plain English — in seconds. Built
                for staffing teams who are done with manual data entry and dumb
                keyword search.
              </p>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href={user ? "/dashboard" : "/signup"}
                  className="group flex items-center justify-center gap-2 rounded-lg bg-primary-container px-6 py-3.5 font-label-md text-label-md text-on-primary shadow-floating transition-all hover:bg-primary active:scale-[0.97]"
                >
                  {user ? "Go to dashboard" : "Get started"}
                  <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </Link>
                <Link
                  href="/#how"
                  className="flex items-center justify-center gap-2 rounded-lg border border-primary-container/25 bg-surface-white/60 px-6 py-3.5 font-label-md text-label-md text-primary backdrop-blur-sm transition-colors hover:bg-surface-white active:scale-[0.97]"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    play_circle
                  </span>
                  Book a demo
                </Link>
              </div>
              <p className="mt-4 font-data-mono text-data-mono text-text-muted opacity-70">
                Set up in minutes
              </p>
            </Reveal>

            {/* visual */}
            <Reveal delay={0.12} className="relative">
              <div className="relative rounded-3xl border border-border-low-alpha bg-surface-white/80 p-6 shadow-floating backdrop-blur-sm">
                {/* search bar */}
                <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border-low-alpha bg-bg-cream px-4 py-3.5">
                  <span className="material-symbols-outlined text-text-muted">
                    search
                  </span>
                  <div className="flex flex-grow items-center font-body-md text-[15px] text-on-surface">
                    Senior product designer, design systems, open to remote
                    <span className="ml-0.5 inline-block h-5 w-0.5 animate-caret bg-primary" />
                  </div>
                  <span className="hidden items-center gap-1 rounded-md bg-tertiary-fixed px-2.5 py-1 text-on-tertiary-fixed sm:flex">
                    <span className="material-symbols-outlined text-[14px]">bolt</span>
                    <span className="font-label-md text-[12px] font-semibold">AI</span>
                  </span>
                </div>

                {/* top match card */}
                <div className="animate-float-slow relative rounded-2xl border border-border-low-alpha bg-surface-white p-5 shadow-ambient">
                  <span className="brass-badge absolute -right-3 -top-3 z-20 flex items-center gap-1 rounded-full px-3 py-1.5 font-label-md text-label-md shadow-sm">
                    <span className="material-symbols-outlined text-[16px]">verified</span>
                    94% match
                  </span>
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high font-headline-md text-headline-md text-primary">
                      ER
                    </div>
                    <div className="flex-grow">
                      <h3 className="font-headline-md text-[18px] leading-snug text-on-surface">
                        Elena Rodriguez
                      </h3>
                      <p className="font-body-md text-[14px] text-text-muted">
                        Lead Product Designer · San Francisco
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded border border-tertiary-fixed/40 bg-tertiary-fixed/20 px-2 py-1 font-data-mono text-[12px] text-tertiary-container">
                          <span className="h-1.5 w-1.5 rounded-full bg-tertiary-fixed-dim" />
                          Design Systems
                        </span>
                        <span className="inline-flex rounded border border-border-low-alpha bg-bg-cream px-2 py-1 font-data-mono text-[12px] text-text-muted">
                          AI UX
                        </span>
                        <span className="inline-flex rounded border border-border-low-alpha bg-bg-cream px-2 py-1 font-data-mono text-[12px] text-text-muted">
                          Remote
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* second card */}
                <div className="animate-float-slower mt-4 flex items-start gap-4 rounded-2xl border border-border-low-alpha bg-surface-white p-5 opacity-70 shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high font-headline-md text-[15px] text-text-muted">
                    MJ
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-headline-md text-[15px] text-on-surface">
                      Marcus Johnson
                    </h3>
                    <p className="font-body-md text-[13px] text-text-muted">
                      Senior Product Designer · 91% match
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </PointerGlow>

        {/* ===================== TRUST STRIP ===================== */}
        <section className="border-y border-border-low-alpha bg-surface-white py-10">
          <p className="mb-6 text-center font-label-md text-label-md uppercase tracking-[0.18em] text-text-muted">
            Trusted by modern staffing teams
          </p>
          <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <div className="flex w-max animate-marquee items-center gap-14 pr-14">
              {[...TRUST_LOGOS, ...TRUST_LOGOS].map((logo, i) => (
                <span
                  key={`${logo}-${i}`}
                  className="whitespace-nowrap font-headline-md text-[20px] text-on-surface-variant/40"
                >
                  {logo}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== STATS ===================== */}
        <section className="bg-aurora-soft px-6 py-20 md:px-12">
          <div className="mx-auto grid w-full max-w-[1440px] grid-cols-2 gap-8 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal
                key={s.label}
                delay={i * 0.06}
                className="text-center"
              >
                <div className="font-display-lg text-[44px] leading-none text-gradient-teal lg:text-[52px]">
                  {s.value}
                </div>
                <p className="mt-2 font-label-md text-label-md text-text-muted">
                  {s.label}
                </p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ===================== THE PROBLEM ===================== */}
        <section className="bg-surface-white px-6 py-24 md:px-12">
          <div className="mx-auto w-full max-w-[1440px]">
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <span className="mb-4 inline-block font-label-md text-label-md uppercase tracking-[0.18em] text-secondary">
                The old way is broken
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface lg:text-[40px] lg:leading-[1.1]">
                Two problems quietly cost your agency every single day.
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[
                {
                  icon: "keyboard",
                  tag: "Problem 1",
                  title: "Manual résumé data entry",
                  body: "Recruiters retype names, contacts and work history into the database by hand — hundreds a week. It's slow, soul-crushing, and full of typos.",
                },
                {
                  icon: "search_off",
                  tag: "Problem 2",
                  title: "Dumb keyword search",
                  body: "Search “React developer” and you miss the person who wrote “built front-ends with Next.js.” Great candidates sit invisible in your own database.",
                },
              ].map((p, i) => (
                <Reveal key={p.title} delay={i * 0.08}>
                  <SpotlightCard className="h-full rounded-2xl border border-border-low-alpha bg-bg-cream p-8 shadow-ambient">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-surface-white shadow-sm">
                      <span className="material-symbols-outlined text-[24px] text-error">
                        {p.icon}
                      </span>
                    </div>
                    <span className="font-data-mono text-[12px] uppercase tracking-wider text-text-muted">
                      {p.tag}
                    </span>
                    <h3 className="mb-3 mt-1 font-headline-md text-[22px] text-on-surface">
                      {p.title}
                    </h3>
                    <p className="font-body-md text-body-md leading-relaxed text-text-muted">
                      {p.body}
                    </p>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== HOW IT WORKS ===================== */}
        <section id="how" className="scroll-mt-24 bg-bg-cream px-6 py-24 md:px-12">
          <div className="mx-auto w-full max-w-[1440px]">
            <Reveal className="mx-auto mb-16 max-w-2xl text-center">
              <span className="mb-4 inline-block font-label-md text-label-md uppercase tracking-[0.18em] text-primary">
                How it works
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface lg:text-[40px] lg:leading-[1.1]">
                From résumé chaos to the right hire — in three steps.
              </h2>
            </Reveal>

            {/* steps */}
            <div className="relative mb-16 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="absolute left-0 right-0 top-6 hidden h-px bg-border-low-alpha md:block" />
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 0.08} className="relative text-center">
                  <div className="relative z-10 mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-on-primary shadow-floating ring-8 ring-bg-cream">
                    <span className="material-symbols-outlined text-[22px]">
                      {step.icon}
                    </span>
                  </div>
                  <span className="font-data-mono text-[12px] text-text-muted">
                    Step {i + 1}
                  </span>
                  <h3 className="mb-2 mt-1 font-headline-md text-[20px] text-on-surface">
                    {step.title}
                  </h3>
                  <p className="mx-auto max-w-xs font-body-md text-body-md leading-relaxed text-text-muted">
                    {step.body}
                  </p>
                </Reveal>
              ))}
            </div>

            {/* product mockup */}
            <Reveal delay={0.1}>
              <div className="mx-auto max-w-4xl rounded-3xl border border-border-low-alpha bg-surface-white p-6 shadow-floating md:p-8">
                <div className="mb-6 flex justify-center">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-2xl rounded-bl-sm bg-primary-container px-4 py-3 text-on-primary shadow-sm">
                    <span className="material-symbols-outlined text-[18px] text-primary-fixed-dim">
                      chat
                    </span>
                    <span className="font-body-md text-[15px]">
                      ICU nurse in Texas, 3+ years, night shift OK
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { initials: "DK", name: "Dana Kim", role: "ICU RN · Houston, TX", match: "96%" },
                    { initials: "LP", name: "Luis Peña", role: "Critical Care RN · Dallas", match: "92%" },
                    { initials: "AO", name: "Amara Okafor", role: "ICU Nurse · Austin", match: "89%" },
                  ].map((c) => (
                    <div
                      key={c.name}
                      className="rounded-2xl border border-border-low-alpha bg-bg-cream p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high font-headline-md text-[13px] text-primary">
                          {c.initials}
                        </div>
                        <span className="rounded-full bg-tertiary-fixed px-2 py-0.5 font-data-mono text-[11px] font-semibold text-on-tertiary-fixed">
                          {c.match}
                        </span>
                      </div>
                      <h4 className="font-headline-md text-[15px] text-on-surface">
                        {c.name}
                      </h4>
                      <p className="font-body-md text-[13px] text-text-muted">
                        {c.role}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== FEATURE SPOTLIGHT (dark teal) ===================== */}
        <PointerGlow
          className="overflow-hidden bg-teal-gradient"
          glowColor="rgba(169, 249, 49, 0.16)"
          glowSize={560}
        >
          <span aria-hidden className="absolute inset-0 bg-grid-dark opacity-60" />
          <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-14 px-6 py-24 md:px-12 lg:grid-cols-2">
            <Reveal>
              <span className="mb-4 inline-block font-label-md text-label-md uppercase tracking-[0.18em] text-tertiary-fixed">
                The TalScout difference
              </span>
              <h2 className="mb-5 font-headline-lg text-headline-lg text-on-primary lg:text-[40px] lg:leading-[1.1]">
                Search that actually understands meaning.
              </h2>
              <p className="mb-8 max-w-md font-body-lg text-body-lg leading-relaxed text-primary-fixed-dim">
                Old tools only match exact keywords, so great candidates stay
                invisible. TalScout understands intent — &ldquo;React
                developer&rdquo; finds the person who wrote &ldquo;built
                front-ends with Next.js.&rdquo; No more lost talent in your own
                database.
              </p>
              <Link
                href={user ? "/dashboard" : "/signup"}
                className="group inline-flex items-center gap-2 rounded-lg bg-tertiary-fixed px-6 py-3.5 font-label-md text-label-md text-on-tertiary-fixed shadow-floating transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
              >
                See it in action
                <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              </Link>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-floating backdrop-blur-sm">
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3">
                  <span className="material-symbols-outlined text-[18px] text-tertiary-fixed">
                    search
                  </span>
                  <span className="font-body-md text-[14px] text-white/90">
                    Led a team of 5+ in B2B SaaS
                  </span>
                </div>
                {[
                  { n: "Priya Nair", r: "managed a squad of", h: "7 engineers", t: "to ship an enterprise billing platform", m: "95%" },
                  { n: "Tomás Vidal", r: "directed", h: "6 product engineers", t: "across two B2B SaaS launches", m: "90%" },
                ].map((row) => (
                  <div
                    key={row.n}
                    className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 last:mb-0"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-headline-md text-[15px] text-white">
                        {row.n}
                      </span>
                      <span className="rounded-full bg-tertiary-fixed px-2 py-0.5 font-data-mono text-[11px] font-semibold text-on-tertiary-fixed">
                        {row.m}
                      </span>
                    </div>
                    <p className="font-body-md text-[13px] leading-snug text-white/70">
                      …{row.r}{" "}
                      <span className="rounded bg-tertiary-fixed/30 px-1 text-tertiary-fixed">
                        {row.h}
                      </span>{" "}
                      {row.t}…
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </PointerGlow>

        {/* ===================== FEATURE BENTO ===================== */}
        <section id="features" className="scroll-mt-24 bg-surface-white px-6 py-24 md:px-12">
          <div className="mx-auto w-full max-w-[1440px]">
            <Reveal className="mx-auto mb-16 max-w-2xl text-center">
              <span className="mb-4 inline-block font-label-md text-label-md uppercase tracking-[0.18em] text-primary">
                Everything you need
              </span>
              <h2 className="mb-4 font-headline-lg text-headline-lg text-on-surface lg:text-[40px] lg:leading-[1.1]">
                Intelligence built for the recruiting workflow.
              </h2>
              <p className="font-body-lg text-body-lg text-text-muted">
                We don&apos;t just extract text. We understand context,
                standardize formats, and surface the right talent the moment you
                need it.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* parsing — wide */}
              <SpotlightCard className="rounded-2xl border border-border-low-alpha bg-bg-cream p-8 shadow-ambient md:col-span-2">
                <div className="flex flex-col items-start gap-8 md:flex-row">
                  <div className="md:w-1/2">
                    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-surface-white shadow-sm">
                      <span className="material-symbols-outlined text-[24px] text-primary-container">
                        document_scanner
                      </span>
                    </div>
                    <h3 className="mb-3 font-headline-md text-[20px] text-on-surface">
                      Zero-config résumé parsing
                    </h3>
                    <p className="font-body-md text-body-md leading-relaxed text-text-muted">
                      Drop in PDFs, Word docs, or scanned files. TalScout
                      normalizes titles, calculates total experience, and pulls
                      out skills, education and contact info — automatically.
                    </p>
                  </div>
                  <div className="w-full rounded-xl border border-border-low-alpha bg-surface-white p-4 shadow-sm md:w-1/2">
                    <div className="flex gap-3">
                      <div className="flex h-14 w-10 items-center justify-center rounded border border-border-low-alpha bg-surface-container-high">
                        <span className="material-symbols-outlined text-[20px] text-text-muted">
                          picture_as_pdf
                        </span>
                      </div>
                      <div className="flex flex-grow flex-col justify-center gap-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                          <div className="h-full w-3/4 rounded-full bg-primary-container" />
                        </div>
                        <div className="flex justify-between font-data-mono text-[10px] text-text-muted">
                          <span>Extracting skills…</span>
                          <span>75%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </SpotlightCard>

              {/* security — teal */}
              <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-primary-container p-8 text-on-primary shadow-ambient">
                <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-primary opacity-50" />
                <div className="relative z-10">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                    <span className="material-symbols-outlined text-[24px] text-primary-fixed">
                      shield_lock
                    </span>
                  </div>
                  <h3 className="mb-3 font-headline-md text-[20px] text-white">
                    Data isolated by design
                  </h3>
                  <p className="font-body-md text-[15px] text-primary-fixed-dim">
                    Every agency&apos;s candidates live in a walled-off
                    workspace, enforced at the database level. One tenant can
                    never see another&apos;s data.
                  </p>
                </div>
                <div className="relative z-10 mt-8 flex items-center gap-2 font-data-mono text-[13px] text-primary-fixed">
                  <span className="material-symbols-outlined text-[16px]">
                    check_circle
                  </span>
                  Row-level security
                </div>
              </div>

              {/* review */}
              <SpotlightCard className="rounded-2xl border border-border-low-alpha bg-bg-cream p-8 shadow-ambient">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-surface-white shadow-sm">
                  <span className="material-symbols-outlined text-[24px] text-secondary">
                    fact_check
                  </span>
                </div>
                <h3 className="mb-3 font-headline-md text-[20px] text-on-surface">
                  Human-in-the-loop review
                </h3>
                <p className="font-body-md text-body-md leading-relaxed text-text-muted">
                  AI proposes, your recruiter approves. Every extraction gets a
                  quick review screen, so your database stays clean and you stay
                  in control.
                </p>
              </SpotlightCard>

              {/* integrations — wide */}
              <SpotlightCard className="rounded-2xl border border-border-low-alpha bg-bg-cream p-8 text-center shadow-ambient md:col-span-2">
                <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border-low-alpha bg-surface-white px-3 py-1 font-label-md text-[12px] text-text-muted shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-tertiary-fixed-dim" />
                  Works with your stack
                </span>
                <h3 className="mb-3 font-headline-md text-[24px] text-on-surface">
                  Push to your ATS instantly
                </h3>
                <p className="mx-auto mb-8 max-w-lg font-body-md text-body-md text-text-muted">
                  Export structured profiles straight to Bullhorn, Greenhouse,
                  or Lever with one click. No more re-keying data between tools.
                </p>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-surface-white font-headline-md text-primary shadow-sm">
                    B
                  </div>
                  <span className="material-symbols-outlined text-text-muted opacity-50">
                    sync_alt
                  </span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container font-headline-md text-white shadow-sm">
                    TS
                  </div>
                  <span className="material-symbols-outlined text-text-muted opacity-50">
                    sync_alt
                  </span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-surface-white font-headline-md text-secondary shadow-sm">
                    G
                  </div>
                </div>
              </SpotlightCard>
            </div>
          </div>
        </section>

        {/* ===================== TESTIMONIALS ===================== */}
        <section className="bg-bg-cream px-6 py-24 md:px-12">
          <div className="mx-auto w-full max-w-[1440px]">
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <span className="mb-4 inline-block font-label-md text-label-md uppercase tracking-[0.18em] text-primary">
                Loved by recruiters
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface lg:text-[40px] lg:leading-[1.1]">
                Recruiters fill roles faster with TalScout.
              </h2>
            </Reveal>

            <Reveal delay={0.08}>
              <SpotlightCard className="mx-auto max-w-3xl rounded-3xl border border-border-low-alpha bg-surface-white p-8 shadow-floating md:p-12">
                <div className="mb-5 flex gap-1 text-secondary-fixed-dim">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                      star
                    </span>
                  ))}
                </div>
                <p className="mb-8 font-display-lg text-[24px] leading-snug text-on-surface lg:text-[28px]">
                  &ldquo;We cut résumé processing from hours to minutes and
                  actually find people we forgot we had. It paid for itself in
                  week one.&rdquo;
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high font-headline-md text-primary">
                    MA
                  </div>
                  <div>
                    <p className="font-headline-md text-[16px] text-on-surface">
                      Monica Alvarez
                    </p>
                    <p className="font-body-md text-[14px] text-text-muted">
                      Director of Recruiting · Vertex Staffing
                    </p>
                  </div>
                </div>
              </SpotlightCard>
            </Reveal>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 opacity-50">
              {TRUST_LOGOS.slice(0, 6).map((logo) => (
                <span
                  key={logo}
                  className="font-headline-md text-[18px] text-on-surface-variant"
                >
                  {logo}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== PRICING TEASER ===================== */}
        <section className="bg-surface-white px-6 py-24 md:px-12">
          <div className="mx-auto w-full max-w-[1440px]">
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <span className="mb-4 inline-block font-label-md text-label-md uppercase tracking-[0.18em] text-primary">
                Simple, per-seat pricing
              </span>
              <h2 className="mb-4 font-headline-lg text-headline-lg text-on-surface lg:text-[40px] lg:leading-[1.1]">
                One plan per recruiter. No surprises.
              </h2>
              <p className="font-body-lg text-body-lg text-text-muted">
                Add a seat when you add a recruiter. Usage limits are guardrails,
                never a surprise bill.
              </p>
            </Reveal>

            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
              {[
                { name: "Starter", price: "$99", per: "/seat / mo", note: "For small teams getting started", featured: false },
                { name: "Growth", price: "$199", per: "/seat / mo", note: "For scaling agencies", featured: true },
                { name: "Scale", price: "$399", per: "/seat / mo", note: "For high-volume teams", featured: false },
              ].map((tier) => (
                <div
                  key={tier.name}
                  className={`relative rounded-3xl p-8 shadow-ambient ${
                    tier.featured
                      ? "bg-primary-container text-on-primary ring-2 ring-tertiary-fixed"
                      : "border border-border-low-alpha bg-bg-cream"
                  }`}
                >
                  {tier.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-tertiary-fixed px-3 py-1 font-data-mono text-[11px] font-semibold text-on-tertiary-fixed">
                      Most popular
                    </span>
                  )}
                  <h3
                    className={`font-headline-md text-[18px] ${
                      tier.featured ? "text-white" : "text-on-surface"
                    }`}
                  >
                    {tier.name}
                  </h3>
                  <div className="mt-3 flex items-end gap-1">
                    <span
                      className={`font-display-lg text-[40px] leading-none ${
                        tier.featured ? "text-white" : "text-on-surface"
                      }`}
                    >
                      {tier.price}
                    </span>
                    <span
                      className={`mb-1 font-body-md text-[14px] ${
                        tier.featured ? "text-primary-fixed-dim" : "text-text-muted"
                      }`}
                    >
                      {tier.per}
                    </span>
                  </div>
                  <p
                    className={`mt-3 font-body-md text-[14px] ${
                      tier.featured ? "text-primary-fixed-dim" : "text-text-muted"
                    }`}
                  >
                    {tier.note}
                  </p>
                  <Link
                    href={user ? "/billing" : "/pricing"}
                    className={`mt-6 flex items-center justify-center gap-2 rounded-lg px-5 py-3 font-label-md text-label-md transition-all active:scale-[0.97] ${
                      tier.featured
                        ? "bg-tertiary-fixed text-on-tertiary-fixed hover:-translate-y-0.5"
                        : "border border-primary-container/25 text-primary hover:bg-primary-container/5"
                    }`}
                  >
                    Choose plan
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center font-label-md text-label-md text-text-muted">
              <Link href="/pricing" className="text-primary underline-offset-4 hover:underline">
                Compare all plans &rarr;
              </Link>
            </p>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section id="faq" className="scroll-mt-24 bg-bg-cream px-6 py-24 md:px-12">
          <div className="mx-auto w-full max-w-[1440px]">
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <span className="mb-4 inline-block font-label-md text-label-md uppercase tracking-[0.18em] text-primary">
                Questions
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface lg:text-[40px] lg:leading-[1.1]">
                You&apos;re probably wondering&hellip;
              </h2>
            </Reveal>
            <LandingFaq />
          </div>
        </section>

        {/* ===================== FINAL CTA ===================== */}
        <section className="px-6 py-20 md:px-12">
          <PointerGlow
            className="mx-auto w-full max-w-[1440px] overflow-hidden rounded-[2rem] bg-lime-gradient"
            glowColor="rgba(255, 255, 255, 0.35)"
            glowSize={520}
          >
            <div className="flex flex-col items-center px-6 py-20 text-center md:px-12">
              <h2 className="mb-4 max-w-2xl font-display-lg text-[36px] leading-[1.1] text-on-tertiary-fixed lg:text-[48px]">
                Stop typing. Start scouting.
              </h2>
              <p className="mb-9 max-w-xl font-body-lg text-body-lg text-on-tertiary-fixed/80">
                Give every recruiter on your team an AI talent scout — and never
                retype a résumé again.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href={user ? "/dashboard" : "/signup"}
                  className="group flex items-center justify-center gap-2 rounded-lg bg-primary-container px-7 py-3.5 font-label-md text-label-md text-on-primary shadow-floating transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
                >
                  Get started
                  <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </Link>
                <Link
                  href="/pricing"
                  className="flex items-center justify-center gap-2 rounded-lg border border-on-tertiary-fixed/20 bg-on-tertiary-fixed/5 px-7 py-3.5 font-label-md text-label-md text-on-tertiary-fixed transition-colors hover:bg-on-tertiary-fixed/10 active:scale-[0.97]"
                >
                  Talk to sales
                </Link>
              </div>
            </div>
          </PointerGlow>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
