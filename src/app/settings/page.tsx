"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";

const TABS = ["General", "Members", "Billing", "Security", "Data & privacy"] as const;
type Tab = (typeof TABS)[number];

const slug = (t: string) => t.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-[20px] p-6 sm:p-8 premium-shadow border border-border-low-alpha">
      <div className="mb-8">
        <h3 className="font-headline-md text-headline-md text-primary serif-text mb-1">
          {title}
        </h3>
        <p className="text-on-surface-variant font-body-md">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function WorkspaceCard() {
  return (
    <Card title="Workspace" subtitle="Configure your agency's public presence and domain.">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 md:gap-12">
        <div className="space-y-6">
          <div>
            <label className="block font-label-md text-primary mb-2">Agency Name</label>
            <input
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md"
              type="text"
              defaultValue="Acme Recruitment"
            />
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">Workspace URL</label>
            <div className="flex items-center">
              <span className="bg-bg-cream border border-r-0 border-border-low-alpha rounded-l-xl px-4 py-3 text-outline font-label-md">
                talscout.app/
              </span>
              <input
                className="flex-1 min-w-0 border border-border-low-alpha rounded-r-xl px-4 py-3 font-body-md focus:ring-primary"
                type="text"
                defaultValue="acme"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <label className="block font-label-md text-primary mb-4 w-full text-center">
            Agency Logo
          </label>
          <div className="relative group">
            <div className="w-32 h-32 rounded-full bg-surface-container-high border-2 border-dashed border-outline-variant flex items-center justify-center overflow-hidden">
              <span className="material-symbols-outlined text-outline text-[40px]">image</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-10 flex justify-end">
        <button
          type="button"
          onClick={() => toast.success("Changes saved")}
          className="bg-primary text-white px-8 py-3 rounded-xl font-label-md hover:shadow-lg transition-all active:scale-[0.98]"
        >
          Save changes
        </button>
      </div>
    </Card>
  );
}

function ProfileCard() {
  return (
    <Card title="Personal profile" subtitle="Manage your account details and profile picture.">
      <div className="flex flex-col sm:flex-row gap-8 sm:gap-12">
        <div className="shrink-0">
          <div className="w-24 h-24 rounded-full bg-surface-container overflow-hidden border-2 border-white shadow-md flex items-center justify-center text-primary font-headline-md serif-text">
            RJ
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block font-label-md text-primary mb-2">Full name</label>
            <input
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md"
              type="text"
              defaultValue="Rishav J."
            />
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">Work email</label>
            <input
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md"
              type="email"
              defaultValue="rishav@acme.com"
            />
          </div>
        </div>
      </div>
      <div className="mt-10 flex justify-end">
        <button
          type="button"
          onClick={() => toast.success("Changes saved")}
          className="bg-primary text-white px-8 py-3 rounded-xl font-label-md hover:shadow-lg transition-all active:scale-[0.98]"
        >
          Save changes
        </button>
      </div>
    </Card>
  );
}

function SecurityCard() {
  const [twoFA, setTwoFA] = useState(true);
  return (
    <Card title="Security" subtitle="Protect your account with modern security standards.">
      <div className="space-y-8">
        <div className="flex flex-wrap gap-4 items-center justify-between py-4 border-b border-border-low-alpha/50">
          <div>
            <p className="font-label-md text-primary">Password</p>
            <p className="text-on-surface-variant text-[13px]">Last changed 3 months ago</p>
          </div>
          <button
            type="button"
            className="px-5 py-2 border border-outline rounded-lg text-primary font-label-md hover:bg-surface-container-low transition-colors"
          >
            Change password
          </button>
        </div>
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="font-label-md text-primary">Two-factor authentication</p>
              <span className="bg-secondary-container text-on-secondary-container text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Recommended
              </span>
            </div>
            <p className="text-on-surface-variant text-[13px]">
              Add an extra layer of security to your account.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={twoFA}
            onClick={() => setTwoFA((v) => !v)}
            className={
              "w-12 h-6 rounded-full relative flex items-center transition-colors px-1 " +
              (twoFA ? "bg-primary" : "bg-outline-variant")
            }
          >
            <div
              className={
                "w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-[var(--ease-out)] " +
                (twoFA ? "translate-x-6" : "translate-x-0")
              }
            />
          </button>
        </div>
        <div>
          <p className="font-label-md text-primary mb-4">Active sessions</p>
          <div className="bg-bg-cream/40 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-outline">laptop_mac</span>
                <div>
                  <p className="text-label-md text-on-surface">MacBook Pro 16&quot; • San Francisco, USA</p>
                  <p className="text-[11px] text-tertiary font-medium">Current session</p>
                </div>
              </div>
              <span className="text-[11px] text-outline font-data-mono">192.168.1.1</span>
            </div>
            <div className="h-[1px] bg-border-low-alpha" />
            <div className="flex items-center justify-between gap-3 opacity-60">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-outline">smartphone</span>
                <div>
                  <p className="text-label-md text-on-surface">iPhone 15 Pro • London, UK</p>
                  <p className="text-[11px] text-on-surface-variant">Last active: 2 hours ago</p>
                </div>
              </div>
              <button type="button" className="text-error font-label-md text-[12px] hover:underline">
                Revoke
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LinkPanel({
  title,
  subtitle,
  blurb,
  href,
  cta,
}: {
  title: string;
  subtitle: string;
  blurb: string;
  href: string;
  cta: string;
}) {
  return (
    <Card title={title} subtitle={subtitle}>
      <p className="text-on-surface-variant font-body-md mb-6">{blurb}</p>
      <Link
        href={href}
        className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-label-md hover:shadow-lg transition-all active:scale-[0.98]"
      >
        {cta}
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </Link>
    </Card>
  );
}

function DataPanel() {
  return (
    <Card title="Data & privacy" subtitle="Export, review, or delete your workspace data.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4 items-center justify-between py-4 border-b border-border-low-alpha/50">
          <div>
            <p className="font-label-md text-primary">Export workspace data</p>
            <p className="text-on-surface-variant text-[13px]">Download all candidates and activity as CSV.</p>
          </div>
          <button
            type="button"
            className="px-5 py-2 border border-outline rounded-lg text-primary font-label-md hover:bg-surface-container-low transition-colors"
          >
            Export data
          </button>
        </div>
        <div className="flex flex-wrap gap-4 items-center justify-between py-4 border-b border-border-low-alpha/50">
          <div>
            <p className="font-label-md text-primary">Activity log</p>
            <p className="text-on-surface-variant text-[13px]">Review every sensitive action in your workspace.</p>
          </div>
          <Link
            href="/audit"
            className="px-5 py-2 border border-outline rounded-lg text-primary font-label-md hover:bg-surface-container-low transition-colors"
          >
            View audit log
          </Link>
        </div>
        <div className="flex flex-wrap gap-4 items-center justify-between py-4">
          <div>
            <p className="font-label-md text-error">Delete workspace</p>
            <p className="text-on-surface-variant text-[13px]">Permanently remove this workspace and all data.</p>
          </div>
          <button
            type="button"
            className="px-5 py-2 border border-error/40 text-error rounded-lg font-label-md hover:bg-error/5 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("General");

  // Deep-link support: initialise from URL hash (e.g. /settings#billing).
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    const found = TABS.find((t) => slug(t) === h);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: read URL hash on mount (window not available at SSR)
    if (found) setTab(() => found);
  }, []);

  const selectTab = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `#${slug(t)}`);
  };

  return (
    <AppShell>
      <main className="min-h-dvh flex flex-col">
        {/* TopAppBar */}
        <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md flex flex-wrap justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-border-low-alpha">
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
            <nav className="flex text-on-surface-variant font-label-md gap-2 items-center">
              <span className="text-outline">Settings</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              <span className="text-primary font-semibold">{tab}</span>
            </nav>
            <div className="sm:ml-12 relative flex-1 sm:flex-none">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                search
              </span>
              <input
                className="pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-full w-full sm:w-64 text-label-md focus:ring-1 focus:ring-primary"
                placeholder="Search settings..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button
                type="button"
                className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined">history</span>
              </button>
            </div>
            <div className="h-8 w-[1px] bg-border-low-alpha" />
            <Link
              href="/upload"
              className="bg-primary text-white px-5 py-2 rounded-lg font-label-md hover:opacity-90 transition-all active:scale-95 duration-100 whitespace-nowrap"
            >
              + Upload résumés
            </Link>
          </div>
        </header>

        {/* Content Canvas */}
        <div className="flex-1 p-4 sm:p-6 lg:p-12 max-w-6xl mx-auto w-full">
          <h1 className="font-headline-lg text-3xl sm:text-display-lg text-primary mb-8 lg:mb-12 serif-text">
            Settings
          </h1>
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Sub-nav column */}
            <aside className="w-full lg:w-56 lg:shrink-0">
              <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                {TABS.map((t) => {
                  const active = t === tab;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => selectTab(t)}
                      className={
                        "flex items-center whitespace-nowrap px-4 py-3 rounded-lg transition-all text-left " +
                        (active
                          ? "bg-primary/5 text-primary font-semibold lg:border-l-4 lg:border-primary"
                          : "text-on-surface-variant hover:bg-surface-container-low")
                      }
                    >
                      {t}
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Content Column */}
            <div className="flex-1 space-y-8 pb-20 min-w-0">
              {tab === "General" && (
                <>
                  <WorkspaceCard />
                  <ProfileCard />
                </>
              )}
              {tab === "Members" && (
                <LinkPanel
                  title="Members"
                  subtitle="Manage who can access this workspace."
                  blurb="Invite recruiters, set roles, and manage seats in Team & seats."
                  href="/team"
                  cta="Manage team & seats"
                />
              )}
              {tab === "Billing" && (
                <LinkPanel
                  title="Billing"
                  subtitle="Manage your subscription and invoices."
                  blurb="You're on the Growth plan — $199/seat/mo. View invoices, update payment, or change plan in Billing."
                  href="/billing"
                  cta="Go to Billing"
                />
              )}
              {tab === "Security" && <SecurityCard />}
              {tab === "Data & privacy" && <DataPanel />}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-bg-cream w-full py-12 px-4 sm:px-6 lg:px-12 border-t border-border-low-alpha mt-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-[1440px] mx-auto">
            <div className="col-span-1">
              <span className="text-headline-md font-headline-md text-primary block mb-4">TalScout</span>
              <p className="text-on-surface-variant text-label-md leading-relaxed">
                Intelligence-driven recruitment for the modern age.
              </p>
            </div>
            <div className="flex flex-col space-y-3">
              <p className="font-label-md text-primary uppercase text-[10px] tracking-widest mb-2">Platform</p>
              <Link href="/#features" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Solutions</Link>
              <Link href="/pricing" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Pricing</Link>
              <Link href="/#features" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Resources</Link>
            </div>
            <div className="flex flex-col space-y-3">
              <p className="font-label-md text-primary uppercase text-[10px] tracking-widest mb-2">Legal</p>
              <Link href="/privacy" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Privacy</Link>
              <Link href="/terms" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Terms</Link>
              <Link href="/cookies" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Cookie Policy</Link>
            </div>
            <div className="flex flex-col items-start md:items-end justify-between">
              <div className="flex gap-4">
                <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">language</span>
                <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">hub</span>
              </div>
              <p className="text-on-surface-variant text-label-md opacity-60 mt-4 md:mt-0">© 2026 TalScout AI. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}
