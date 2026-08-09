"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/marketing/site-footer";
import { LandingNav } from "@/components/marketing/landing-nav";
import { LandingFaq } from "@/components/marketing/landing-faq";
import { useAuth } from "@/components/app/auth-provider";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { BorderBeam } from "@/components/ui/border-beam";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { TiltCard } from "@/components/ui/tilt-card";
import { NumberTicker } from "@/components/ui/number-ticker";

const PIPELINE = [
  {
    number: "01",
    icon: "auto_awesome",
    title: "Build your blueprint",
    body: "Give us your website. We research it live on the web, ask a few questions, and turn the answers into a structured brief the AI writes from.",
  },
  {
    number: "02",
    icon: "travel_explore",
    title: "Discover businesses",
    body: "Pick a category and a place. We pull real businesses from mapping and places data — not a stale purchased list.",
  },
  {
    number: "03",
    icon: "alternate_email",
    title: "Find the email",
    body: "A waterfall of sources looks for a real contact address. No email found means no email sent — that lead never enters the pipeline.",
  },
  {
    number: "04",
    icon: "filter_alt",
    title: "Qualify the fit",
    body: "The AI reads each business against your blueprint's rules and drops the ones that were never a fit, before a single email goes out.",
  },
  {
    number: "05",
    icon: "send",
    title: "Write and send",
    body: "Every email is written for that one business, then sent from your own mailbox on a paced, human-looking schedule.",
  },
];

const DELIVERABILITY = [
  {
    icon: "mail_lock",
    title: "Your mailbox, not ours",
    body: "Connect Gmail or any SMTP account. Mail leaves from your domain, so replies land in your inbox and your reputation stays yours.",
  },
  {
    icon: "schedule",
    title: "Paced, never blasted",
    body: "Sends are spread across the day with natural jitter instead of firing a whole batch in one minute.",
  },
  {
    icon: "forum",
    title: "Threaded follow-ups",
    body: "Day 3 and Day 7 reply into the original conversation, from the same sender — never as a cold new message.",
  },
  {
    icon: "encrypted",
    title: "Encrypted credentials",
    body: "Mailbox tokens and SMTP passwords are encrypted at rest with AES-256-GCM and only decrypted at the moment of sending.",
  },
];

const TRUST_POINTS = [
  { icon: "database", title: "Tenant-isolated data", body: "Workspace boundaries are enforced at the database layer, not just in app code." },
  { icon: "fact_check", title: "Grounded, not invented", body: "Copy is written strictly from your blueprint. The AI is instructed never to fabricate claims or numbers." },
  { icon: "policy", title: "Role-based access", body: "Permissions and plan capabilities are enforced server-side on every request." },
  { icon: "receipt_long", title: "Auditable workflows", body: "Scale plans include a workspace activity trail for accountability." },
];

/** Hero visual — one workspace frame holding BOTH engines, given equal space
 *  and equal visual weight. Outreach and Talent work differently, but neither
 *  is a sidebar feature of the other. */
function WorkspaceWindow() {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-border-low-alpha bg-surface-white shadow-[0_34px_90px_-42px_rgba(15,23,42,0.42)]">
      <BorderBeam size={90} duration={11} />
      <div className="flex h-11 items-center justify-between border-b border-border-low-alpha bg-surface-container-low/80 px-4">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-outline-variant" />
          <span className="size-2.5 rounded-full bg-outline-variant" />
          <span className="size-2.5 rounded-full bg-outline-variant" />
        </div>
        <span className="font-data-mono text-[10px] uppercase tracking-[0.14em] text-outline">
          TalScout workspace
        </span>
        <span className="size-5" />
      </div>

      {/* Engine 1 — Outreach */}
      <div className="bg-bg-cream p-4 sm:p-5">
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <span className="material-symbols-outlined text-[17px]">rocket_launch</span>
            </span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">Outreach</p>
              <p className="mt-0.5 text-[14px] font-semibold tracking-[-0.015em] text-on-surface sm:text-[16px]">
                Dentists · Austin, TX
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-md bg-tertiary-fixed px-2 py-1 text-[9px] font-semibold text-on-tertiary-fixed">
            Active
          </span>
        </div>

        <div className="mb-3 grid grid-cols-4 divide-x divide-border-low-alpha rounded-xl border border-border-low-alpha bg-surface-white">
          {[
            [142, "Found"],
            [96, "Emails"],
            [61, "Qualified"],
            [14, "Replies"],
          ].map(([value, label], index) => (
            <div key={label} className="px-1.5 py-2.5 text-center">
              <p className="font-data-mono text-[15px] font-semibold text-on-surface">
                <NumberTicker value={value as number} delay={index * 0.08} />
              </p>
              <p className="mt-0.5 text-[9px] text-text-muted">{label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-primary/20 bg-surface-white p-3 shadow-[0_8px_24px_-18px_rgba(13,148,136,0.55)]">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-text-muted">
              <span className="material-symbols-outlined text-[16px]">storefront</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-on-surface">Brightsmile Family Dental</p>
              <p className="truncate text-[9px] text-text-muted">No website · 4.6★ · Austin</p>
            </div>
            <span className="shrink-0 rounded-md bg-primary-fixed px-2 py-0.5 text-[9px] font-semibold text-primary">
              Sent
            </span>
          </div>
        </div>
      </div>

      <div className="h-px bg-border-low-alpha" />

      {/* Engine 2 — Talent */}
      <div className="bg-surface-white p-4 sm:p-5">
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <span className="material-symbols-outlined text-[17px]">group</span>
            </span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">Talent</p>
              <p className="mt-0.5 text-[14px] font-semibold tracking-[-0.015em] text-on-surface sm:text-[16px]">
                Semantic candidate search
              </p>
            </div>
          </div>
          <span className="hidden shrink-0 rounded-md border border-border-low-alpha px-2 py-1 text-[9px] font-medium text-text-muted sm:inline">
            248 profiles
          </span>
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-xl border border-border-low-alpha bg-bg-cream px-3 py-2.5">
          <span className="material-symbols-outlined text-[16px] text-outline">search</span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-on-surface-variant sm:text-[11px]">
            ICU nurse · Texas · night shifts
          </span>
        </div>

        {[
          ["DK", "Dana Kim", "ICU RN · Houston", "96%"],
          ["LP", "Luis Peña", "Critical Care RN · Dallas", "92%"],
        ].map(([initials, name, role, score], index) => (
          <div
            key={name}
            className={`flex items-center gap-2.5 rounded-xl border bg-surface-white p-3 ${
              index === 0
                ? "mb-2 border-primary/20 shadow-[0_8px_24px_-18px_rgba(13,148,136,0.55)]"
                : "border-border-low-alpha"
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-[10px] font-semibold text-text-muted">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-on-surface">{name}</p>
              <p className="truncate text-[9px] text-text-muted">{role}</p>
            </div>
            <span className="shrink-0 font-data-mono text-[11px] font-semibold text-primary">{score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Blueprint visual — the structured business brief every email is written
 *  from. This is the "how the AI knows your business" proof point. */
function BlueprintWindow() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border-low-alpha bg-surface-white shadow-[0_28px_70px_-42px_rgba(15,23,42,0.4)]">
      <div className="border-b border-border-low-alpha px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-on-surface">Blueprint · Northside Web Studio</p>
          <span className="rounded-md bg-primary-fixed px-2 py-1 text-[9px] font-semibold text-primary">Active</span>
        </div>
        <p className="mt-1 text-[10px] text-text-muted">Generated from your site + live web research</p>
      </div>
      <div className="space-y-3 p-5">
        {[
          ["What we offer", "Done-for-you websites for local service businesses, live in 14 days."],
          ["Who it's for", "Independent trades and clinics with 2–20 staff, no in-house marketing."],
          ["Differentiator", "Fixed price, no retainer, full handover of the site."],
          ["Voice", "Plain, direct, no agency jargon."],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-low-alpha bg-bg-cream p-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-outline">{label}</p>
            <p className="mt-1.5 text-[11px] leading-5 text-on-surface-variant">{value}</p>
          </div>
        ))}
        <div className="rounded-xl border border-primary/20 bg-primary-fixed/40 p-3.5 dark:bg-primary-container/10">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px] text-primary">filter_alt</span>
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-primary">Lead rules</p>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-on-surface-variant">
            Only businesses with no site or a weak one. Never franchises or chains.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Bulk Fire visual — the bring-your-own-list engine. Distinct from the
 *  automated campaign window above so the two features read as separate. */
function BulkFireWindow() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border-low-alpha bg-surface-white shadow-[0_28px_70px_-40px_rgba(15,23,42,0.38)]">
      <div className="flex items-center justify-between border-b border-border-low-alpha px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold text-on-surface">Q3 agency list</p>
          <p className="mt-0.5 text-[10px] text-text-muted">1,240 contacts imported from CSV</p>
        </div>
        <span className="rounded-md bg-tertiary-fixed px-2 py-1 text-[9px] font-semibold text-on-tertiary-fixed">
          Firing
        </span>
      </div>
      <div className="p-5">
        <div className="mb-4 grid grid-cols-3 divide-x divide-border-low-alpha rounded-xl border border-border-low-alpha bg-bg-cream">
          {[
            [1240, "Contacts"],
            [842, "Sent"],
            [97, "Replies"],
          ].map(([value, label], index) => (
            <div key={label} className="px-3 py-3 text-center">
              <p className="font-data-mono text-[17px] font-semibold text-on-surface">
                <NumberTicker value={value as number} delay={index * 0.08} />
              </p>
              <p className="mt-0.5 text-[9px] text-text-muted">{label}</p>
            </div>
          ))}
        </div>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-outline">Sequence</p>
        {[
          ["01", "Opening email", "Sent", "Day 0"],
          ["02", "Follow-up in thread", "Sending", "Day 3"],
          ["03", "Final nudge", "Scheduled", "Day 7"],
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
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border-low-alpha pt-4">
          {["3 senders rotating", "Paced sending", "Stops on reply"].map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-border-low-alpha bg-bg-cream px-2 py-1 text-[9px] font-medium text-text-muted"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Reply-handling visual — AI drafts, a human always approves. */
function ReplyWindow() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border-low-alpha bg-surface-white shadow-[0_28px_70px_-42px_rgba(15,23,42,0.4)]">
      <div className="border-b border-border-low-alpha px-5 py-4">
        <p className="text-[11px] font-semibold text-on-surface">Reply from Cedar Park Dental Care</p>
        <p className="mt-0.5 text-[10px] text-text-muted">Detected in thread · 2 hours ago</p>
      </div>
      <div className="p-5">
        <div className="rounded-xl border border-border-low-alpha bg-bg-cream p-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-outline">They said</p>
          <p className="mt-2 text-[11px] leading-5 text-on-surface-variant">
            “Interesting timing — we&apos;ve been meaning to redo the site. What does it usually run?”
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-primary/20 bg-surface-white p-4">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-primary">auto_awesome</span>
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-primary">AI-drafted reply</p>
          </div>
          <p className="mt-2.5 text-[11px] leading-5 text-on-surface-variant">
            Happy to share — most builds like yours land in a fixed range, and I can send a firm number once
            I know how many pages you need. Would a short call this week work?
          </p>
          <div className="mt-3 flex items-center gap-2 border-t border-border-low-alpha pt-3">
            <span className="inline-flex h-8 items-center rounded-lg bg-primary-container px-3 text-[10px] font-semibold text-on-primary-container">
              Approve &amp; send
            </span>
            <span className="inline-flex h-8 items-center rounded-lg border border-outline-variant px-3 text-[10px] font-medium text-text-muted">
              Edit
            </span>
            <span className="inline-flex h-8 items-center rounded-lg border border-outline-variant px-3 text-[10px] font-medium text-text-muted">
              Reject
            </span>
          </div>
        </div>

        <p className="mt-3 text-[10px] leading-4 text-text-muted">
          Nothing sends itself. Every reply waits for a human.
        </p>
      </div>
    </div>
  );
}

/** Talent-side visual — deliberately smaller and later on the page than the
 *  outreach windows above; this is a separate product, not the headline. */
function TalentWindow() {
  return (
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
  );
}

/** AI Agent visual — a real transcript shape, not an invented one: a user
 *  message, a tool card mid-action (matching the actual "Connect X" card the
 *  live chat renders), a completed tool card, then a grounded text reply.
 *  Kept honest to what the product actually shows rather than a generic
 *  "AI is smart" mockup. */
function AgentWindow() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border-low-alpha bg-surface-white shadow-[0_28px_70px_-42px_rgba(15,23,42,0.4)]">
      <div className="flex h-11 items-center justify-between border-b border-border-low-alpha bg-surface-container-low/80 px-4">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-outline-variant" />
          <span className="size-2.5 rounded-full bg-outline-variant" />
          <span className="size-2.5 rounded-full bg-outline-variant" />
        </div>
        <span className="font-data-mono text-[10px] uppercase tracking-[0.14em] text-outline">AI Agent</span>
        <span className="size-5" />
      </div>

      <div className="space-y-3.5 p-5">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl bg-primary-fixed/50 px-4 py-2.5 dark:bg-primary-container/15">
            <p className="text-[12px] leading-5 text-on-surface">
              Find ICU nurses in Texas and connect my Gmail so I can reach out.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary-fixed/30 px-3.5 py-3 dark:bg-primary-container/10">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
            <span className="material-symbols-outlined text-[15px]">bolt</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-primary">Connect Gmail</p>
            <p className="text-[10px] text-text-muted">Opens in a new tab — come back and try again</p>
          </div>
          <span className="shrink-0 rounded-lg bg-primary-container px-2.5 py-1.5 text-[10px] font-semibold text-on-primary-container">
            Connect
          </span>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl border border-border-low-alpha bg-bg-cream px-3.5 py-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-container/60 text-on-primary-container">
            <span className="material-symbols-outlined text-[13px]">check</span>
          </span>
          <p className="text-[11px] text-on-surface-variant">Searched candidates — 3 strong matches</p>
        </div>

        <div className="rounded-2xl bg-surface-container-low px-4 py-2.5">
          <p className="text-[12px] leading-5 text-on-surface-variant">
            Found 3 strong matches. Want me to draft outreach to them once Gmail&apos;s connected?
          </p>
        </div>
      </div>
    </div>
  );
}

const AGENT_POINTS = [
  {
    icon: "bolt",
    title: "Takes real action",
    body: "Searches candidates, builds blueprints, and launches campaigns — not just descriptions of what you could do yourself.",
  },
  {
    icon: "hub",
    title: "Connects your tools",
    body: "Gmail, Calendar, Notion, and 1,000+ apps via Composio — connect once in chat, use everywhere after.",
  },
  {
    icon: "verified_user",
    title: "Waits for your yes",
    body: "Sending, activating, or deleting anything always pauses for your explicit approval first — every time, no exceptions.",
  },
  {
    icon: "auto_awesome",
    title: "Learns your playbooks",
    body: "Save any procedure as a reusable Skill, or schedule it to run on its own — hourly, daily, or weekly.",
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const primaryHref = user ? "/dashboard" : "/signup";

  return (
    <div className="marketing-premium flex min-h-dvh flex-col bg-bg-cream text-on-surface antialiased">
      <LandingNav />

      <main className="flex-grow">
        {/* ---- Hero: outreach-first ---- */}
        <section className="relative overflow-hidden border-b border-border-low-alpha bg-bg-cream pt-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,var(--color-border-low-alpha)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-low-alpha)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)] dark:opacity-30"
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-[-420px] size-[780px] -translate-x-1/2 rounded-full bg-primary-fixed/60 blur-[140px] dark:bg-primary-container/15 dark:blur-[180px]"
          />

          <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-16 px-6 pb-20 pt-8 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-28 lg:pt-10">
            <Reveal>
              <Link
                href="/#agent"
                className="group mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-fixed/60 py-1.5 pl-3 pr-2.5 text-[12px] font-semibold text-on-primary-fixed transition-colors hover:bg-primary-fixed dark:border-primary-container/30 dark:bg-primary-container/10 dark:text-primary dark:hover:bg-primary-container/20"
              >
                <span className="rounded-full bg-primary-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-on-primary-container">
                  New
                </span>
                An AI Agent that runs both engines for you
                <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-0.5">
                  arrow_forward
                </span>
              </Link>
              <p className="mb-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
                AI outreach &amp; talent intelligence
              </p>
              <h1 className="max-w-[690px] text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] text-on-surface sm:text-[58px] lg:text-[66px]">
                AI that finds your next customer — and your next hire.
              </h1>
              <p className="mt-7 max-w-[590px] text-[17px] leading-8 text-text-muted sm:text-[19px]">
                Two AI engines in one workspace. Outreach discovers businesses that fit what you sell and
                writes each of them a personal email. Talent turns your résumé pile into a database you can
                search in plain English. Run one, or run both.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={primaryHref}
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary-container px-6 text-[14px] font-semibold text-on-primary-container shadow-[0_10px_28px_-12px_rgba(15,118,110,0.5)] transition-[filter] hover:brightness-110"
                >
                  {user ? "Open your workspace" : "Get started"}
                  <span className="material-symbols-outlined text-[17px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
                </Link>
                <Link
                  href="/#platform"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-outline-variant bg-surface-white px-6 text-[14px] font-semibold text-on-surface-variant transition-colors hover:border-outline hover:bg-bg-cream"
                >
                  See how it works
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-[12px] text-text-muted">
                {["Leads found for you", "Résumés parsed and searchable", "You approve every send"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-primary">check</span>
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.08} className="relative lg:translate-y-5">
              <TiltCard maxTilt={4}>
                <WorkspaceWindow />
              </TiltCard>
            </Reveal>
          </div>
        </section>

        {/* ---- Capability strip ---- */}
        <section className="border-b border-border-low-alpha bg-surface-white">
          <div className="mx-auto grid max-w-[1240px] grid-cols-2 divide-x divide-border-low-alpha px-6 sm:grid-cols-4 lg:px-8">
            {[
              ["Lead discovery", "Real businesses, found for you"],
              ["Personalized copy", "Written per lead, never templated"],
              ["Résumé parsing", "PDFs into structured profiles"],
              ["Semantic search", "Find people by meaning"],
            ].map(([title, body]) => (
              <div
                key={title}
                className="group px-4 py-7 transition-transform duration-300 first:pl-0 hover:-translate-y-0.5 sm:px-6"
              >
                <p className="text-[12px] font-semibold text-on-surface transition-colors group-hover:text-primary">{title}</p>
                <p className="mt-1 text-[11px] text-text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Two separate engines: the core clarification ---- */}
        <section id="platform" className="scroll-mt-24 bg-surface-white px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="grid gap-8 border-b border-border-low-alpha pb-12 lg:grid-cols-[0.8fr_1.2fr]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Two engines, one workspace</p>
              <div>
                <h2 className="max-w-3xl text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] text-on-surface sm:text-[44px]">
                  Two engines. Both built all the way.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-7 text-text-muted">
                  Outreach brings you new customers. Talent makes your candidate data usable. They work in
                  completely different ways and never cross wires — no résumé feeds a campaign, no lead lands
                  in your candidate database — but neither is an add-on to the other. Run one, or run both.
                </p>
              </div>
            </Reveal>

            <div className="grid gap-6 pt-12 lg:grid-cols-2">
              {[
                {
                  icon: "rocket_launch",
                  name: "Outreach",
                  lead: "Win new business",
                  body: "Find businesses that fit what you sell, write to them, and handle the replies — either fully automated, or fired at a list you already own.",
                  points: [
                    "AI Automated Outreach — finds the leads itself",
                    "Bulk Fire — your list, your sequence",
                    "AI reply drafting with human approval",
                  ],
                  href: "/#outreach",
                  cta: "Explore outreach",
                },
                {
                  icon: "group",
                  name: "Talent",
                  lead: "Place the right people",
                  body: "Turn a pile of résumés into structured profiles, then find the right person by describing them in plain English instead of guessing keywords.",
                  points: [
                    "AI résumé parsing with human review",
                    "Semantic candidate search with reasons",
                    "Shortlists your team can act on",
                  ],
                  href: "/#talent",
                  cta: "Explore talent",
                },
              ].map((engine, index) => (
                <Reveal key={engine.name} delay={index * 0.08}>
                  <SpotlightCard className="flex h-full flex-col rounded-[22px] border border-primary/25 bg-bg-cream p-8 shadow-[0_20px_60px_-40px_rgba(13,148,136,0.5)] transition-transform duration-300 hover:-translate-y-1">
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                        <span className="material-symbols-outlined text-[22px]">{engine.icon}</span>
                      </span>
                      <div>
                        <span className="rounded-md bg-primary-fixed px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">
                          {engine.lead}
                        </span>
                        <h3 className="mt-1.5 text-[22px] font-semibold tracking-[-0.025em] text-on-surface">
                          {engine.name}
                        </h3>
                      </div>
                    </div>
                    <p className="mt-6 text-[15px] leading-7 text-text-muted">{engine.body}</p>
                    <ul className="mt-7 space-y-3 border-t border-border-low-alpha pt-6">
                      {engine.points.map((item) => (
                        <li key={item} className="flex gap-2.5 text-[13px] leading-5 text-on-surface-variant">
                          <span className="material-symbols-outlined mt-0.5 text-[15px] text-primary">check_circle</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-7">
                      <Link
                        href={engine.href}
                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary transition-colors hover:text-on-surface"
                      >
                        {engine.cta}
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </Link>
                    </div>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---- AI Automated Outreach: the pipeline ---- */}
        <section id="outreach" className="scroll-mt-24 border-y border-border-low-alpha bg-bg-cream px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="max-w-3xl">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">AI Automated Outreach</p>
              <h2 className="mt-5 text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[48px]">
                You never touch a lead list again.
              </h2>
              <p className="mt-6 text-[16px] leading-7 text-text-muted">
                This is the part that runs without you. Set the campaign once — what you sell, who you want,
                where they are — and the pipeline below repeats on its own, finding new businesses and starting
                real conversations while you work on something else.
              </p>
            </Reveal>

            <div className="relative mt-16 grid gap-px overflow-hidden rounded-[22px] border border-border-low-alpha bg-border-low-alpha sm:grid-cols-2 lg:grid-cols-5">
              <BorderBeam size={140} duration={14} />
              {PIPELINE.map((step, index) => (
                <Reveal
                  key={step.number}
                  delay={index * 0.05}
                  className="flex h-full flex-col bg-surface-white p-6 lg:p-7"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary-fixed text-primary dark:bg-primary-container/20">
                      <span className="material-symbols-outlined text-[18px]">{step.icon}</span>
                    </span>
                    <span className="font-data-mono text-[11px] text-outline">{step.number}</span>
                  </div>
                  <h3 className="mt-6 text-[15px] font-semibold tracking-[-0.015em] text-on-surface">{step.title}</h3>
                  <p className="mt-2.5 text-[13px] leading-6 text-text-muted">{step.body}</p>
                </Reveal>
              ))}
            </div>

            <Reveal delay={0.1}>
              <div className="mt-6 grid gap-6 rounded-[22px] border border-border-low-alpha bg-surface-white p-8 sm:grid-cols-3 lg:p-10">
                {[
                  ["Runs on a schedule", "New leads are discovered and contacted on an ongoing cadence, not once."],
                  ["Day 0 · 3 · 7", "Each lead gets an opener and two follow-ups, all in one thread."],
                  ["Stops when they reply", "A detected reply cancels the remaining follow-ups automatically."],
                ].map(([title, body]) => (
                  <div key={title}>
                    <p className="text-[14px] font-semibold text-on-surface">{title}</p>
                    <p className="mt-2 text-[13px] leading-6 text-text-muted">{body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---- The Blueprint ---- */}
        <section className="bg-surface-white px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
              <Reveal>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">The blueprint</p>
                <h2 className="mt-5 max-w-xl text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  The AI learns your business before it writes a word.
                </h2>
                <p className="mt-6 max-w-xl text-[16px] leading-7 text-text-muted">
                  Generic AI copy reads like generic AI copy. So we start by building a blueprint: we read your
                  website, research your company live on the web, and ask you a short set of questions. Everything
                  the AI writes afterwards is grounded in that one document.
                </p>
                <div className="mt-8 space-y-5">
                  {[
                    ["Live web research", "We look beyond your homepage — recent news, reviews and reputation feed the brief."],
                    ["Your own words", "A free-text box where you explain the business in your language. It outranks everything else."],
                    ["Targeting rules", "The blueprint also defines who is not a fit, and that gate runs before any email is written."],
                    ["Grounded output", "The writer is instructed to never invent a claim, metric or testimonial that isn't in your blueprint."],
                  ].map(([title, body]) => (
                    <div
                      key={title}
                      className="-mx-3 grid grid-cols-[20px_1fr] gap-3 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-surface-container/60"
                    >
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
                <TiltCard>
                  <BlueprintWindow />
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---- Bulk Fire ---- */}
        <section id="bulk-fire" className="scroll-mt-24 border-y border-border-low-alpha bg-bg-cream px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
              <Reveal delay={0.08} className="lg:order-1">
                <TiltCard>
                  <BulkFireWindow />
                </TiltCard>
              </Reveal>

              <Reveal className="lg:order-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Bulk Fire</p>
                <h2 className="mt-5 max-w-xl text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  Already have the list? Fire at it.
                </h2>
                <p className="mt-6 max-w-xl text-[16px] leading-7 text-text-muted">
                  Bulk Fire is the manual counterpart to automated campaigns. Bring your own contacts, build a
                  sequence once, and send it across multiple mailboxes at a pace that keeps you out of spam
                  folders. No discovery, no qualification — you already know who you want.
                </p>
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  {[
                    ["upload_file", "Import in bulk", "Drop in a CSV and map your columns."],
                    ["swap_horiz", "Rotate senders", "Spread volume across several connected mailboxes."],
                    ["timeline", "Build the sequence", "An opener plus follow-ups, threaded together."],
                    ["chat", "WhatsApp channel", "Add WhatsApp Business alongside email on Scale."],
                  ].map(([icon, title, body]) => (
                    <div key={title} className="rounded-xl border border-border-low-alpha bg-surface-white p-5">
                      <span className="material-symbols-outlined text-[19px] text-primary">{icon}</span>
                      <p className="mt-3.5 text-[13px] font-semibold text-on-surface">{title}</p>
                      <p className="mt-1.5 text-[12px] leading-5 text-text-muted">{body}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---- Replies ---- */}
        <section className="bg-surface-white px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
              <Reveal>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Replies</p>
                <h2 className="mt-5 max-w-xl text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  The hard part is what happens after they answer.
                </h2>
                <p className="mt-6 max-w-xl text-[16px] leading-7 text-text-muted">
                  TalScout watches your sending mailbox for replies, drafts a response grounded in the same
                  blueprint, and puts it in front of you. You approve, edit or reject. Nothing is ever sent to a
                  real prospect without a person deciding.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-6 border-t border-border-low-alpha pt-7">
                  <div>
                    <p className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface">Human approval</p>
                    <p className="mt-1 text-[12px] text-text-muted">Required on every AI reply</p>
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface">Auto-stop</p>
                    <p className="mt-1 text-[12px] text-text-muted">Follow-ups cancel on reply</p>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <TiltCard>
                  <ReplyWindow />
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---- Deliverability ---- */}
        <section className="border-y border-border-low-alpha bg-bg-cream px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Sending &amp; deliverability</p>
              <div>
                <h2 className="max-w-3xl text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] text-on-surface sm:text-[44px]">
                  Cold email only works if it actually arrives.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-7 text-text-muted">
                  Volume is the easy part. Staying out of the spam folder is the whole game — so sending is
                  built around your own mailbox, paced like a person, and threaded like a real conversation.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 grid gap-px overflow-hidden rounded-[22px] border border-border-low-alpha bg-border-low-alpha sm:grid-cols-2 lg:grid-cols-4">
              {DELIVERABILITY.map((item, index) => (
                <Reveal key={item.title} delay={index * 0.05} className="h-full">
                  <SpotlightCard className="h-full bg-surface-white p-7 transition-transform duration-300 hover:z-10 hover:-translate-y-0.5">
                    <span className="material-symbols-outlined text-[21px] text-primary">{item.icon}</span>
                    <h3 className="mt-5 text-[14px] font-semibold text-on-surface">{item.title}</h3>
                    <p className="mt-2 text-[12px] leading-5 text-text-muted">{item.body}</p>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Talent (separate product) ---- */}
        <section id="talent" className="scroll-mt-24 bg-surface-white px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
              <Reveal>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Talent intelligence</p>
                <h2 className="mt-5 max-w-xl text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  Every résumé you own, finally searchable.
                </h2>
                <p className="mt-6 max-w-xl text-[16px] leading-7 text-text-muted">
                  Most candidate databases are a folder of PDFs nobody can query. TalScout reads every
                  document into a structured profile, then lets you find the right person by describing them
                  the way you would to a colleague — and tells you why each one matched.
                </p>
                <div className="mt-8 space-y-5">
                  {[
                    ["AI parsing with review", "PDF and DOCX in, structured profiles out — a recruiter confirms before it's saved."],
                    ["Search by meaning", "Two-stage retrieval and reranking, with a reason attached to every match."],
                    ["Shortlists", "Group the people worth moving forward and keep your team aligned."],
                    ["Bulk ingestion", "Stand up a whole database in minutes by dropping in your existing files."],
                  ].map(([title, body]) => (
                    <div
                      key={title}
                      className="-mx-3 grid grid-cols-[20px_1fr] gap-3 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-surface-container/60"
                    >
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
                <TiltCard>
                  <TalentWindow />
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---- AI Agent ---- */}
        <section id="agent" className="scroll-mt-24 border-y border-border-low-alpha bg-bg-cream px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
              <Reveal>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">AI Agent</p>
                <h2 className="mt-5 max-w-xl text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  Just tell it what you need. It takes it from there.
                </h2>
                <p className="mt-6 max-w-xl text-[16px] leading-7 text-text-muted">
                  One chat that runs both engines. Ask it to search candidates, build a blueprint, launch a
                  campaign, or connect Gmail, Calendar and Notion — it calls the same real tools you&apos;d click
                  through yourself, right from the conversation.
                </p>
                <div className="mt-8 space-y-5">
                  {AGENT_POINTS.map((point) => (
                    <div
                      key={point.title}
                      className="-mx-3 grid grid-cols-[20px_1fr] gap-3 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-surface-white/60"
                    >
                      <span className="material-symbols-outlined mt-0.5 text-[17px] text-primary">{point.icon}</span>
                      <div>
                        <p className="text-[14px] font-semibold text-on-surface">{point.title}</p>
                        <p className="mt-1 text-[13px] leading-5 text-text-muted">{point.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <TiltCard>
                  <AgentWindow />
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---- Trust ---- */}
        <section className="bg-primary-container px-6 py-24 text-on-primary-container dark:border-y dark:border-border-low-alpha dark:bg-surface dark:text-on-surface lg:px-8 lg:py-28">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary-fixed dark:text-primary">Built for trust</p>
                <h2 className="mt-5 max-w-md text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] sm:text-[42px]">
                  Your prospects and your candidates both deserve real guardrails.
                </h2>
              </div>
              <div className="grid gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 dark:border-outline-variant dark:bg-border-low-alpha sm:grid-cols-2">
                {TRUST_POINTS.map((point) => (
                  <SpotlightCard
                    key={point.title}
                    spotlightColor="var(--color-primary-fixed)"
                    className="bg-primary-container p-7 transition-transform duration-300 hover:z-10 hover:-translate-y-0.5 dark:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[21px] text-primary-fixed dark:text-primary">{point.icon}</span>
                    <h3 className="mt-5 text-[14px] font-semibold text-on-primary-container dark:text-on-surface">{point.title}</h3>
                    <p className="mt-2 text-[12px] leading-5 text-primary-fixed-dim dark:text-text-muted">{point.body}</p>
                  </SpotlightCard>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---- Pricing ---- */}
        <section id="pricing" className="scroll-mt-24 bg-surface-white px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <Reveal className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Straightforward pricing</p>
              <div>
                <h2 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.035em] text-on-surface sm:text-[46px]">
                  Choose the operating scale your team needs.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-7 text-text-muted">
                  Both engines are included on every plan. Higher tiers add send volume, more connected
                  mailboxes, more blueprints and campaigns, plus Bulk Fire and live web research.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 grid overflow-hidden rounded-[22px] border border-border-low-alpha lg:grid-cols-3">
              {PLAN_ORDER.map((id, index) => {
                const plan = PLANS[id];
                return (
                  <div
                    key={plan.id}
                    className={`relative overflow-hidden p-7 sm:p-8 ${
                      index < PLAN_ORDER.length - 1 ? "border-b border-border-low-alpha lg:border-b-0 lg:border-r" : ""
                    } ${
                      plan.recommended
                        ? "bg-primary-container text-on-primary-container dark:bg-surface-container-low dark:text-on-surface dark:ring-1 dark:ring-inset dark:ring-outline-variant"
                        : "bg-surface-white"
                    }`}
                  >
                    {plan.recommended && (
                      <BorderBeam size={100} duration={12} colorFrom="var(--color-primary-fixed)" colorTo="var(--color-primary-container)" />
                    )}
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
                      className={`mt-8 flex h-11 items-center justify-center rounded-xl text-[13px] font-semibold transition-all ${
                        plan.recommended
                          ? "bg-surface-white text-on-surface hover:bg-primary-fixed dark:bg-primary-container dark:text-on-primary-container dark:hover:brightness-110"
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

        {/* ---- FAQ ---- */}
        <section id="faq" className="scroll-mt-24 border-t border-border-low-alpha bg-bg-cream px-6 py-24 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[0.65fr_1.35fr]">
            <Reveal>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">FAQ</p>
              <h2 className="mt-5 text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] text-on-surface sm:text-[42px]">
                Questions worth answering.
              </h2>
              <p className="mt-5 max-w-sm text-[14px] leading-6 text-text-muted">
                Need a deeper product or deliverability conversation? Contact our team and we will walk through
                your setup.
              </p>
            </Reveal>
            <Reveal delay={0.06}>
              <LandingFaq />
            </Reveal>
          </div>
        </section>

        {/* ---- Closing CTA ---- */}
        <section className="bg-surface-white px-6 py-20 lg:px-8 lg:py-24">
          <Reveal className="relative mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-9 overflow-hidden rounded-[24px] bg-primary-container px-7 py-12 text-on-primary-container shadow-[0_32px_80px_-44px_rgba(15,118,110,0.75)] dark:border dark:border-outline-variant dark:bg-surface-container-low dark:text-on-surface dark:shadow-[0_28px_70px_-42px_rgba(0,0,0,0.9)] sm:px-10 lg:flex-row lg:items-center lg:px-14 lg:py-14">
            <BorderBeam size={120} duration={13} colorFrom="var(--color-primary-fixed)" colorTo="var(--color-primary-container)" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary-fixed dark:text-primary">Put both engines to work</p>
              <h2 className="mt-4 max-w-2xl text-[32px] font-semibold leading-[1.12] tracking-[-0.035em] sm:text-[40px]">
                Your next customer and your next hire are both already out there.
              </h2>
            </div>
            <Link
              href={primaryHref}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-surface-white px-6 text-[14px] font-semibold text-on-surface transition-all hover:bg-primary-fixed dark:bg-primary-container dark:text-on-primary-container dark:hover:brightness-110"
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
