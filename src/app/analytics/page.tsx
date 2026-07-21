"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

interface DailyPoint {
  day: string;
  sent: number;
}
interface CampaignBreakdownRow {
  campaignId: string;
  campaignName: string;
  status: string;
  scheduled: number;
  sent: number;
  failed: number;
  skipped: number;
  bounced: number;
}
interface AutomatedCampaignBreakdownRow {
  campaignId: string;
  campaignName: string;
  status: string;
  scheduled: number;
  sent: number;
  failed: number;
  skipped: number;
  noEmail: number;
}
interface AnalyticsOverview {
  totals: {
    scheduled: number;
    sent: number;
    failed: number;
    skipped: number;
    total: number;
    bounced: number;
  };
  byCampaign: CampaignBreakdownRow[];
  daily: DailyPoint[];
  days: number;
  tracked: {
    sent: boolean;
    failed: boolean;
    skipped: boolean;
    scheduled: boolean;
    bounced: boolean;
    opened: boolean;
    replied: boolean;
  };
  automated: {
    totals: {
      scheduled: number;
      sent: number;
      failed: number;
      skipped: number;
      total: number;
      noEmail: number;
    };
    byCampaign: AutomatedCampaignBreakdownRow[];
    daily: DailyPoint[];
  };
}

const POLL_MS = 20_000;
const DAYS = 14;

type StatTone = "default" | "positive" | "negative" | "neutral";

// One flat treatment across every stat, regardless of tone — the `tone` prop
// stays (call sites still pass it) but no longer maps to a rainbow of colors.
const STAT_TONES: Record<StatTone, string> = {
  default: "bg-primary-container/10 text-primary-container",
  positive: "bg-primary-container/10 text-primary-container",
  negative: "bg-primary-container/10 text-primary-container",
  neutral: "bg-primary-container/10 text-primary-container",
};

// Kept local (rather than promoted to a shared component) since it carries
// analytics-specific tone coloring per stat, unlike dashboard's plain stat tiles.
function StatCard({
  icon,
  label,
  value,
  loading,
  tone = "default",
}: {
  icon: string;
  label: string;
  value: number;
  loading: boolean;
  tone?: StatTone;
}) {
  return (
    <Card className="h-full border border-border-low-alpha bg-surface-white">
      <CardContent className="flex h-full flex-col justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${STAT_TONES[tone]}`}>
            <span className="material-symbols-outlined text-[16px]">{icon}</span>
          </span>
          <p className="font-label-md text-label-md text-on-surface-variant truncate">{label}</p>
        </div>
        <p className="font-data-mono text-display-lg text-primary tracking-tight">
          {loading ? "…" : value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

/** Single-series (sent/day) trend line — thin 2px stroke, rounded data-ends,
 *  recessive gridlines, hover crosshair + tooltip. One series needs no legend
 *  (the card title already names it) per the dataviz skill's rules. */
function TrendChart({ data, loading }: { data: DailyPoint[]; loading: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; point: DailyPoint } | null>(null);

  const width = 800;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...data.map((d) => d.sent));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const xFor = (i: number) => padding.left + i * stepX;
  const yFor = (v: number) => padding.top + innerH - (v / max) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(d.sent)}`)
    .join(" ");
  const areaPath =
    data.length > 0
      ? `${linePath} L ${xFor(data.length - 1)} ${padding.top + innerH} L ${xFor(0)} ${padding.top + innerH} Z`
      : "";

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.max(0, Math.min(data.length - 1, Math.round((relX - padding.left) / stepX)));
    setHover({ x: xFor(i), y: yFor(data[i].sent), point: data[i] });
  };

  const gridLines = [0, 0.5, 1];
  const firstLabel = data[0]?.day;
  const lastLabel = data[data.length - 1]?.day;
  const formatDay = (iso?: string) =>
    iso
      ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";

  return (
    <div className="relative">
      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-text-muted font-body-md">
          Loading trend...
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[220px]"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {gridLines.map((g) => (
            <line
              key={g}
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + innerH * (1 - g)}
              y2={padding.top + innerH * (1 - g)}
              stroke="var(--color-outline-variant)"
              strokeWidth={1}
              opacity={0.5}
            />
          ))}
          <text x={4} y={padding.top + 4} className="fill-[var(--color-outline)] text-[10px]">
            {max}
          </text>
          <text x={4} y={padding.top + innerH} className="fill-[var(--color-outline)] text-[10px]">
            0
          </text>

          {data.length > 0 && (
            <>
              <path d={areaPath} fill="var(--color-primary)" opacity={0.08} />
              <path
                d={linePath}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {hover && (
            <>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={padding.top}
                y2={padding.top + innerH}
                stroke="var(--color-outline)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <circle
                cx={hover.x}
                cy={hover.y}
                r={4}
                fill="var(--color-primary)"
                stroke="white"
                strokeWidth={2}
              />
            </>
          )}

          <text
            x={padding.left}
            y={height - 8}
            className="fill-[var(--color-outline)] text-[10px]"
          >
            {formatDay(firstLabel)}
          </text>
          <text
            x={width - padding.right}
            y={height - 8}
            textAnchor="end"
            className="fill-[var(--color-outline)] text-[10px]"
          >
            {formatDay(lastLabel)}
          </text>
        </svg>
      )}
      {hover && (
        <div
          className="absolute pointer-events-none bg-on-surface text-white rounded-lg px-3 py-1.5 font-label-md text-[12px] -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: `${(hover.y / height) * 100}%`,
            marginTop: -8,
          }}
        >
          {formatDay(hover.point.day)} · {hover.point.sent} sent
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get<AnalyticsOverview>(`/api/analytics/overview?days=${DAYS}`);
      setOverview(res);
    } catch (err: any) {
      if (!silent) toast.error(err.message || "Failed to load analytics");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const totals = overview?.totals;

  const campaignColumns: DataTableColumn<CampaignBreakdownRow>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (row) => (
        <span className="font-body-md text-body-md text-on-surface font-medium">{row.campaignName}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className="font-body-md text-body-md text-on-surface-variant capitalize">{row.status}</span>
      ),
    },
    {
      key: "sent",
      header: "Sent",
      render: (row) => <span className="font-data-mono text-data-mono text-on-surface">{row.sent}</span>,
    },
    {
      key: "scheduled",
      header: "Scheduled",
      render: (row) => (
        <span className="font-data-mono text-data-mono text-on-surface-variant">{row.scheduled}</span>
      ),
    },
    {
      key: "failed",
      header: "Failed",
      render: (row) => <span className="font-data-mono text-data-mono text-error">{row.failed}</span>,
    },
    {
      key: "skipped",
      header: "Skipped",
      render: (row) => (
        <span className="font-data-mono text-data-mono text-on-surface-variant">{row.skipped}</span>
      ),
    },
    {
      key: "bounced",
      header: "Bounced",
      render: (row) => <span className="font-data-mono text-data-mono text-error">{row.bounced}</span>,
    },
  ];

  const automatedCampaignColumns: DataTableColumn<AutomatedCampaignBreakdownRow>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (row) => (
        <span className="font-body-md text-body-md text-on-surface font-medium">{row.campaignName}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className="font-body-md text-body-md text-on-surface-variant capitalize">{row.status}</span>
      ),
    },
    {
      key: "sent",
      header: "Sent",
      render: (row) => <span className="font-data-mono text-data-mono text-on-surface">{row.sent}</span>,
    },
    {
      key: "scheduled",
      header: "Scheduled",
      render: (row) => (
        <span className="font-data-mono text-data-mono text-on-surface-variant">{row.scheduled}</span>
      ),
    },
    {
      key: "failed",
      header: "Failed",
      render: (row) => <span className="font-data-mono text-data-mono text-error">{row.failed}</span>,
    },
    {
      key: "skipped",
      header: "Skipped",
      render: (row) => (
        <span className="font-data-mono text-data-mono text-on-surface-variant">{row.skipped}</span>
      ),
    },
    {
      key: "noEmail",
      header: "No email",
      render: (row) => (
        <span className="font-data-mono text-data-mono text-on-surface-variant">{row.noEmail}</span>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <span>Analytics</span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full">
          <Card className="mb-10 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
            <CardContent>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h1 className="font-headline-lg text-headline-lg text-primary">
                  Outreach Analytics
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-container/10 px-3 py-1 font-label-md text-[12px] text-primary-container">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-container opacity-50" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-container" />
                  </span>
                  Live · every {POLL_MS / 1000}s
                </span>
              </div>
              <p className="font-body-lg text-body-lg text-text-muted">
                Real-time send performance across your email campaigns.
              </p>
            </CardContent>
          </Card>

          <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-10">
            <StatCard icon="mark_email_read" label="Sent" value={totals?.sent ?? 0} loading={loading} tone="positive" />
            <StatCard icon="schedule_send" label="Scheduled" value={totals?.scheduled ?? 0} loading={loading} />
            <StatCard icon="error" label="Failed" value={totals?.failed ?? 0} loading={loading} tone="negative" />
            <StatCard icon="block" label="Skipped" value={totals?.skipped ?? 0} loading={loading} tone="neutral" />
            <StatCard icon="report" label="Bounced" value={totals?.bounced ?? 0} loading={loading} tone="negative" />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            <Card className="border border-border-low-alpha bg-surface-white lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                  Sent per day (last {DAYS} days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TrendChart data={overview?.daily ?? []} loading={loading} />
              </CardContent>
            </Card>
            <Card className="border border-border-low-alpha bg-surface-white">
              <CardHeader>
                <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                  Reply &amp; open tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-body-md text-body-md text-on-surface-variant">Opened</span>
                    <Badge variant="secondary">Coming soon</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-body-md text-body-md text-on-surface-variant">Replied</span>
                    <Badge variant="secondary">Coming soon</Badge>
                  </div>
                </div>
                <p className="mt-4 font-body-md text-[13px] text-text-muted">
                  These signals aren&apos;t instrumented yet — only real, persisted
                  data is shown on this dashboard.
                </p>
              </CardContent>
            </Card>
          </section>

          <Card className="border border-border-low-alpha bg-surface-white overflow-hidden">
            <CardHeader className="border-b border-border-low-alpha">
              <CardTitle className="font-sans font-semibold text-headline-md text-primary">By campaign</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={campaignColumns}
                rows={overview?.byCampaign ?? []}
                getRowKey={(row) => row.campaignId}
                emptyState={
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {loading ? "Loading campaigns..." : "No email campaigns yet."}
                  </span>
                }
              />
            </CardContent>
          </Card>

          <div className="mt-16 rounded-xl border border-border-low-alpha p-4 sm:p-6 lg:p-8">
          <section className="mb-6">
            <p className="mb-1 font-label-md text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Automated Outreach
            </p>
            <p className="font-body-md text-body-md text-text-muted">
              Blueprint-powered discovery + AI-written sends, separate from Bulk Fire.
            </p>
          </section>

          <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-10">
            <StatCard
              icon="mark_email_read"
              label="Sent"
              value={overview?.automated.totals.sent ?? 0}
              loading={loading}
              tone="positive"
            />
            <StatCard
              icon="schedule_send"
              label="Scheduled"
              value={overview?.automated.totals.scheduled ?? 0}
              loading={loading}
            />
            <StatCard
              icon="error"
              label="Failed"
              value={overview?.automated.totals.failed ?? 0}
              loading={loading}
              tone="negative"
            />
            <StatCard
              icon="block"
              label="Skipped"
              value={overview?.automated.totals.skipped ?? 0}
              loading={loading}
              tone="neutral"
            />
            <StatCard
              icon="mail_lock"
              label="No email found"
              value={overview?.automated.totals.noEmail ?? 0}
              loading={loading}
              tone="neutral"
            />
          </section>

          <Card className="border border-border-low-alpha bg-surface-white mb-10">
            <CardHeader>
              <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                Automated sent per day (last {DAYS} days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart data={overview?.automated.daily ?? []} loading={loading} />
            </CardContent>
          </Card>

          <Card className="border border-border-low-alpha bg-surface-white overflow-hidden">
            <CardHeader className="border-b border-border-low-alpha">
              <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                By automated campaign
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={automatedCampaignColumns}
                rows={overview?.automated.byCampaign ?? []}
                getRowKey={(row) => row.campaignId}
                emptyState={
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {loading ? "Loading campaigns..." : "No automated campaigns yet."}
                  </span>
                }
              />
            </CardContent>
          </Card>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
