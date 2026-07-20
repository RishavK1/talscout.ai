"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

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
  emailSource: "site_scrape" | "hunter" | "apollo" | "google_places" | "osm" | "none";
  status: "discovered" | "ready" | "queued" | "sent" | "replied" | "failed" | "skipped";
  discoveredAt: string;
}

const CAMPAIGN_STATUS_META: Record<
  AutomatedCampaign["status"],
  { label: string; dot: string; chip: string }
> = {
  draft: { label: "Draft", dot: "bg-outline", chip: "bg-surface-container-high text-on-surface-variant" },
  active: { label: "Active", dot: "bg-tertiary-container", chip: "bg-tertiary-fixed/25 text-tertiary-container" },
  paused: { label: "Paused", dot: "bg-on-secondary-container", chip: "bg-secondary-fixed/25 text-on-secondary-container" },
  completed: { label: "Completed", dot: "bg-outline", chip: "bg-surface-container-high text-on-surface-variant" },
  error: { label: "Error", dot: "bg-error", chip: "bg-error/10 text-error" },
};

const LEAD_STATUS_META: Record<
  AutomatedLead["status"],
  { label: string; dot: string; chip: string }
> = {
  discovered: { label: "Discovered", dot: "bg-outline", chip: "bg-surface-container-high text-on-surface-variant" },
  ready: { label: "Ready", dot: "bg-on-secondary-container", chip: "bg-secondary-fixed/25 text-on-secondary-container" },
  queued: { label: "Queued", dot: "bg-on-secondary-container", chip: "bg-secondary-fixed/25 text-on-secondary-container" },
  sent: { label: "Sent", dot: "bg-tertiary-container", chip: "bg-tertiary-fixed/25 text-tertiary-container" },
  replied: { label: "Replied", dot: "bg-tertiary-container", chip: "bg-tertiary-fixed/40 text-tertiary-container" },
  failed: { label: "Failed", dot: "bg-error", chip: "bg-error/10 text-error" },
  skipped: { label: "Skipped", dot: "bg-outline", chip: "bg-surface-container-high text-on-surface-variant" },
};

const SOURCE_META: Record<AutomatedLead["emailSource"], { label: string; icon: string }> = {
  site_scrape: { label: "Website", icon: "language" },
  hunter: { label: "Hunter.io", icon: "person_search" },
  apollo: { label: "Apollo.io", icon: "person_search" },
  google_places: { label: "Google Places", icon: "map" },
  osm: { label: "Map listing", icon: "map" },
  none: { label: "—", icon: "remove" },
};

function LeadStatusPill({ status }: { status: AutomatedLead["status"] }) {
  const meta = LEAD_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md text-[12px] whitespace-nowrap",
        meta.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function MetaChip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-low-alpha bg-white px-3 py-1.5 font-label-md text-[12px] text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px] text-primary">{icon}</span>
      {children}
    </span>
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

  const statusMeta = CAMPAIGN_STATUS_META[campaign.status];
  const locationLabel =
    "text" in campaign.discoveryQuery.location
      ? campaign.discoveryQuery.location.text
      : `${campaign.discoveryQuery.location.lat}, ${campaign.discoveryQuery.location.lon}`;

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
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md text-[12px]",
                    statusMeta.chip,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                  {statusMeta.label}
                </span>
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
              <button
                type="button"
                onClick={toggleCampaign}
                disabled={busy}
                className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-border-low-alpha bg-white px-5 py-2.5 font-label-md text-label-md text-primary transition-colors hover:bg-surface-container-low disabled:opacity-50 sm:w-auto"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {busy ? "sync" : campaign.status === "active" ? "pause" : "play_arrow"}
                </span>
                {campaign.status === "active" ? "Pause campaign" : "Activate campaign"}
              </button>
            )}
          </section>

          <section className="overflow-hidden rounded-[20px] border border-border-low-alpha bg-white ambient-shadow">
            <div className="flex flex-col gap-3 border-b border-border-low-alpha p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <h3 className="font-headline-md text-headline-md text-primary">
                Leads{!loading && leads.length > 0 && (
                  <span className="ml-2 font-label-md text-[13px] text-text-muted">
                    {leads.length}
                  </span>
                )}
              </h3>
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
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="bg-bg-cream/50">
                    <th className="w-10 p-4">
                      <input
                        type="checkbox"
                        checked={selected.size > 0 && selected.size === leads.length}
                        onChange={() =>
                          setSelected(
                            selected.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)),
                          )
                        }
                      />
                    </th>
                    <th className="p-4 font-label-md text-label-md font-medium text-outline">Business</th>
                    <th className="p-4 font-label-md text-label-md font-medium text-outline">Contact</th>
                    <th className="p-4 font-label-md text-label-md font-medium text-outline">Source</th>
                    <th className="p-4 font-label-md text-label-md font-medium text-outline">Location</th>
                    <th className="p-4 font-label-md text-label-md font-medium text-outline">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                        Loading leads...
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                        No leads yet — the next scheduled run will discover some.
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="border-b border-border-low-alpha transition-colors hover:bg-surface-container-lowest"
                      >
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                          />
                        </td>
                        <td className="p-4 font-body-md text-body-md font-medium text-on-surface">
                          {lead.businessName}
                        </td>
                        <td className="p-4 font-data-mono text-[13px] text-on-surface-variant">
                          {lead.email ?? "—"}
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1.5 font-body-md text-body-md text-on-surface-variant">
                            <span className="material-symbols-outlined text-[16px] text-primary/70">
                              {SOURCE_META[lead.emailSource].icon}
                            </span>
                            {SOURCE_META[lead.emailSource].label}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate p-4 font-body-md text-body-md text-on-surface-variant">
                          {lead.addressText ?? "—"}
                        </td>
                        <td className="p-4">
                          <LeadStatusPill status={lead.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="divide-y divide-border-low-alpha md:hidden">
              {loading ? (
                <div className="p-8 text-center font-body-md text-on-surface-variant">
                  Loading leads...
                </div>
              ) : leads.length === 0 ? (
                <div className="p-8 text-center font-body-md text-on-surface-variant">
                  No leads yet — the next scheduled run will discover some.
                </div>
              ) : (
                leads.map((lead) => (
                  <div key={lead.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate font-body-md text-body-md font-medium text-on-surface">
                        {lead.businessName}
                      </span>
                      <LeadStatusPill status={lead.status} />
                    </div>
                    {lead.email && (
                      <div className="flex items-center gap-1.5 font-data-mono text-[13px] text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-primary/70">mail</span>
                        <span className="truncate">{lead.email}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-label-md text-[12px] text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          {SOURCE_META[lead.emailSource].icon}
                        </span>
                        {SOURCE_META[lead.emailSource].label}
                      </span>
                      {lead.addressText && (
                        <span className="min-w-0 truncate">{lead.addressText}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
