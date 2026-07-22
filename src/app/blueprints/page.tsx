"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { SpotlightCard } from "@/components/marketing/spotlight-card";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";

interface BlueprintSummary {
  id: string;
  name: string;
  websiteUrl: string | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
}

const STATUS_META: Record<
  BlueprintSummary["status"],
  { label: string; tone: NonNullable<StatusBadgeProps["tone"]> }
> = {
  draft: { label: "Draft", tone: "draft" },
  active: { label: "Active", tone: "active" },
  archived: { label: "Archived", tone: "error" },
};

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
          <Card className="mb-10 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
            <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container sm:flex">
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
              <Button asChild variant="gradient" size="lg" className="w-full justify-center sm:w-auto">
                <Link href="/blueprints/new">
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                  New blueprint
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
            <Link
              href="/blueprints/new"
              className="group flex min-h-[200px] flex-col items-center justify-center space-y-4 rounded-xl border-2 border-dashed border-border-low-alpha bg-surface-white p-8 text-center transition-colors hover:border-primary-container/50 hover:bg-surface-container-low"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-container/10 text-primary-container">
                <span className="material-symbols-outlined text-[32px]">add</span>
              </div>
              <div>
                <h4 className="font-sans font-semibold text-[18px] text-on-surface">New blueprint</h4>
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
              blueprints.map((b) => {
                const meta = STATUS_META[b.status];
                return (
                  <SpotlightCard key={b.id} className="h-full">
                    <Card className="h-full flex flex-col justify-between border border-border-low-alpha bg-surface-white p-0 [--card-spacing:--spacing(0)] transition-colors hover:border-primary-container/50">
                      <Link href={`/blueprints/${b.id}`} className="flex h-full flex-col justify-between p-6">
                        <div>
                          <div className="mb-4 flex items-start justify-between">
                            <div className="rounded-xl bg-primary-container/10 p-2 text-primary-container">
                              <span className="material-symbols-outlined">description</span>
                            </div>
                            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                          </div>
                          <h3 className="mb-1 font-sans font-semibold text-[18px] leading-snug text-on-surface transition-colors group-hover:text-primary">
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
                    </Card>
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
