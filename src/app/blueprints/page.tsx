"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
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
    dot: "bg-outline",
    chip: "bg-surface-container-high text-on-surface-variant",
  },
  active: {
    label: "Active",
    dot: "bg-tertiary-container",
    chip: "bg-tertiary-fixed/25 text-tertiary-container",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md text-[12px]",
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
          <section className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary sm:flex">
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-label-md text-label-md text-white transition-all duration-300 hover:shadow-lg active:scale-[0.98] sm:w-auto"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              New blueprint
            </Link>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
            <Link
              href="/blueprints/new"
              className="group flex min-h-[200px] flex-col items-center justify-center space-y-4 rounded-[20px] border-2 border-dashed border-border-low-alpha p-8 text-center transition-all duration-300 hover:border-primary/30 hover:bg-white/50"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-low transition-colors group-hover:bg-primary/10">
                <span className="material-symbols-outlined text-[32px] text-primary">add</span>
              </div>
              <div>
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
                <Link
                  key={b.id}
                  href={`/blueprints/${b.id}`}
                  className="group flex min-h-[200px] flex-col justify-between rounded-[20px] border border-border-low-alpha bg-white p-6 ambient-shadow transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div>
                    <div className="mb-4 flex items-start justify-between">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
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
              ))
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
