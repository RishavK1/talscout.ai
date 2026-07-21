"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

interface AutomatedCampaign {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed" | "error";
  discoveryQuery: { category: string; location: { text: string } | { lat: number; lon: number } };
  replyPollingEnabled: boolean;
  lastDiscoveryRunAt: string | null;
  lastReplyPollAt: string | null;
  errorReason: string | null;
}

interface AutomatedLead {
  id: string;
  businessName: string;
  category: string | null;
  addressText: string | null;
  email: string | null;
  emailSource: "site_scrape" | "hunter" | "apollo" | "google_places" | "osm" | "firecrawl" | "snov" | "none";
  status: "discovered" | "ready" | "queued" | "sent" | "replied" | "failed" | "skipped";
  discoveredAt: string;
}

const CAMPAIGN_STATUS_TONE: Record<AutomatedCampaign["status"], NonNullable<StatusBadgeProps["tone"]>> = {
  draft: "draft",
  active: "active",
  paused: "invited",
  completed: "neutral",
  error: "error",
};

const CAMPAIGN_STATUS_LABEL: Record<AutomatedCampaign["status"], string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  error: "Error",
};

const LEAD_STATUS_TONE: Record<Exclude<AutomatedLead["status"], "replied">, NonNullable<StatusBadgeProps["tone"]>> = {
  discovered: "neutral",
  ready: "brass",
  queued: "invited",
  sent: "active",
  failed: "error",
  skipped: "neutral",
};

const LEAD_STATUS_LABEL: Record<AutomatedLead["status"], string> = {
  discovered: "Discovered",
  ready: "Ready",
  queued: "Queued",
  sent: "Sent",
  replied: "Replied",
  failed: "Failed",
  skipped: "Skipped",
};

const SOURCE_META: Record<
  AutomatedLead["emailSource"],
  { label: string; icon: string; badge: string }
> = {
  site_scrape: { label: "Website", icon: "language", badge: "bg-primary/10 text-primary border border-primary/20" },
  hunter: { label: "Hunter.io", icon: "person_search", badge: "brass-badge" },
  apollo: { label: "Apollo.io", icon: "person_search", badge: "status-pill-active border border-tertiary-fixed/30" },
  google_places: { label: "Google Places", icon: "map", badge: "bg-secondary-fixed/25 text-on-secondary-container border border-secondary-fixed-dim/30" },
  osm: { label: "Map listing", icon: "map", badge: "bg-tertiary-fixed/20 text-tertiary-container border border-tertiary-fixed-dim/30" },
  firecrawl: { label: "Firecrawl", icon: "travel_explore", badge: "bg-primary text-on-primary border border-primary" },
  snov: { label: "Snov.io", icon: "alternate_email", badge: "bg-secondary-fixed-dim/20 text-on-secondary-fixed-variant border border-secondary-fixed-dim/40" },
  none: { label: "—", icon: "remove", badge: "bg-surface-container-high text-on-surface-variant border border-border-low-alpha" },
};

function LeadStatusPill({ status }: { status: AutomatedLead["status"] }) {
  if (status === "replied") {
    // Deliberate distinct treatment for the best-outcome status — a flat
    // solid tone instead of the rest of the scale's light tint, so it stands
    // out from the rest of the scale without a gradient.
    return (
      <StatusBadge
        tone="active"
        dot={false}
        className="gap-1.5 border-transparent bg-tertiary-fixed text-on-tertiary-fixed"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-on-tertiary-fixed" />
        {LEAD_STATUS_LABEL.replied}
      </StatusBadge>
    );
  }
  return <StatusBadge tone={LEAD_STATUS_TONE[status]}>{LEAD_STATUS_LABEL[status]}</StatusBadge>;
}

function SourceBadge({ source }: { source: AutomatedLead["emailSource"] }) {
  const meta = SOURCE_META[source];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-label-md font-medium", meta.badge)}
    >
      <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
      {meta.label}
    </Badge>
  );
}

function MetaChip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="h-auto gap-1.5 rounded-full border-border-low-alpha bg-surface-container-low px-3 py-1.5 text-[12px] font-label-md text-on-surface-variant"
    >
      <span className="material-symbols-outlined text-[16px] text-primary">{icon}</span>
      {children}
    </Badge>
  );
}

export default function AutomatedCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<AutomatedCampaign | null>(null);
  const [leads, setLeads] = useState<AutomatedLead[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      setLoading(true);
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const [c, l] = await Promise.all([
        api.get<AutomatedCampaign>(`/api/automated-campaigns/${id}`),
        api.get<{ leads: AutomatedLead[] }>(`/api/automated-campaigns/${id}/leads${qs}`),
      ]);
      setCampaign(c);
      setLeads(l.leads);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, statusFilter]);

  const toggleCampaign = async () => {
    if (!campaign) return;
    setBusy(true);
    try {
      const action = campaign.status === "active" ? "pause" : "resume";
      await api.post(`/api/automated-campaigns/${id}/${action}`);
      toast.success(action === "pause" ? "Campaign paused" : "Campaign activated");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update campaign");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (leadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  if (loading && !campaign) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-primary text-[32px]">sync</span>
        </div>
      </AppShell>
    );
  }

  if (!campaign) {
    return (
      <AppShell>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <p className="font-body-md text-text-muted">Campaign not found.</p>
          <Link href="/automated-outreach" className="text-primary font-label-md hover:underline">
            Back to Automated Outreach
          </Link>
        </div>
      </AppShell>
    );
  }

  const locationLabel =
    "text" in campaign.discoveryQuery.location
      ? campaign.discoveryQuery.location.text
      : `${campaign.discoveryQuery.location.lat}, ${campaign.discoveryQuery.location.lon}`;

  const leadColumns: DataTableColumn<AutomatedLead>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          checked={leads.length > 0 && selected.size === leads.length}
          onChange={() =>
            setSelected(selected.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)))
          }
        />
      ),
      headerClassName: "w-10",
      cellClassName: "w-10",
      render: (lead) => (
        <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
      ),
    },
    {
      key: "business",
      header: "Business",
      render: (lead) => (
        <span className="font-body-md text-body-md font-medium text-on-surface">{lead.businessName}</span>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (lead) => (
        <span className="font-data-mono text-[13px] text-on-surface-variant">{lead.email ?? "—"}</span>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (lead) => <SourceBadge source={lead.emailSource} />,
    },
    {
      key: "location",
      header: "Location",
      render: (lead) => (
        <span className="block max-w-[220px] truncate text-on-surface-variant">{lead.addressText ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (lead) => <LeadStatusPill status={lead.status} />,
    },
  ];

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <Link href="/automated-outreach" className="hover:text-primary transition-colors">
                Automated Outreach
              </Link>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
              <span className="text-on-surface font-medium truncate max-w-[200px]">
                {campaign.name}
              </span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1200px] mx-auto w-full">
          <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h1 className="font-headline-lg text-headline-lg text-primary">{campaign.name}</h1>
                <StatusBadge tone={CAMPAIGN_STATUS_TONE[campaign.status]}>
                  {CAMPAIGN_STATUS_LABEL[campaign.status]}
                </StatusBadge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MetaChip icon="category">{campaign.discoveryQuery.category}</MetaChip>
                <MetaChip icon="location_on">{locationLabel}</MetaChip>
                {campaign.replyPollingEnabled && <MetaChip icon="forum">Reply polling</MetaChip>}
                {campaign.lastDiscoveryRunAt && (
                  <MetaChip icon="schedule">
                    Last run{" "}
                    {new Date(campaign.lastDiscoveryRunAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </MetaChip>
                )}
              </div>
              {campaign.errorReason && (
                <p className="mt-3 font-body-md text-[13px] text-error">{campaign.errorReason}</p>
              )}
            </div>
            {(campaign.status === "active" || campaign.status === "paused" || campaign.status === "draft") && (
              <Button
                type="button"
                variant="outline"
                onClick={toggleCampaign}
                disabled={busy}
                className="w-full shrink-0 sm:w-auto"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {busy ? "sync" : campaign.status === "active" ? "pause" : "play_arrow"}
                </span>
                {campaign.status === "active" ? "Pause campaign" : "Activate campaign"}
              </Button>
            )}
          </section>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border-low-alpha">
              <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                Leads
                {!loading && leads.length > 0 && (
                  <span className="ml-2 font-label-md text-[13px] font-normal text-text-muted">
                    {leads.length}
                  </span>
                )}
              </CardTitle>
              <CardAction>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-label-md text-label-md focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All statuses</option>
                  <option value="discovered">Discovered</option>
                  <option value="ready">Ready</option>
                  <option value="queued">Queued</option>
                  <option value="sent">Sent</option>
                  <option value="replied">Replied</option>
                  <option value="failed">Failed</option>
                </select>
              </CardAction>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={leadColumns}
                rows={leads}
                getRowKey={(lead) => lead.id}
                emptyState={
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {loading ? "Loading leads..." : "No leads yet — the next scheduled run will discover some."}
                  </span>
                }
              />
            </CardContent>
          </Card>
        </main>
      </div>
    </AppShell>
  );
}
