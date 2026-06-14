import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-cream text-on-surface antialiased">
      {/* TopNavBar */}
      <header className="fixed top-0 z-50 w-full border-b border-border-low-alpha bg-surface/80 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-4 md:px-12">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="font-headline-lg text-headline-md tracking-tight text-primary"
            >
              TalScout
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              <a
                href="/#features"
                className="cursor-pointer border-b-2 border-secondary pb-1 font-label-md text-label-md font-semibold text-primary transition-all duration-200"
              >
                Product
              </a>
              <Link
                href="/pricing"
                className="cursor-pointer font-label-md text-label-md text-on-surface-variant transition-colors duration-200 hover:text-primary"
              >
                Pricing
              </Link>
              <a
                href="/#features"
                className="cursor-pointer font-label-md text-label-md text-on-surface-variant transition-colors duration-200 hover:text-primary"
              >
                Solutions
              </a>
              <a
                href="/#features"
                className="cursor-pointer font-label-md text-label-md text-on-surface-variant transition-colors duration-200 hover:text-primary"
              >
                Resources
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="hidden font-label-md text-label-md text-on-surface transition-colors hover:text-primary sm:block"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-primary-container px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow pt-[88px]">
        {/* Hero */}
        <section className="relative overflow-hidden bg-hero-gradient px-6 pb-32 pt-24">
          <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-16 lg:grid-cols-2">
            {/* Hero copy */}
            <Reveal className="z-10 max-w-xl">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border-low-alpha bg-surface-container-high px-3 py-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">
                  auto_awesome
                </span>
                <span className="font-label-md text-label-md text-on-surface-variant">
                  Introducing IQ Parse v2.0
                </span>
              </div>
              <h1 className="mb-6 font-display-lg text-display-lg text-on-surface">
                Stop typing résumés.
                <br />
                <span className="text-primary">Start finding talent.</span>
              </h1>
              <p className="mb-10 max-w-md font-body-lg text-body-lg leading-relaxed text-text-muted">
                Transform chaotic PDFs into a structured, searchable candidate
                database in seconds. Built for high-volume recruitment teams who
                demand precision and speed.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/signup"
                  className="group flex items-center justify-center gap-2 rounded-lg bg-primary-container px-6 py-3 font-label-md text-label-md text-on-primary shadow-ambient transition-colors hover:bg-primary"
                >
                  Start your free trial
                  <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </Link>
                <button className="flex items-center justify-center gap-2 rounded-lg border border-primary-container/20 bg-transparent px-6 py-3 font-label-md text-label-md text-primary-container transition-colors hover:bg-primary-container/5">
                  <span className="material-symbols-outlined text-[18px]">
                    play_circle
                  </span>
                  Watch demo
                </button>
              </div>
              <p className="mt-4 font-data-mono text-data-mono text-text-muted opacity-70">
                No credit card required. SOC2 Compliant.
              </p>
            </Reveal>

            {/* Hero interactive visual */}
            <Reveal delay={0.12} className="relative z-10">
              <div className="absolute inset-0 -z-10 translate-x-10 translate-y-10 scale-150 rounded-full bg-secondary-container/10 blur-3xl" />
              <div className="relative rounded-2xl border border-border-low-alpha bg-surface-white p-6 shadow-floating">
                {/* Search simulation */}
                <div className="relative mb-6 flex items-center gap-3 overflow-hidden rounded-xl border border-border-low-alpha bg-bg-cream p-4 shadow-inner">
                  <span className="material-symbols-outlined text-text-muted">
                    search
                  </span>
                  <div className="flex flex-grow items-center font-body-md text-body-md text-on-surface">
                    Senior Product Designer, React, FinTech
                    <span className="ml-1 h-5 w-0.5 animate-pulse bg-primary" />
                  </div>
                  <div className="flex items-center gap-1 rounded-md bg-tertiary-fixed px-3 py-1 text-on-tertiary-fixed">
                    <span className="material-symbols-outlined text-[14px]">
                      bolt
                    </span>
                    <span className="font-label-md text-[12px] font-semibold">
                      Semantic Match
                    </span>
                  </div>
                </div>

                {/* Candidate card highlight */}
                <div className="group relative rounded-xl border border-border-low-alpha bg-surface-white p-5 shadow-ambient transition-colors hover:border-primary-container/30">
                  <div className="absolute -right-4 -top-4 z-20 flex items-center gap-1 rounded-full border border-secondary/20 bg-secondary-container px-3 py-1.5 font-label-md text-label-md text-on-secondary-container shadow-sm">
                    <span className="material-symbols-outlined text-[16px]">
                      verified
                    </span>
                    94% Match
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high font-headline-md text-headline-md text-primary">
                      ER
                    </div>
                    <div className="flex-grow">
                      <div className="mb-1 flex items-start justify-between">
                        <div>
                          <h3 className="font-headline-md text-[18px] leading-snug text-on-surface">
                            Elena Rodriguez
                          </h3>
                          <p className="font-body-md text-[14px] text-text-muted">
                            Lead UX Designer @ Stripe
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded border border-tertiary-fixed/30 bg-tertiary-fixed/20 px-2 py-1 font-data-mono text-[12px] text-tertiary-container">
                          <span className="h-1.5 w-1.5 rounded-full bg-tertiary-fixed-dim" />{" "}
                          React
                        </span>
                        <span className="inline-flex rounded border border-border-low-alpha bg-bg-cream px-2 py-1 font-data-mono text-[12px] text-text-muted">
                          Design Systems
                        </span>
                        <span className="inline-flex rounded border border-border-low-alpha bg-bg-cream px-2 py-1 font-data-mono text-[12px] text-text-muted">
                          FinTech
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Faded secondary card */}
                <div className="relative z-0 mt-4 origin-top scale-95 rounded-xl border border-border-low-alpha bg-surface-white p-5 opacity-50">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high font-headline-md text-[16px] text-text-muted">
                      MJ
                    </div>
                    <div>
                      <h3 className="mb-0.5 font-headline-md text-[16px] text-on-surface">
                        Marcus Johnson
                      </h3>
                      <p className="font-body-md text-[13px] text-text-muted">
                        Senior Product Designer
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section id="features" className="scroll-mt-24 border-t border-border-low-alpha bg-surface-white px-6 py-24">
          <div className="mx-auto w-full max-w-[1440px]">
            <Reveal className="mx-auto mb-16 max-w-2xl text-center">
              <h2 className="mb-4 font-headline-lg text-headline-lg text-on-surface">
                Intelligence built for workflow
              </h2>
              <p className="font-body-lg text-body-lg text-text-muted">
                We don&apos;t just extract text. We understand context,
                standardize formats, and surface the right talent when you need
                it.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Feature 1: Semantic Search */}
              <div className="group relative flex flex-col items-center gap-8 overflow-hidden rounded-2xl border border-border-low-alpha bg-bg-cream p-8 shadow-ambient md:col-span-2 md:flex-row">
                <div className="relative z-10 md:w-1/2">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-white shadow-sm">
                    <span className="material-symbols-outlined text-[24px] text-primary-container">
                      plagiarism
                    </span>
                  </div>
                  <h3 className="mb-3 font-headline-md text-[20px] text-on-surface">
                    Semantic Search
                  </h3>
                  <p className="font-body-md text-text-muted">
                    Stop guessing keywords. Search with natural language and our
                    AI understands the intent behind your query, matching skills
                    and experience contextually.
                  </p>
                </div>
                <div className="relative z-10 w-full rounded-xl border border-border-low-alpha bg-surface-white p-4 shadow-sm transition-transform duration-500 group-hover:-translate-y-1 md:w-1/2 md:translate-x-4 md:translate-y-4">
                  <div className="mb-2 font-data-mono text-[13px] text-text-muted">
                    Query: &quot;Led team of 5+ in B2B SaaS&quot;
                  </div>
                  <div className="rounded-r-md border-l-2 border-tertiary-fixed-dim bg-tertiary-fixed/10 p-3">
                    <p className="font-body-md text-[14px] leading-snug text-on-surface">
                      ...managed a squad of{" "}
                      <span className="rounded border-b border-tertiary-fixed-dim bg-tertiary-fixed/30 px-1">
                        7 engineers
                      </span>{" "}
                      to deliver an enterprise billing platform...
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 2: Data Isolation */}
              <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-primary-container p-8 text-on-primary shadow-ambient">
                <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-primary opacity-50" />
                <div className="relative z-10 mb-8">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                    <span className="material-symbols-outlined text-[24px] text-primary-fixed">
                      shield_lock
                    </span>
                  </div>
                  <h3 className="mb-3 font-headline-md text-[20px] text-white">
                    Secure Data Isolation
                  </h3>
                  <p className="font-body-md text-[15px] text-primary-fixed-dim">
                    Your candidate data is siloed and encrypted. Our models learn
                    from structure, not your proprietary information.
                  </p>
                </div>
                <div className="relative z-10 mt-auto">
                  <div className="flex items-center gap-2 font-data-mono text-[13px] text-primary-fixed">
                    <span className="material-symbols-outlined text-[16px]">
                      check_circle
                    </span>
                    SOC2 Type II Certified
                  </div>
                </div>
              </div>

              {/* Feature 3: Resume Parsing */}
              <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border-low-alpha bg-bg-cream p-8 shadow-ambient">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-white shadow-sm">
                  <span className="material-symbols-outlined text-[24px] text-secondary">
                    document_scanner
                  </span>
                </div>
                <h3 className="mb-3 font-headline-md text-[20px] text-on-surface">
                  Zero-Config Parsing
                </h3>
                <p className="mb-6 font-body-md text-text-muted">
                  Drop in PDFs, Word docs, or raw text. We automatically
                  normalize titles, calculate total experience, and extract
                  contact info.
                </p>
                <div className="mt-auto flex gap-3 rounded-lg border border-border-low-alpha bg-surface-white p-3 shadow-inner">
                  <div className="flex h-14 w-10 items-center justify-center rounded border border-border-low-alpha bg-surface-container-high">
                    <span className="material-symbols-outlined text-[20px] text-text-muted">
                      picture_as_pdf
                    </span>
                  </div>
                  <div className="flex flex-grow flex-col justify-center gap-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                      <div className="h-full w-3/4 rounded-full bg-secondary" />
                    </div>
                    <div className="flex justify-between font-data-mono text-[10px] text-text-muted">
                      <span>Extracting skills...</span>
                      <span>75%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature 4: ATS Integration */}
              <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-border-low-alpha bg-bg-cream p-8 text-center shadow-ambient md:col-span-2">
                <div className="relative z-10 max-w-lg">
                  <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border-low-alpha bg-surface-white px-3 py-1 font-label-md text-[12px] text-text-muted shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-tertiary-fixed-dim" />
                    Works with your stack
                  </span>
                  <h3 className="mb-3 font-headline-md text-[24px] text-on-surface">
                    Push to ATS instantly
                  </h3>
                  <p className="mb-8 font-body-md text-text-muted">
                    Export structured profiles directly to Workday, Greenhouse,
                    or Lever with one click. No more manual data entry.
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-white font-headline-md text-primary shadow-sm">
                      G
                    </div>
                    <span className="material-symbols-outlined text-text-muted opacity-50">
                      sync_alt
                    </span>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container font-headline-md text-white shadow-sm">
                      IQ
                    </div>
                    <span className="material-symbols-outlined text-text-muted opacity-50">
                      sync_alt
                    </span>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-low-alpha bg-white font-headline-md text-blue-600 shadow-sm">
                      W
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
