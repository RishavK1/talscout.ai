"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CirclePlus, Loader2, Pause, Play, Megaphone } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeletons";
import { Reveal } from "@/components/motion/reveal";

interface AutomatedCampaign {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed" | "error";
  blueprintId: string;
  discoveryQuery: { category: string; location?: { text: string } | { lat: number; lon: number } };
  replyPollingEnabled: boolean;
  errorReason: string | null;
  lastDiscoveryRunAt: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<AutomatedCampaign["status"], NonNullable<StatusBadgeProps["tone"]>> = {
  draft: "draft",
  active: "active",
  paused: "invited",
  completed: "neutral",
  error: "error",
};

const STATUS_LABEL: Record<AutomatedCampaign["status"], string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  error: "Error",
};

function locationLabel(loc?: AutomatedCampaign["discoveryQuery"]["location"]): string {
  if (!loc) return "—";
  return "text" in loc ? loc.text : `${loc.lat}, ${loc.lon}`;
}

export default function AutomatedOutreachPage() {
  const router = useRouter();
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

  const columns: DataTableColumn<AutomatedCampaign>[] = [
    {
      key: "name",
      header: "Name",
      render: (c) => (
        <div className="min-w-0">
          <span className="block truncate font-body-md text-[14px] font-medium text-on-surface">{c.name}</span>
          <span className="mt-0.5 block font-data-mono text-[11px] text-on-surface-variant">
            Created {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (c) => (
        <div className="flex flex-wrap items-center gap-1.5 font-body-md text-[13px] text-on-surface-variant">
          <span className="rounded-md border border-border-low-alpha bg-surface-container-low/70 px-2 py-1">
            {c.discoveryQuery.category}
          </span>
          <span className="rounded-md border border-border-low-alpha bg-surface-container-low/70 px-2 py-1">
            {locationLabel(c.discoveryQuery.location)}
          </span>
          {c.replyPollingEnabled && (
            <span className="rounded-md border border-border-low-alpha bg-surface-container-low/70 px-2 py-1">
              Reply polling
            </span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <div>
          <StatusBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusBadge>
          {c.errorReason && (
            <p className="mt-1 max-w-[220px] truncate font-body-md text-[12px] text-error">{c.errorReason}</p>
          )}
        </div>
      ),
    },
    {
      key: "lastRun",
      header: "Last run",
      render: (c) => (
        <span className="font-data-mono text-[12px] text-on-surface-variant">
          {c.lastDiscoveryRunAt
            ? new Date(c.lastDiscoveryRunAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-32",
      render: (c) =>
        c.status === "active" || c.status === "paused" || c.status === "draft" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              toggle(c);
            }}
            disabled={busyId === c.id}
          >
            {busyId === c.id ? (
              <Loader2 className="size-[16px] animate-spin" />
            ) : c.status === "active" ? (
              <Pause className="size-[16px]" />
            ) : (
              <Play className="size-[16px]" />
            )}
            {c.status === "active" ? "Pause" : "Activate"}
          </Button>
        ) : null,
    },
  ];

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
        <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-12">
          <Reveal>
          <section className="rounded-xl border border-border-low-alpha bg-surface-white p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="mb-2 font-label-md text-[12px] uppercase tracking-[0.16em] text-on-surface-variant">
                  Automated outreach
                </p>
                <h1 className="font-headline-lg text-[28px] leading-tight text-primary sm:text-headline-lg">
                  Campaigns
                </h1>
                <p className="mt-2 max-w-2xl font-body-md text-[14px] leading-6 text-on-surface-variant">
                  Discover leads, find emails, and send paced outreach with replies reviewed before follow-up.
                </p>
              </div>
              <Button asChild variant="gradient" size="lg" className="w-full justify-center sm:w-auto">
                <Link href="/automated-outreach/new">
                  <CirclePlus className="size-[20px]" />
                  New campaign
                </Link>
              </Button>
            </div>
          </section>
          </Reveal>

          <Reveal delay={0.05}>
          <Card className="overflow-hidden rounded-xl border-border-low-alpha bg-surface-white py-0">
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={5} columns={3} />
              ) : (
                <DataTable
                  columns={columns}
                  rows={campaigns}
                  getRowKey={(c) => c.id}
                  onRowClick={(c) => router.push(`/automated-outreach/${c.id}`)}
                  mobileCard={(c) => (
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-body-md text-[15px] font-semibold text-on-surface">
                            {c.name}
                          </div>
                          <div className="mt-1 font-data-mono text-[11px] text-on-surface-variant">
                            Last run{" "}
                            {c.lastDiscoveryRunAt
                              ? new Date(c.lastDiscoveryRunAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "never"}
                          </div>
                        </div>
                        <StatusBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusBadge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 font-body-md text-[12px] text-on-surface-variant">
                        <span className="rounded-md border border-border-low-alpha bg-surface-container-low/70 px-2 py-1">
                          {c.discoveryQuery.category}
                        </span>
                        <span className="rounded-md border border-border-low-alpha bg-surface-container-low/70 px-2 py-1">
                          {locationLabel(c.discoveryQuery.location)}
                        </span>
                        {c.replyPollingEnabled && (
                          <span className="rounded-md border border-border-low-alpha bg-surface-container-low/70 px-2 py-1">
                            Reply polling
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  emptyState={
                    <div className="flex flex-col items-center gap-3">
                      <Megaphone className="size-[32px] text-outline" />
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        No campaigns yet. Pick a Blueprint and a discovery target to get started.
                      </p>
                      <Button asChild variant="gradient">
                        <Link href="/automated-outreach/new">New campaign</Link>
                      </Button>
                    </div>
                  }
                />
              )}
            </CardContent>
          </Card>
          </Reveal>
        </main>
      </div>
    </AppShell>
  );
}
