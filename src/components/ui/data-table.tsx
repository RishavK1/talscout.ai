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
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyState,
  onRowClick,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <div className="p-8 text-center">{emptyState}</div>;
  }

  return (
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
}
