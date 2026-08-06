"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Thin wrapper over shadcn's Table primitives with ONE fixed cell-padding
 * scale — replaces the 4+ independently hand-rolled `<table>` implementations
 * found across the app (candidates, billing invoices, team members,
 * analytics, shortlist-detail), each of which drifted to a different
 * px/py convention. No page should hand-roll `<table>`/`<thead>`/`<tr>` again.
 */
export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  mobileCard?: (row: T) => ReactNode;
  mobileScrollHint?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyState,
  onRowClick,
  className,
  mobileCard,
  mobileScrollHint = "Swipe left to see more columns",
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <div className="p-8 text-center">{emptyState}</div>;
  }

  const table = (
    <Table className={className}>
      <TableHeader>
        <TableRow className="border-border-low-alpha hover:bg-transparent">
          {columns.map((col) => (
            <TableHead
              key={col.key}
              className={cn(
                "px-6 py-4 font-label-md text-label-md font-medium text-on-surface-variant",
                col.headerClassName,
              )}
            >
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={getRowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "border-border-low-alpha",
              onRowClick && "cursor-pointer hover:bg-surface-container-lowest",
            )}
          >
            {columns.map((col) => (
              <TableCell
                key={col.key}
                className={cn("px-6 py-4 font-body-md text-body-md whitespace-normal text-on-surface", col.cellClassName)}
              >
                {col.render(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (mobileCard) {
    return (
      <>
        {/* overflow-x-hidden as a safety net: a card list has no scroll
         *  affordance of its own (unlike the table below, which wraps in
         *  overflow-x-auto), so if a consumer's mobileCard ever renders
         *  unconstrained-width content (e.g. forgets `truncate` on a long
         *  field), this clips it instead of pushing the WHOLE PAGE into
         *  horizontal scroll. */}
        <div className="divide-y divide-border-low-alpha overflow-x-hidden md:hidden">
          {rows.map((row) => {
            const key = getRowKey(row);
            const isClickable = Boolean(onRowClick);
            return (
              <div
                key={key}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "outline-none transition-colors focus-visible:bg-surface-container-lowest focus-visible:ring-2 focus-visible:ring-primary/20",
                  isClickable && "cursor-pointer active:bg-surface-container-lowest",
                )}
              >
                {mobileCard(row)}
              </div>
            );
          })}
        </div>
        <div className="hidden md:block">{table}</div>
      </>
    );
  }

  return (
    <>
      <div className="border-b border-border-low-alpha bg-surface-container-low/60 px-4 py-2 font-label-md text-[11px] uppercase tracking-wider text-on-surface-variant md:hidden">
        {mobileScrollHint}
      </div>
      {table}
    </>
  );
}
