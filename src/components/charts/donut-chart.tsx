"use client";

import { motion } from "framer-motion";
import { PieChart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberTicker } from "@/components/ui/number-ticker";
import { easeOut } from "@/lib/motion";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
  opacity?: number;
}

/** Ring chart built from stacked `<circle>` strokes (stroke-dasharray trick)
 *  — no charting library, matches TrendChart's hand-rolled SVG approach and
 *  the app's exact design tokens. Every segment must be a real, already-
 *  fetched aggregate count — nothing estimated. Shared by /analytics and
 *  /admin. */
export function DonutChart({
  segments,
  loading,
  centerLabel,
  emptyLabel = "No data yet.",
}: {
  segments: DonutSegment[];
  loading: boolean;
  centerLabel: string;
  emptyLabel?: string;
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
        <p className="font-body-md text-body-md text-on-surface-variant">{emptyLabel}</p>
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
