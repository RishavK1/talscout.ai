"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { useAuth } from "@/components/app/auth-provider";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/skeletons";

const LeadEmailsModal = dynamic(() => import("./lead-emails-modal"), { ssr: false });

interface AutomatedCampaign {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed" | "error";
  discoveryQuery: { category: string; location: { text: string } | { lat: number; lon: number } };
  maxLeadsPerRun: number;
  replyPollingEnabled: boolean;
  lastDiscoveryRunAt: string | null;
  lastReplyPollAt: string | null;
  errorReason: string | null;
}

const LEADS_PAGE_SIZE = 10;

/** Compact page-number list with ellipses, e.g. [1, "…", 4, 5, 6, "…", 20] —
 *  ported from Bulk Fire's leads table (src/app/outreach/bulk-fire/[id]/page.tsx)
 *  so both tables share the same pagination affordance. */
function paginationRange(current: number, total: number): (number | "…")[] {
  const delta = 1;
  const pages: number[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    }
  }
  const withDots: (number | "…")[] = [];
  let last: number | undefined;
  for (const p of pages) {
    if (last !== undefined) {
      if (p - last === 2) withDots.push(last + 1);
      else if (p - last !== 1) withDots.push("…");
    }
    withDots.push(p);
    last = p;
  }
  return withDots;
}

interface AutomatedLead {
  id: string;
  businessName: string;
  category: string | null;
  addressText: string | null;
  email: string | null;
  emailSource: "site_scrape" | "hunter" | "apollo" | "google_places" | "osm" | "firecrawl" | "snov" | "none";
  status:
    | "discovered"
    | "disqualified"
    | "ready"
    | "queued"
    | "sent"
    | "replied"
    | "failed"
    | "skipped"
    | "bounced"
    | "suppressed";
  notes: string | null;
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
  disqualified: "neutral",
  ready: "brass",
  queued: "invited",
  sent: "active",
  failed: "error",
  skipped: "neutral",
  bounced: "error",
  suppressed: "neutral",
};

const LEAD_STATUS_LABEL: Record<AutomatedLead["status"], string> = {
  discovered: "Discovered",
  disqualified: "Disqualified",
  ready: "Ready",
  queued: "Queued",
  sent: "Sent",
  replied: "Replied",
  failed: "Failed",
  skipped: "Skipped",
  bounced: "Bounced",
  suppressed: "Unsubscribed",
};

const SOURCE_META: Record<
  AutomatedLead["emailSource"],
  { label: string; icon: string; badge: string }
> = {
  site_scrape: { label: "Website", icon: "language", badge: "bg-primary/10 text-primary border border-primary/20" },
  hunter: { label: "Hunter.io", icon: "person_search", badge: "brass-badge" },
  apollo: { label: "Apollo.io", icon: "person_search", badge: "status-pill-active border border-tertiary-fixed/30" },
  google_places: { label: "Google Places", icon: "map", badge: "bg-secondary-fixed/25 text-on-secondary-container border border-secondary-fixed-dim/30" },
  osm: { label: "Map listing", icon: "map", badge: "bg-tertiary-fixed/20 text-tertiary border border-tertiary-fixed-dim/30" },
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
      className={cn("rounded-md px-2.5 py-1 text-[12px] font-label-md font-medium", meta.badge)}
    >
      {meta.label}
    </Badge>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="h-auto rounded-md border-border-low-alpha bg-surface-container-low/70 px-2.5 py-1.5 text-[12px] font-label-md text-on-surface-variant"
    >
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
  const router = useRouter();
  const { profile } = useAuth();
  const [campaign, setCampaign] = useState<AutomatedCampaign | null>(null);
  const [leads, setLeads] = useState<AutomatedLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emailsLead, setEmailsLead] = useState<AutomatedLead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * LEADS_PAGE_SIZE;
      const qs = new URLSearchParams({ limit: String(LEADS_PAGE_SIZE), offset: String(offset) });
      if (statusFilter) qs.set("status", statusFilter);
      const [c, l] = await Promise.all([
        api.get<AutomatedCampaign>(`/api/automated-campaigns/${id}`),
        api.get<{ leads: AutomatedLead[]; total: number }>(
          `/api/automated-campaigns/${id}/leads?${qs.toString()}`,
        ),
      ]);
      setCampaign(c);
      setLeads(l.leads);
      setTotal(l.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, statusFilter, page]);

  // Changing the filter mid-page (e.g. viewing page 3, then filtering to
  // "Sent") must reset to page 1 in the SAME update as the filter change —
  // the old offset would likely be past the end of the new, smaller result
  // set. Done in the select's onChange (below), not a second effect, so
  // there's only ever one fetch per filter change instead of two.
  const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));
  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

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

  const handleDeleteCampaign = async () => {
    try {
      await api.delete(`/api/automated-campaigns/${id}`);
      toast.success("Campaign deleted");
      router.push("/automated-outreach");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete campaign");
    }
  };

  if (loading && !campaign) {
    return (
      <AppShell>
        <div className="min-h-screen flex flex-col">
          <TopAppBar
            leftContent={
              <div className="flex items-center gap-2 text-text-muted font-label-md">
                <Link href="/automated-outreach" className="hover:text-primary transition-colors">
                  Automated Outreach
                </Link>
              </div>
            }
          />
          <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1200px] mx-auto w-full">
            <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-3">
                <Skeleton className="h-7 w-52" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-32 rounded-full" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-11 w-40 rounded-lg" />
                <Skeleton className="h-11 w-20 rounded-lg" />
              </div>
            </section>
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border-low-alpha">
                <Skeleton className="h-5 w-28" />
              </CardHeader>
              <CardContent className="p-0">
                <TableSkeleton rows={6} columns={3} />
              </CardContent>
            </Card>
          </main>
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

  const headCls = "px-4 py-3 text-[11px] uppercase tracking-wide";
  const cellCls = "px-4 py-3";

  const leadColumns: DataTableColumn<AutomatedLead>[] = [
    {
      key: "business",
      header: "Business",
      headerClassName: headCls,
      cellClassName: cellCls,
      render: (lead) => (
        <span className="font-body-md text-[13px] font-medium text-on-surface">{lead.businessName}</span>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      headerClassName: headCls,
      cellClassName: cellCls,
      render: (lead) => (
        <span className="font-data-mono text-[12px] text-on-surface-variant">{lead.email ?? "—"}</span>
      ),
    },
    {
      key: "source",
      header: "Source",
      headerClassName: headCls,
      cellClassName: cellCls,
      render: (lead) => <SourceBadge source={lead.emailSource} />,
    },
    {
      key: "location",
      header: "Location",
      headerClassName: headCls,
      cellClassName: cellCls,
      render: (lead) => (
        <span className="block max-w-[220px] truncate text-[13px] text-on-surface-variant">
          {lead.addressText ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      headerClassName: headCls,
      cellClassName: cellCls,
      render: (lead) => (
        <div title={lead.status === "disqualified" ? (lead.notes ?? undefined) : undefined}>
          <LeadStatusPill status={lead.status} />
        </div>
      ),
    },
    {
      key: "emails",
      header: "Emails",
      headerClassName: headCls,
      cellClassName: cellCls,
      render: (lead) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setEmailsLead(lead);
          }}
          className="h-8 gap-1.5 px-2 text-primary hover:bg-primary/5"
        >
          <span className="material-symbols-outlined text-[16px]">mail</span>
          Emails
        </Button>
      ),
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
        <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-12">
          <section className="rounded-xl border border-border-low-alpha bg-surface-white p-4 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h1 className="font-headline-lg text-[28px] leading-tight text-primary sm:text-headline-lg">
                    {campaign.name}
                  </h1>
                  <StatusBadge tone={CAMPAIGN_STATUS_TONE[campaign.status]}>
                    {CAMPAIGN_STATUS_LABEL[campaign.status]}
                  </StatusBadge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <MetaChip>{campaign.discoveryQuery.category}</MetaChip>
                  <MetaChip>{locationLabel}</MetaChip>
                  {campaign.replyPollingEnabled && <MetaChip>Reply polling</MetaChip>}
                  {campaign.lastDiscoveryRunAt && (
                    <MetaChip>
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
                {!campaign.errorReason &&
                  !loading &&
                  campaign.lastDiscoveryRunAt &&
                  total > 0 &&
                  total < campaign.maxLeadsPerRun && (
                    <p className="mt-3 flex items-start gap-1.5 font-body-md text-[13px] text-text-muted">
                      <span className="material-symbols-outlined text-[16px] shrink-0">info</span>
                      Found {total} of {campaign.maxLeadsPerRun} target leads so far — free discovery
                      sources don&apos;t have contact info for every business in{" "}
                      {campaign.discoveryQuery.category} / {locationLabel}. New leads get added
                      automatically as more become discoverable; try a broader category or location
                      for more volume.
                    </p>
                  )}
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto lg:shrink-0">
                {(campaign.status === "active" || campaign.status === "paused" || campaign.status === "draft") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={toggleCampaign}
                    disabled={busy}
                    className="w-full justify-center lg:w-auto"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {busy ? "sync" : campaign.status === "active" ? "pause" : "play_arrow"}
                    </span>
                    {campaign.status === "active" ? "Pause campaign" : "Activate campaign"}
                  </Button>
                )}
                {profile?.role === "admin" && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    onClick={() => setConfirmDelete(true)}
                    className="w-full justify-center lg:w-auto"
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </section>

          <Card className="overflow-hidden rounded-xl border-border-low-alpha bg-surface-white py-0">
            <CardHeader className="border-b border-border-low-alpha px-4 py-4 sm:px-5">
              <CardTitle className="font-body-md text-[16px] font-semibold text-on-surface">
                Leads {!loading && total > 0 && <span className="text-text-muted">({total})</span>}
              </CardTitle>
              <CardAction>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-border-low-alpha bg-surface-white px-3 py-2 font-label-md text-label-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All statuses</option>
                  <option value="ready">Ready</option>
                  <option value="queued">Queued</option>
                  <option value="sent">Sent</option>
                  <option value="replied">Replied</option>
                  <option value="failed">Failed</option>
                  <option value="skipped">Skipped</option>
                  <option value="bounced">Bounced</option>
                  <option value="suppressed">Unsubscribed</option>
                </select>
              </CardAction>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={5} columns={3} />
              ) : (
                <DataTable
                  columns={leadColumns}
                  rows={leads}
                  getRowKey={(lead) => lead.id}
                  mobileCard={(lead) => (
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-body-md text-[14px] font-semibold leading-snug text-on-surface">
                            {lead.businessName}
                          </span>
                          <span className="mt-1 block truncate font-data-mono text-[12px] text-on-surface-variant">
                            {lead.email ?? "No email found"}
                          </span>
                        </span>
                        <LeadStatusPill status={lead.status} />
                      </div>
                      <div className="grid gap-2 rounded-lg bg-surface-container-low/50 p-3 font-body-md text-[13px] text-on-surface-variant">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-label-md text-[11px] uppercase tracking-wider">Source</span>
                          <SourceBadge source={lead.emailSource} />
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="shrink-0 font-label-md text-[11px] uppercase tracking-wider">Location</span>
                          <span className="min-w-0 text-right">{lead.addressText ?? "—"}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEmailsLead(lead)}
                        className="min-h-10 w-full justify-center"
                      >
                        <span className="material-symbols-outlined text-[16px]">mail</span>
                        View emails
                      </Button>
                    </div>
                  )}
                  emptyState={
                    <span className="font-body-md text-body-md text-on-surface-variant">
                      No leads yet — the next scheduled run will discover some.
                    </span>
                  }
                />
              )}
            </CardContent>
            {!loading && total > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border-low-alpha px-4 py-3 sm:flex-row">
                <span className="font-body-md text-[12px] text-on-surface-variant">
                  Showing {(page - 1) * LEADS_PAGE_SIZE + 1}–{Math.min(page * LEADS_PAGE_SIZE, total)} of{" "}
                  {total}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    aria-label="Previous page"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-low-alpha text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  {paginationRange(page, totalPages).map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-1 font-label-md text-[12px] text-on-surface-variant">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => goToPage(p)}
                        aria-current={p === page ? "page" : undefined}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg font-label-md text-[12px] transition-colors",
                          p === page
                            ? "bg-primary text-on-primary"
                            : "border border-border-low-alpha text-on-surface-variant hover:bg-surface-container-low",
                        )}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-low-alpha text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </Card>
        </main>
      </div>
      <LeadEmailsModal campaignId={id} lead={emailsLead} onClose={() => setEmailsLead(null)} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDeleteCampaign}
        title="Delete campaign"
        description="This permanently deletes the campaign and all its leads, sends, and reply drafts. This can't be undone."
        confirmLabel="Delete"
        destructive
      />
    </AppShell>
  );
}
