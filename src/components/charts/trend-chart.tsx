"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { ChartSkeleton } from "@/components/ui/skeletons";
import { easeOut } from "@/lib/motion";

export interface TrendPoint {
  /** ISO date (YYYY-MM-DD). */
  day: string;
  value: number;
}

/** Single-series trend line — thin 2px stroke, rounded data-ends, recessive
 *  gridlines, hover crosshair + tooltip. One series needs no legend (the
 *  card title already names it) per the dataviz skill's rules. Shared by
 *  /analytics and /admin — genericized over `value`/`valueLabel` so both can
 *  plot their own real metric (sends, signups, visitors, payments, ...)
 *  through the same on-brand hand-rolled SVG rather than a charting library. */
export function TrendChart({
  data,
  loading,
  valueLabel = "",
  emptyLabel = "No data in this window yet.",
}: {
  data: TrendPoint[];
  loading: boolean;
  valueLabel?: string;
  emptyLabel?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; point: TrendPoint } | null>(null);

  const width = 800;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const xFor = (i: number) => padding.left + i * stepX;
  const yFor = (v: number) => padding.top + innerH - (v / max) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(d.value)}`)
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
    setHover({ x: xFor(i), y: yFor(data[i].value), point: data[i] });
  };

  const gridLines = [0, 0.5, 1];
  const firstLabel = data[0]?.day;
  const lastLabel = data[data.length - 1]?.day;
  const formatDay = (iso?: string) =>
    iso
      ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
  const hasData = data.some((d) => d.value > 0);

  return (
    <div className="relative">
      {loading ? (
        <ChartSkeleton height={220} />
      ) : !hasData ? (
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
          <TrendingUp className="size-[28px] text-on-surface-variant/40" strokeWidth={1.75} />
          <p className="font-body-md text-body-md text-on-surface-variant">{emptyLabel}</p>
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
          // on-light in light mode and light-on-dark in dark mode.
          className="absolute pointer-events-none bg-on-surface text-surface-white rounded-lg px-3 py-1.5 font-label-md text-[12px] -translate-x-1/2 -translate-y-full shadow-sm"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: `${(hover.y / height) * 100}%`,
            marginTop: -8,
          }}
        >
          {formatDay(hover.point.day)} · {hover.point.value}
          {valueLabel ? ` ${valueLabel}` : ""}
        </div>
      )}
    </div>
  );
}
