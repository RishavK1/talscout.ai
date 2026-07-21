"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { SpotlightCard } from "@/components/marketing/spotlight-card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AutomatedCampaign {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed" | "error";
  blueprintId: string;
  discoveryQuery: { category: string };
  replyPollingEnabled: boolean;
  errorReason: string | null;
  createdAt: string;
}

const STATUS_META: Record<
  AutomatedCampaign["status"],
  { label: string; dot: string; chip: string }
> = {
  draft: {
    label: "Draft",
    dot: "bg-outline",
    chip: "bg-surface-container-high text-on-surface-variant border border-border-low-alpha",
  },
  active: {
    label: "Active",
    dot: "bg-tertiary-container",
    chip: "status-pill-active border border-tertiary-fixed/40 shadow-sm",
  },
  paused: {
    label: "Paused",
    dot: "bg-on-secondary-container",
    chip: "status-pill-invited border border-secondary-fixed-dim/40 shadow-sm",
  },
  completed: {
    label: "Completed",
    dot: "bg-outline",
    chip: "bg-surface-container-high text-on-surface-variant border border-border-low-alpha",
  },
  error: {
    label: "Error",
    dot: "bg-error",
    chip: "bg-error-container text-on-error-container border border-error/20 shadow-sm",
  },
};

function StatusPill({ status }: { status: AutomatedCampaign["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md text-[12px] font-medium",
        meta.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export default function AutomatedOutreachPage() {
  const [campaigns, setCampaigns] = useState<AutomatedCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ campaigns: AutomatedCampaign[] }>("/api/automated-campaigns");
      setCampaigns(res.campaigns);
    } catch (err: any) {
      toast.error(err.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (c: AutomatedCampaign) => {
    setBusyId(c.id);
    try {
      const action = c.status === "active" ? "pause" : "resume";
      await api.post(`/api/automated-campaigns/${c.id}/${action}`);
      toast.success(action === "pause" ? "Campaign paused" : "Campaign activated");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update campaign");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <span>Automated Outreach</span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full">
          <section className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-container to-primary text-on-primary shadow-floating sm:flex">
                <span className="material-symbols-outlined">auto_awesome</span>
              </div>
              <div className="space-y-1.5">
                <h1 className="font-headline-lg text-headline-lg text-gradient-teal">
                  Automated Outreach
                </h1>
                <p className="font-body-lg text-body-lg text-text-muted max-w-lg">
                  Campaigns that discover leads, find their emails, and write &amp;
                  send outreach on their own — capped at 50 emails/day, replies
                  always reviewed by you first.
                </p>
              </div>
            </div>
            <Link
              href="/automated-outreach/new"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-6 py-3 font-label-md text-label-md text-on-primary shadow-floating transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary active:scale-[0.97] sm:w-auto"
            >
              <span className="material-symbols-outlined text-[20px] transition-transform group-hover:rotate-90">add_circle</span>
              New campaign
            </Link>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
            <Link
              href="/automated-outreach/new"
              className="group relative flex min-h-[210px] flex-col items-center justify-center space-y-4 overflow-hidden rounded-[20px] border-2 border-dashed border-border-low-alpha p-8 text-center transition-all duration-300 hover:border-tertiary-fixed-dim/50 hover:bg-white/50"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-tertiary-fixed/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 opacity-0" />
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-low transition-colors group-hover:bg-gradient-to-br group-hover:from-primary-container group-hover:to-primary">
                <span className="material-symbols-outlined text-[32px] text-primary transition-colors group-hover:text-on-primary">add</span>
              </div>
              <div>
                <h4 className="font-headline-md text-[18px] text-on-surface">New campaign</h4>
                <p className="mt-1 font-label-md text-label-md text-text-muted">
                  Pick a Blueprint and a discovery target
                </p>
              </div>
            </Link>

            {loading ? (
              <div className="col-span-1 flex min-h-[210px] items-center justify-center gap-2 font-body-md text-text-muted md:col-span-1 xl:col-span-2">
                <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                Loading campaigns...
              </div>
            ) : (
              campaigns.map((c, i) => {
                const iconChipClasses = [
                  "bg-gradient-to-br from-primary-container to-primary text-on-primary",
                  "bg-tertiary-fixed text-on-tertiary-fixed",
                  "bg-secondary-fixed text-on-secondary-fixed",
                ][i % 3];
                return (
                  <SpotlightCard
                    key={c.id}
                    className="group flex min-h-[210px] flex-col justify-between rounded-[20px] glass-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-floating"
                  >
                    <div>
                      <div className="mb-4 flex items-start justify-between">
                        <div className={cn("rounded-xl p-2 shadow-sm", iconChipClasses)}>
                          <span className="material-symbols-outlined">auto_awesome</span>
                        </div>
                        <StatusPill status={c.status} />
                      </div>
                      <Link
                        href={`/automated-outreach/${c.id}`}
                        className="mb-2 block font-headline-md text-[18px] leading-snug text-on-surface transition-colors hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body-md text-body-md text-text-muted">
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">category</span>
                          {c.discoveryQuery.category}
                        </span>
                        {c.replyPollingEnabled && (
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">forum</span>
                            Reply polling
                          </span>
                        )}
                      </div>
                      {c.errorReason && (
                        <p className="mt-2 line-clamp-2 font-body-md text-[12px] text-error">
                          {c.errorReason}
                        </p>
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-border-low-alpha pt-4">
                      <span className="font-data-mono text-[12px] text-text-muted">
                        {new Date(c.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {(c.status === "active" || c.status === "paused" || c.status === "draft") && (
                        <button
                          type="button"
                          onClick={() => toggle(c)}
                          disabled={busyId === c.id}
                          className="inline-flex items-center gap-1 rounded-full border border-primary-container/30 px-3 py-1.5 font-label-md text-[12px] text-primary transition-all hover:-translate-y-0.5 hover:bg-primary-container/10 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {busyId === c.id ? "sync" : c.status === "active" ? "pause" : "play_arrow"}
                          </span>
                          {c.status === "active" ? "Pause" : "Activate"}
                        </button>
                      )}
                    </div>
                  </SpotlightCard>
                );
              })
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
