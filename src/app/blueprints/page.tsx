"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { SpotlightCard } from "@/components/marketing/spotlight-card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface BlueprintSummary {
  id: string;
  name: string;
  websiteUrl: string | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
}

const STATUS_META: Record<
  BlueprintSummary["status"],
  { label: string; dot: string; chip: string }
> = {
  draft: {
    label: "Draft",
    dot: "bg-secondary-fixed-dim",
    chip: "brass-badge",
  },
  active: {
    label: "Active",
    dot: "bg-tertiary-fixed-dim",
    chip: "status-pill-active",
  },
  archived: {
    label: "Archived",
    dot: "bg-error",
    chip: "bg-error/10 text-error",
  },
};

function StatusPill({ status }: { status: BlueprintSummary["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md text-[12px] shadow-sm",
        meta.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export default function BlueprintsPage() {
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ blueprints: BlueprintSummary[] }>("/api/blueprints");
      setBlueprints(res.blueprints);
    } catch (err: any) {
      toast.error(err.message || "Failed to load blueprints");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <span>Blueprints</span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full">
          <section className="relative mb-10 flex flex-col gap-5 overflow-hidden rounded-[24px] bg-aurora-soft p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-tertiary-fixed/15 blur-3xl"
            />
            <div className="relative flex items-start gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-container to-primary text-on-primary shadow-floating sm:flex">
                <span className="material-symbols-outlined">description</span>
              </div>
              <div className="space-y-1.5">
                <h1 className="font-headline-lg text-headline-lg text-primary">Blueprints</h1>
                <p className="font-body-lg text-body-lg text-text-muted max-w-lg">
                  AI-generated business context — what you sell, who it&apos;s for, and
                  how to talk about it — that powers your outreach copy.
                </p>
              </div>
            </div>
            <Link
              href="/blueprints/new"
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary-container to-primary px-6 py-3 font-label-md text-label-md text-on-primary shadow-floating transition-all hover:-translate-y-0.5 active:scale-[0.97] sm:w-auto"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              New blueprint
            </Link>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
            <Link
              href="/blueprints/new"
              className="group relative flex min-h-[200px] flex-col items-center justify-center space-y-4 overflow-hidden rounded-[20px] border-2 border-dashed border-border-low-alpha bg-surface-white/40 p-8 text-center backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-tertiary-fixed-dim/50 hover:bg-white/70 hover:shadow-floating"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-tertiary-fixed/15 blur-2xl transition-opacity group-hover:opacity-100"
              />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-tertiary-fixed/40 to-tertiary-fixed/10 text-primary transition-transform duration-300 group-hover:scale-110">
                <span className="material-symbols-outlined text-[32px]">add</span>
              </div>
              <div className="relative">
                <h4 className="font-headline-md text-[18px] text-on-surface">New blueprint</h4>
                <p className="mt-1 font-label-md text-label-md text-text-muted">
                  Enter a website and let AI draft the context
                </p>
              </div>
            </Link>

            {loading ? (
              <div className="col-span-1 flex min-h-[200px] items-center justify-center gap-2 font-body-md text-text-muted md:col-span-1 xl:col-span-2">
                <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                Loading blueprints...
              </div>
            ) : (
              blueprints.map((b) => (
                <SpotlightCard
                  key={b.id}
                  className="group flex min-h-[200px] flex-col justify-between rounded-[20px] glass-card p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-floating"
                >
                  <Link href={`/blueprints/${b.id}`} className="flex h-full flex-col justify-between p-6">
                    <div>
                      <div className="mb-4 flex items-start justify-between">
                        <div className="rounded-xl bg-gradient-to-br from-primary-container to-primary p-2 text-on-primary shadow-sm">
                          <span className="material-symbols-outlined">description</span>
                        </div>
                        <StatusPill status={b.status} />
                      </div>
                      <h3 className="mb-1 font-headline-md text-[18px] leading-snug text-on-surface transition-colors group-hover:text-primary">
                        {b.name}
                      </h3>
                      {b.websiteUrl && (
                        <p className="flex items-center gap-1.5 font-body-md text-body-md text-text-muted">
                          <span className="material-symbols-outlined text-[16px] shrink-0">language</span>
                          <span className="truncate">{b.websiteUrl.replace(/^https?:\/\//, "")}</span>
                        </p>
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-border-low-alpha pt-4">
                      <span className="font-data-mono text-[12px] text-text-muted">
                        {new Date(b.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="material-symbols-outlined text-[20px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        arrow_forward
                      </span>
                    </div>
                  </Link>
                </SpotlightCard>
              ))
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
