"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberTicker } from "@/components/ui/number-ticker";
import { easeOut } from "@/lib/motion";

/** Ranked horizontal bar list — top N rows by a single real metric, derived
 *  from an already-fetched aggregate. Shared by /analytics and /admin. */
export function BarList({
  rows,
  loading,
  emptyLabel,
  zeroLabel = "Nothing to rank yet.",
}: {
  rows: { label: string; value: number }[];
  loading: boolean;
  emptyLabel: string;
  zeroLabel?: string;
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
        {rows.length === 0 ? emptyLabel : zeroLabel}
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
