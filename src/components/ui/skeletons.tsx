import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared skeleton SHAPES matching the app's established layout patterns
 * (stat tile, DataTable row, card, chart) — one place to keep them
 * consistent instead of every page hand-rolling its own placeholder markup.
 * Compose these directly in a page's `loading` branch instead of a spinner
 * + "Loading..." text.
 */

/** Matches StatCard (dashboard/analytics): icon chip + label line + big
 *  mono-font value line. */
export function StatTileSkeleton() {
  return (
    <Card className="h-full border border-border-low-alpha bg-surface-white">
      <CardContent className="flex h-full flex-col justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-7 w-14" />
      </CardContent>
    </Card>
  );
}

/** A row of `count` StatTileSkeletons — drop straight into the same grid
 *  className the real stat row uses. */
export function StatRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <StatTileSkeleton key={i} />
      ))}
    </>
  );
}

/** Matches DataTable's row shape: a leading avatar/icon circle (optional) +
 *  a primary line + secondary line, plus N trailing column bars of varying
 *  width so the row doesn't look perfectly uniform/artificial. */
export function TableRowSkeleton({
  columns = 4,
  withAvatar = true,
}: {
  columns?: number;
  withAvatar?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      {withAvatar && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      {Array.from({ length: columns }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5 shrink-0", i % 2 === 0 ? "w-16" : "w-20")} />
      ))}
    </div>
  );
}

/** A stack of TableRowSkeletons with dividers, matching DataTable's rows —
 *  drop into the same `Card > CardContent(p-0)` wrapper the real table
 *  uses so the loading state occupies the same footprint as the data. */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  withAvatar = true,
}: {
  rows?: number;
  columns?: number;
  withAvatar?: boolean;
}) {
  return (
    <div className="divide-y divide-border-low-alpha">
      {Array.from({ length: rows }, (_, i) => (
        <TableRowSkeleton key={i} columns={columns} withAvatar={withAvatar} />
      ))}
    </div>
  );
}

/** Generic content-card placeholder: header bar + a few body lines —
 *  for cards whose real content is prose/fields rather than a table. */
export function CardBodySkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Matches the analytics TrendChart/DonutChart bounding box — a flat
 *  rectangle at the same height so the surrounding Card doesn't jump size
 *  once the real SVG renders in. */
export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />;
}

/** Full page-header skeleton — matches the Card-wrapped icon-chip + h1 +
 *  description pattern used across Blueprints/Candidates/Team/etc. */
export function PageHeaderSkeleton() {
  return (
    <Card className="mb-8 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
      <CardContent className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Full DataTable-shaped card: optional header row (title + toolbar) above
 *  a stack of TableRowSkeletons — the common "list page" loading shape. */
export function DataTableCardSkeleton({
  rows = 5,
  columns = 4,
  withAvatar = true,
  withHeader = true,
}: {
  rows?: number;
  columns?: number;
  withAvatar?: boolean;
  withHeader?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      {withHeader && (
        <CardHeader className="border-b border-border-low-alpha">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
      )}
      <CardContent className="p-0">
        <TableSkeleton rows={rows} columns={columns} withAvatar={withAvatar} />
      </CardContent>
    </Card>
  );
}
