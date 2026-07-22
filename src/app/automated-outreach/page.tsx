"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeletons";

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
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
          </div>
          <span className="font-body-md text-[14px] font-medium text-on-surface">{c.name}</span>
        </div>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (c) => (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body-md text-[13px] text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">category</span>
            {c.discoveryQuery.category}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">location_on</span>
            {locationLabel(c.discoveryQuery.location)}
          </span>
          {c.replyPollingEnabled && (
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">forum</span>
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
            <span className="material-symbols-outlined text-[16px]">
              {busyId === c.id ? "sync" : c.status === "active" ? "pause" : "play_arrow"}
            </span>
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
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full">
          <Card className="mb-6 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
            <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container sm:flex">
                  <span className="material-symbols-outlined">auto_awesome</span>
                </div>
                <div className="space-y-1.5">
                  <h1 className="font-headline-lg text-headline-lg text-primary">
                    Automated Outreach
                  </h1>
                  <p className="font-body-lg text-body-lg text-text-muted max-w-lg">
                    Campaigns that discover leads, find their emails, and write &amp;
                    send outreach on their own — capped at 50 emails/day, replies
                    always reviewed by you first.
                  </p>
                </div>
              </div>
              <Button asChild variant="gradient" size="lg" className="w-full justify-center sm:w-auto">
                <Link href="/automated-outreach/new">
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                  New campaign
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={5} columns={3} />
              ) : (
                <DataTable
                  columns={columns}
                  rows={campaigns}
                  getRowKey={(c) => c.id}
                  onRowClick={(c) => router.push(`/automated-outreach/${c.id}`)}
                  emptyState={
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-outline text-[32px]">auto_awesome</span>
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
        </main>
      </div>
    </AppShell>
  );
}
