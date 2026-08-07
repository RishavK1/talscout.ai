"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  MailCheck,
  Clock3,
  CircleAlert,
  Ban,
  MailX,
  Reply,
  Send,
  Sparkles,
  TrendingUp,
  PieChart,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { Reveal } from "@/components/motion/reveal";
import { BorderBeam } from "@/components/ui/border-beam";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { easeOut } from "@/lib/motion";

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
  replied: number;
}
interface AnalyticsOverview {
  totals: {
    scheduled: number;
    sent: number;
    failed: number;
    skipped: number;
    total: number;
    bounced: number;
    opened: number;
    replied: number;
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
      replied: number;
      opened: number;
      bounced: number;
    };
    byCampaign: AutomatedCampaignBreakdownRow[];
    daily: DailyPoint[];
  };
}

const POLL_MS = 20_000;
const DAY_OPTIONS = [7, 14, 30] as const;

type StatTone = "default" | "positive" | "negative" | "neutral";

// One flat treatment across every stat, regardless of tone — the `tone` prop
// stays (call sites still pass it) but no longer maps to a rainbow of colors.
const STAT_TONES: Record<StatTone, string> = {
  default: "bg-primary-container/10 text-primary",
  positive: "bg-primary-container/10 text-primary",
  negative: "bg-primary-container/10 text-primary",
  neutral: "bg-primary-container/10 text-primary",
};

// Kept local (rather than promoted to a shared component) since it carries
// analytics-specific tone coloring per stat, unlike dashboard's plain stat tiles.
function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  loading: boolean;
  tone?: StatTone;
}) {
  return (
    <Card className="h-full border border-border-low-alpha bg-surface-white transition-transform duration-300 hover:-translate-y-0.5">
      <CardContent className="flex h-full flex-col justify-between gap-2">
        {loading ? (
          <>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-7 w-14" />
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${STAT_TONES[tone]}`}>
                <Icon className="size-[16px]" strokeWidth={2.25} />
              </span>
              <p className="font-label-md text-label-md text-on-surface-variant truncate">{label}</p>
            </div>
            <p className="font-data-mono text-display-lg text-primary tracking-tight">
              <NumberTicker value={value} />
            </p>
          </>
        )}
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
  const hasData = data.some((d) => d.sent > 0);

  return (
    <div className="relative">
      {loading ? (
        <ChartSkeleton height={220} />
      ) : !hasData ? (
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
          <TrendingUp className="size-[28px] text-on-surface-variant/40" strokeWidth={1.75} />
          <p className="font-body-md text-body-md text-on-surface-variant">No sends in this window yet.</p>
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
              <motion.path
                d={areaPath}
                fill="var(--color-primary)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.08 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              />
              <motion.path
                d={linePath}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, ease: easeOut }}
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
              <motion.circle
                cx={hover.x}
                cy={hover.y}
                r={4}
                fill="var(--color-primary)"
                stroke="white"
                strokeWidth={2}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                style={{ transformOrigin: `${hover.x}px ${hover.y}px` }}
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
          // `text-surface-white` rather than a literal `text-white`: both this
          // and `bg-on-surface` invert with the theme, so the pill stays dark-
          // on-light in light mode and light-on-dark in dark mode. With the
          // literal white it was white text on a near-white pill in dark mode —
          // the date was effectively invisible. (The --color-inverse-surface
          // pair looks like the right token for this but is light in BOTH
          // themes, so it can't be used here.)
          className="absolute pointer-events-none bg-on-surface text-surface-white rounded-lg px-3 py-1.5 font-label-md text-[12px] -translate-x-1/2 -translate-y-full shadow-sm"
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

interface DonutSegment {
  label: string;
  value: number;
  color: string;
  opacity?: number;
}

/** Ring chart built from stacked `<circle>` strokes (stroke-dasharray trick)
 *  — no charting library, matches TrendChart's hand-rolled SVG approach and
 *  the app's exact design tokens. Every segment here is a real, already-
 *  fetched aggregate count (send-status totals); nothing is estimated. */
function DonutChart({
  segments,
  loading,
  centerLabel,
}: {
  segments: DonutSegment[];
  loading: boolean;
  centerLabel: string;
}) {
  if (loading) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-6">
        <Skeleton className="h-[148px] w-[148px] shrink-0 rounded-full" />
        <div className="w-full space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const size = 148;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
        <PieChart className="size-[28px] text-on-surface-variant/40" strokeWidth={1.75} />
        <p className="font-body-md text-body-md text-on-surface-variant">No sends in this window yet.</p>
      </div>
    );
  }

  // Pre-compute each arc's dash length + cumulative offset with a pure
  // reduce (no mutation during render) instead of a running counter in .map().
  const arcs = segments
    .filter((s) => s.value > 0)
    .reduce<{ seg: DonutSegment; dash: number; offset: number }[]>((out, seg) => {
      const dash = (seg.value / total) * circumference;
      const prevEnd = out.length > 0 ? out[out.length - 1].offset + out[out.length - 1].dash : 0;
      out.push({ seg, dash, offset: prevEnd });
      return out;
    }, []);

  return (
    // Ring stacked above the legend (never side-by-side) — a fixed-width
    // circle sharing a row with a text legend was overflowing narrower
    // grid columns and getting clipped by the card's rounded-corner mask.
    <div className="flex flex-col items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-outline-variant)"
            strokeWidth={stroke}
            opacity={0.3}
          />
          {arcs.map(({ seg, dash, offset }, index) => (
            <motion.circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeOpacity={seg.opacity ?? 1}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, ease: easeOut, delay: index * 0.1 }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-data-mono text-headline-md text-primary">
            <NumberTicker value={total} />
          </span>
          <span className="font-label-md text-[11px] text-on-surface-variant text-center px-2">
            {centerLabel}
          </span>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2">
        {segments.map((seg) => (
          <li key={seg.label} className="flex min-w-0 items-center justify-between gap-3 font-body-md text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-on-surface-variant">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: seg.color, opacity: seg.opacity ?? 1 }}
              />
              <span className="truncate">{seg.label}</span>
            </span>
            <span className="shrink-0 font-data-mono text-on-surface">
              {seg.value.toLocaleString()}
              <span className="ml-1 text-on-surface-variant">
                ({Math.round((seg.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bar list — top campaigns by a single real metric
 *  (sent volume), derived from the already-fetched per-campaign breakdown. */
function BarList({
  rows,
  loading,
  emptyLabel,
}: {
  rows: { label: string; value: number }[];
  loading: boolean;
  emptyLabel: string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-24 shrink-0 sm:w-32" />
            <Skeleton className="h-2 min-w-0 flex-1 rounded-full" />
            <Skeleton className="h-3.5 w-10 shrink-0" />
          </div>
        ))}
      </div>
    );
  }
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0 || max === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-center font-body-md text-body-md text-on-surface-variant">
        {rows.length === 0 ? emptyLabel : "No sends yet — nothing to rank."}
      </div>
    );
  }
  const top = rows.slice(0, 6);
  return (
    <ul className="flex flex-col gap-3.5">
      {top.map((row, index) => (
        <li key={row.label} className="flex items-center gap-3">
          <span
            className="w-24 shrink-0 truncate font-body-md text-[13px] text-on-surface-variant sm:w-32"
            title={row.label}
          >
            {row.label}
          </span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-container-high">
            <motion.div
              className="h-full rounded-full bg-primary-container"
              initial={{ width: "0%" }}
              animate={{ width: `${(row.value / max) * 100}%` }}
              transition={{ duration: 0.6, ease: easeOut, delay: index * 0.05 }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-data-mono text-[12px] text-on-surface">
            <NumberTicker value={row.value} delay={index * 0.05} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Eyebrow-label + description header, shared by both channel sections so
 *  Bulk Fire and Automated Outreach read as two symmetric, clearly divided
 *  zones instead of one ad hoc box. */
function ChannelSectionHeader({
  icon: Icon,
  label,
  description,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
        <Icon className="size-[18px]" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="font-label-md text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </p>
        <p className="font-body-md text-body-md text-text-muted">{description}</p>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(14);

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get<AnalyticsOverview>(`/api/analytics/overview?days=${days}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const totals = overview?.totals;
  const auto = overview?.automated;
  const replyRate =
    auto && auto.totals.sent > 0 ? Math.round((auto.totals.replied / auto.totals.sent) * 100) : 0;
  const bulkOpenRate =
    totals && totals.sent > 0 ? Math.round((totals.opened / totals.sent) * 100) : 0;
  const bulkReplyRate =
    totals && totals.sent > 0 ? Math.round((totals.replied / totals.sent) * 100) : 0;
  const autoOpenRate =
    auto && auto.totals.sent > 0 ? Math.round((auto.totals.opened / auto.totals.sent) * 100) : 0;

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
      key: "replied",
      header: "Replied",
      render: (row) => (
        <span className="font-data-mono text-data-mono text-tertiary">{row.replied}</span>
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
          <Reveal>
          <Card className="relative mb-8 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
            <BorderBeam size={90} duration={12} />
            <CardContent className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h1 className="font-headline-lg text-headline-lg text-primary">
                    Outreach Analytics
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-container/10 px-3 py-1 font-label-md text-[12px] text-primary">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-container opacity-50" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-container" />
                    </span>
                    Live · every {POLL_MS / 1000}s
                  </span>
                </div>
                <p className="font-body-lg text-body-lg text-text-muted">
                  Real-time send performance across Bulk Fire and Automated Outreach.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 self-start rounded-lg border border-border-low-alpha bg-bg-secondary p-1 lg:self-auto">
                {DAY_OPTIONS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDays(d)}
                    className={cn(
                      "relative px-3",
                      days === d
                        ? "text-primary font-semibold hover:bg-transparent"
                        : "text-text-muted hover:bg-transparent hover:text-on-surface",
                    )}
                  >
                    {days === d && (
                      <motion.span
                        layoutId="analytics-days-pill"
                        className="absolute inset-0 rounded-md bg-surface-white shadow-sm"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative">{d}d</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
          </Reveal>

          {/* ---- Bulk Fire ---- */}
          <Reveal delay={0.05} className="mb-10 rounded-xl border border-border-low-alpha p-4 sm:p-6 lg:p-8">
            <ChannelSectionHeader
              icon={Send}
              label="Bulk Fire"
              description="Manually scheduled spintax campaigns sent from your connected inboxes."
            />

            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6 mb-8">
              <StatCard icon={MailCheck} label="Sent" value={totals?.sent ?? 0} loading={loading} tone="positive" />
              <StatCard icon={Clock3} label="Scheduled" value={totals?.scheduled ?? 0} loading={loading} />
              <StatCard icon={CircleAlert} label="Failed" value={totals?.failed ?? 0} loading={loading} tone="negative" />
              <StatCard icon={Ban} label="Skipped" value={totals?.skipped ?? 0} loading={loading} tone="neutral" />
              <StatCard icon={MailX} label="Bounced" value={totals?.bounced ?? 0} loading={loading} tone="negative" />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <SpotlightCard className="rounded-2xl border border-border-low-alpha bg-surface-white lg:col-span-2">
              <Card className="border-0 bg-transparent">
                <CardHeader>
                  <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                    Sent per day (last {days} days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart data={overview?.daily ?? []} loading={loading} />
                </CardContent>
              </Card>
              </SpotlightCard>
              <Card className="border border-border-low-alpha bg-surface-white">
                <CardHeader>
                  <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                    Send status breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DonutChart
                    loading={loading}
                    centerLabel="total sends"
                    segments={[
                      { label: "Sent", value: totals?.sent ?? 0, color: "var(--color-primary-container)" },
                      { label: "Scheduled", value: totals?.scheduled ?? 0, color: "var(--color-secondary-container)" },
                      { label: "Failed", value: totals?.failed ?? 0, color: "var(--color-error)" },
                      { label: "Skipped", value: totals?.skipped ?? 0, color: "var(--color-outline-variant)" },
                      { label: "Bounced", value: totals?.bounced ?? 0, color: "var(--color-error)", opacity: 0.5 },
                    ]}
                  />
                </CardContent>
              </Card>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <SpotlightCard className="rounded-2xl border border-border-low-alpha bg-surface-white lg:col-span-2">
              <Card className="border-0 bg-transparent">
                <CardHeader>
                  <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                    Top campaigns by volume
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList
                    loading={loading}
                    emptyLabel="No email campaigns yet."
                    rows={(overview?.byCampaign ?? [])
                      .map((c) => ({ label: c.campaignName, value: c.sent }))
                      .sort((a, b) => b.value - a.value)}
                  />
                </CardContent>
              </Card>
              </SpotlightCard>
              <Card className="border border-border-low-alpha bg-surface-white">
                <CardHeader>
                  <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                    Reply &amp; open tracking
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3.5 w-14" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3.5 w-14" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-body-md text-body-md text-on-surface-variant">Opened</span>
                          <span className="font-data-mono text-body-md text-on-surface">
                            {(totals?.opened ?? 0).toLocaleString()}
                            <span className="ml-1 text-[12px] text-on-surface-variant">({bulkOpenRate}%)</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-body-md text-body-md text-on-surface-variant">Replied</span>
                          <span className="font-data-mono text-body-md text-tertiary">
                            {(totals?.replied ?? 0).toLocaleString()}
                            <span className="ml-1 text-[12px] text-on-surface-variant">({bulkReplyRate}%)</span>
                          </span>
                        </div>
                      </div>
                      <p className="mt-4 font-body-md text-[13px] text-text-muted">
                        Opened: tracking-pixel fetch on the sent email. Replied: a
                        Gmail thread check for senders with read access — both
                        percentages are of emails sent, not scheduled.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            <Card className="border border-border-low-alpha bg-surface-white overflow-hidden">
              <CardHeader className="border-b border-border-low-alpha">
                <CardTitle className="font-sans font-semibold text-headline-md text-primary">By campaign</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <TableSkeleton rows={4} columns={4} withAvatar={false} />
                ) : (
                  <DataTable
                    columns={campaignColumns}
                    rows={overview?.byCampaign ?? []}
                    getRowKey={(row) => row.campaignId}
                    emptyState={
                      <span className="font-body-md text-body-md text-on-surface-variant">
                        No email campaigns yet.
                      </span>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </Reveal>

          {/* ---- Automated Outreach ---- */}
          <Reveal delay={0.1} className="rounded-xl border border-border-low-alpha p-4 sm:p-6 lg:p-8">
            <ChannelSectionHeader
              icon={Sparkles}
              label="Automated Outreach"
              description="Blueprint-powered discovery + AI-written sends, separate from Bulk Fire."
            />

            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 mb-8">
              <StatCard
                icon={MailCheck}
                label="Sent"
                value={auto?.totals.sent ?? 0}
                loading={loading}
                tone="positive"
              />
              <StatCard
                icon={Clock3}
                label="Scheduled"
                value={auto?.totals.scheduled ?? 0}
                loading={loading}
              />
              <StatCard
                icon={CircleAlert}
                label="Failed"
                value={auto?.totals.failed ?? 0}
                loading={loading}
                tone="negative"
              />
              <StatCard
                icon={Ban}
                label="Skipped"
                value={auto?.totals.skipped ?? 0}
                loading={loading}
                tone="neutral"
              />
              <StatCard
                icon={Reply}
                label="Replied"
                value={auto?.totals.replied ?? 0}
                loading={loading}
                tone="positive"
              />
              <StatCard
                icon={MailX}
                label="Bounced"
                value={auto?.totals.bounced ?? 0}
                loading={loading}
                tone="negative"
              />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <SpotlightCard className="rounded-2xl border border-border-low-alpha bg-surface-white lg:col-span-2">
              <Card className="border-0 bg-transparent">
                <CardHeader>
                  <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                    Automated sent per day (last {days} days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart data={auto?.daily ?? []} loading={loading} />
                </CardContent>
              </Card>
              </SpotlightCard>
              <Card className="border border-border-low-alpha bg-surface-white">
                <CardHeader>
                  <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                    Send status breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DonutChart
                    loading={loading}
                    centerLabel="total sends"
                    segments={[
                      { label: "Sent", value: auto?.totals.sent ?? 0, color: "var(--color-primary-container)" },
                      { label: "Scheduled", value: auto?.totals.scheduled ?? 0, color: "var(--color-secondary-container)" },
                      { label: "Failed", value: auto?.totals.failed ?? 0, color: "var(--color-error)" },
                      { label: "Skipped", value: auto?.totals.skipped ?? 0, color: "var(--color-outline-variant)" },
                      { label: "Replied", value: auto?.totals.replied ?? 0, color: "var(--color-tertiary-container)" },
                    ]}
                  />
                </CardContent>
              </Card>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <SpotlightCard className="rounded-2xl border border-border-low-alpha bg-surface-white lg:col-span-2">
              <Card className="border-0 bg-transparent">
                <CardHeader>
                  <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                    Top campaigns by volume
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList
                    loading={loading}
                    emptyLabel="No automated campaigns yet."
                    rows={(auto?.byCampaign ?? [])
                      .map((c) => ({ label: c.campaignName, value: c.sent }))
                      .sort((a, b) => b.value - a.value)}
                  />
                </CardContent>
              </Card>
              </SpotlightCard>
              <Card className="border border-border-low-alpha bg-surface-white">
                <CardHeader>
                  <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                    Reply rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <>
                      <Skeleton className="h-9 w-20" />
                      <Skeleton className="mt-2 h-3.5 w-40" />
                      <div className="mt-4 flex items-center justify-between border-t border-border-low-alpha pt-3">
                        <Skeleton className="h-3.5 w-14" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="font-data-mono text-display-lg text-primary tracking-tight">
                          <NumberTicker value={replyRate} suffix="%" />
                        </span>
                        <span className="font-body-md text-[13px] text-on-surface-variant">
                          of sent emails
                        </span>
                      </div>
                      <p className="mt-2 font-body-md text-[13px] text-text-muted">
                        {`${(auto?.totals.replied ?? 0).toLocaleString()} replies out of ${(auto?.totals.sent ?? 0).toLocaleString()} sent.`}
                      </p>
                      <div className="mt-4 flex items-center justify-between border-t border-border-low-alpha pt-3">
                        <span className="font-body-md text-body-md text-on-surface-variant">Opened</span>
                        <span className="font-data-mono text-body-md text-on-surface">
                          {(auto?.totals.opened ?? 0).toLocaleString()}
                          <span className="ml-1 text-[12px] text-on-surface-variant">({autoOpenRate}%)</span>
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            <Card className="border border-border-low-alpha bg-surface-white overflow-hidden">
              <CardHeader className="border-b border-border-low-alpha">
                <CardTitle className="font-sans font-semibold text-headline-md text-primary">
                  By automated campaign
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <TableSkeleton rows={4} columns={5} withAvatar={false} />
                ) : (
                  <DataTable
                    columns={automatedCampaignColumns}
                    rows={auto?.byCampaign ?? []}
                    getRowKey={(row) => row.campaignId}
                    emptyState={
                      <span className="font-body-md text-body-md text-on-surface-variant">
                        No automated campaigns yet.
                      </span>
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
