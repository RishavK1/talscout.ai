"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";

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

const STAT_TONES: Record<StatTone, string> = {
  default: "bg-primary/10 text-primary",
  positive: "bg-tertiary-fixed/30 text-tertiary-container",
  negative: "bg-error/10 text-error",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

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
    <div className="bg-white p-5 sm:p-6 rounded-[20px] ambient-shadow border border-border-low-alpha flex flex-col justify-between gap-4">
      <div className={`w-fit rounded-xl p-2 ${STAT_TONES[tone]}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="font-label-md text-label-md text-on-surface-variant mb-1 truncate">{label}</p>
        <p className="font-data-mono text-display-lg text-primary tracking-tight">
          {loading ? "…" : value.toLocaleString()}
        </p>
      </div>
    </div>
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

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full font-label-md text-[11px] bg-surface-container-high text-on-surface-variant">
      Coming soon
    </span>
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
          <section className="mb-10">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h1 className="font-headline-lg text-headline-lg text-primary">
                Outreach Analytics
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tertiary-fixed/25 px-3 py-1 font-label-md text-[12px] text-tertiary-container">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary-container opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-tertiary-container" />
                </span>
                Live · every {POLL_MS / 1000}s
              </span>
            </div>
            <p className="font-body-lg text-body-lg text-text-muted">
              Real-time send performance across your email campaigns.
            </p>
          </section>

          <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-10">
            <StatCard icon="mark_email_read" label="Sent" value={totals?.sent ?? 0} loading={loading} tone="positive" />
            <StatCard icon="schedule_send" label="Scheduled" value={totals?.scheduled ?? 0} loading={loading} />
            <StatCard icon="error" label="Failed" value={totals?.failed ?? 0} loading={loading} tone="negative" />
            <StatCard icon="block" label="Skipped" value={totals?.skipped ?? 0} loading={loading} tone="neutral" />
            <StatCard icon="report" label="Bounced" value={totals?.bounced ?? 0} loading={loading} tone="negative" />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            <div className="lg:col-span-2 bg-white rounded-[20px] ambient-shadow border border-border-low-alpha p-6">
              <h3 className="font-headline-md text-headline-md text-primary mb-4">
                Sent per day (last {DAYS} days)
              </h3>
              <TrendChart data={overview?.daily ?? []} loading={loading} />
            </div>
            <div className="bg-white rounded-[20px] ambient-shadow border border-border-low-alpha p-6">
              <h3 className="font-headline-md text-headline-md text-primary mb-4">
                Reply &amp; open tracking
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-body-md text-body-md text-on-surface-variant">Opened</span>
                  <ComingSoonBadge />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body-md text-body-md text-on-surface-variant">Replied</span>
                  <ComingSoonBadge />
                </div>
              </div>
              <p className="mt-4 font-body-md text-[13px] text-text-muted">
                These signals aren&apos;t instrumented yet — only real, persisted
                data is shown on this dashboard.
              </p>
            </div>
          </section>

          <section className="bg-white rounded-[20px] ambient-shadow border border-border-low-alpha overflow-hidden">
            <div className="p-6 border-b border-border-low-alpha">
              <h3 className="font-headline-md text-headline-md text-primary">By campaign</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left border-collapse">
                <thead>
                  <tr className="bg-bg-cream/50">
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Campaign</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Status</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Sent</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Scheduled</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Failed</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Skipped</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Bounced</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                        Loading campaigns...
                      </td>
                    </tr>
                  ) : !overview || overview.byCampaign.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                        No email campaigns yet.
                      </td>
                    </tr>
                  ) : (
                    overview.byCampaign.map((row) => (
                      <tr
                        key={row.campaignId}
                        className="border-b border-border-low-alpha hover:bg-surface-container-lowest transition-colors"
                      >
                        <td className="p-4 font-body-md text-body-md text-on-surface font-medium">
                          {row.campaignName}
                        </td>
                        <td className="p-4 font-body-md text-body-md text-on-surface-variant capitalize">
                          {row.status}
                        </td>
                        <td className="p-4 font-data-mono text-data-mono text-on-surface">{row.sent}</td>
                        <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">
                          {row.scheduled}
                        </td>
                        <td className="p-4 font-data-mono text-data-mono text-error">{row.failed}</td>
                        <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">
                          {row.skipped}
                        </td>
                        <td className="p-4 font-data-mono text-data-mono text-error">{row.bounced}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-6 mt-16">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <span className="material-symbols-outlined">auto_awesome</span>
              </div>
              <h2 className="font-headline-lg text-headline-lg text-primary">
                Automated Outreach
              </h2>
            </div>
            <p className="font-body-lg text-body-lg text-text-muted">
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

          <section className="mb-10 bg-white rounded-[20px] ambient-shadow border border-border-low-alpha p-6">
            <h3 className="font-headline-md text-headline-md text-primary mb-4">
              Automated sent per day (last {DAYS} days)
            </h3>
            <TrendChart data={overview?.automated.daily ?? []} loading={loading} />
          </section>

          <section className="bg-white rounded-[20px] ambient-shadow border border-border-low-alpha overflow-hidden">
            <div className="p-6 border-b border-border-low-alpha">
              <h3 className="font-headline-md text-headline-md text-primary">
                By automated campaign
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left border-collapse">
                <thead>
                  <tr className="bg-bg-cream/50">
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Campaign</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Status</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Sent</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Scheduled</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Failed</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">Skipped</th>
                    <th className="p-4 font-label-md text-label-md text-outline font-medium">No email</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                        Loading campaigns...
                      </td>
                    </tr>
                  ) : !overview || overview.automated.byCampaign.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                        No automated campaigns yet.
                      </td>
                    </tr>
                  ) : (
                    overview.automated.byCampaign.map((row) => (
                      <tr
                        key={row.campaignId}
                        className="border-b border-border-low-alpha hover:bg-surface-container-lowest transition-colors"
                      >
                        <td className="p-4 font-body-md text-body-md text-on-surface font-medium">
                          {row.campaignName}
                        </td>
                        <td className="p-4 font-body-md text-body-md text-on-surface-variant capitalize">
                          {row.status}
                        </td>
                        <td className="p-4 font-data-mono text-data-mono text-on-surface">{row.sent}</td>
                        <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">
                          {row.scheduled}
                        </td>
                        <td className="p-4 font-data-mono text-data-mono text-error">{row.failed}</td>
                        <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">
                          {row.skipped}
                        </td>
                        <td className="p-4 font-data-mono text-data-mono text-on-surface-variant">
                          {row.noEmail}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
