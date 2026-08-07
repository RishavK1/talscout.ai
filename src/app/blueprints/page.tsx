"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Globe, CirclePlus } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderCard } from "@/components/app/page-header-card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeletons";
import { Reveal } from "@/components/motion/reveal";

interface BlueprintSummary {
  id: string;
  name: string;
  websiteUrl: string | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
}

const STATUS_META: Record<
  BlueprintSummary["status"],
  { label: string; tone: NonNullable<StatusBadgeProps["tone"]> }
> = {
  draft: { label: "Draft", tone: "draft" },
  active: { label: "Active", tone: "active" },
  archived: { label: "Archived", tone: "error" },
};

export default function BlueprintsPage() {
  const router = useRouter();
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ blueprints: BlueprintSummary[] }>("/api/blueprints");
      setBlueprints(res.blueprints);
    } catch (err: any) {
      toast.error(err.message || "Failed to load blueprints");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const columns: DataTableColumn<BlueprintSummary>[] = [
    {
      key: "name",
      header: "Name",
      render: (b) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
            <FileText className="size-[18px]" />
          </div>
          <span className="font-body-md text-[14px] font-medium text-on-surface">{b.name}</span>
        </div>
      ),
    },
    {
      key: "website",
      header: "Website",
      render: (b) =>
        b.websiteUrl ? (
          <span className="flex items-center gap-1.5 font-body-md text-[13px] text-on-surface-variant">
            <Globe className="size-[15px] shrink-0" />
            <span className="truncate max-w-[220px]">{b.websiteUrl.replace(/^https?:\/\//, "")}</span>
          </span>
        ) : (
          <span className="text-on-surface-variant">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => {
        const meta = STATUS_META[b.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      key: "created",
      header: "Created",
      render: (b) => (
        <span className="font-data-mono text-[12px] text-on-surface-variant">
          {new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <span>Blueprints</span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full">
          <Reveal>
          <PageHeaderCard
            icon="description"
            title="Blueprints"
            description="AI-generated business context — what you sell, who it's for, and how to talk about it — that powers your outreach copy."
            action={
              <Button asChild variant="gradient" size="lg" className="w-full justify-center sm:w-auto">
                <Link href="/blueprints/new">
                  <CirclePlus className="size-[20px]" />
                  New blueprint
                </Link>
              </Button>
            }
          />
          </Reveal>

          <Reveal delay={0.05}>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={5} columns={2} withAvatar />
              ) : (
                <DataTable
                  columns={columns}
                  rows={blueprints}
                  getRowKey={(b) => b.id}
                  onRowClick={(b) => router.push(`/blueprints/${b.id}`)}
                  emptyState={
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="size-[32px] text-outline" />
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        No blueprints yet. Enter a website and let AI draft the context.
                      </p>
                      <Button asChild variant="gradient">
                        <Link href="/blueprints/new">New blueprint</Link>
                      </Button>
                    </div>
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
