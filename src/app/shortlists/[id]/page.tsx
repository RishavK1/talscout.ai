"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/skeletons";

interface ApiCandidate {
  id: string;
  fullName: string | null;
  emails: string[] | null;
  currentTitle: string | null;
  location: string | null;
  yearsExperience: string | null;
  skills: string[] | null;
  status: "ready" | "processing" | "error";
  addedAt: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  title: string;
  location: string;
  expLabel: string;
  skills: string[];
  status: "Ready" | "Processing" | "Error";
  initials: string;
}

const SKILL_PLAIN =
  "rounded bg-surface-container text-on-surface-variant border-border-low-alpha font-label-md text-[12px]";
const SKILL_SECONDARY =
  "rounded bg-secondary-container/20 text-on-secondary-container border-secondary-container/30 font-label-md text-[12px]";
const SKILL_TERTIARY =
  "rounded bg-tertiary-fixed/40 text-on-tertiary-fixed-variant border-tertiary-fixed font-label-md text-[12px]";

function getSkillBadgeClass(index: number) {
  if (index % 3 === 0) return SKILL_SECONDARY;
  if (index % 3 === 1) return SKILL_TERTIARY;
  return SKILL_PLAIN;
}

function CandidateStatusBadge({ status }: { status: Candidate["status"] }) {
  if (status === "Ready") {
    return <StatusBadge tone="active">Ready</StatusBadge>;
  }
  if (status === "Processing") {
    return (
      <StatusBadge tone="invited" dot={false} className="gap-1.5">
        <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
        AI Processing
      </StatusBadge>
    );
  }
  return <StatusBadge tone="error">Error</StatusBadge>;
}

export default function ShortlistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [shortlistName, setShortlistName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ shortlist: { id: string; name: string }; candidates: ApiCandidate[] }>(
        `/api/shortlists/${id}/items`
      );
      setShortlistName(res.shortlist.name);
      setCandidates(
        res.candidates.map((item): Candidate => {
          const name = item.fullName || "Unnamed Candidate";
          const initials =
            name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "C";
          return {
            id: item.id,
            name,
            email: (item.emails && item.emails[0]) || "no-email@example.com",
            title: item.currentTitle || "Unnamed Role",
            location: item.location || "Unknown",
            expLabel: item.yearsExperience ? String(Math.round(parseFloat(item.yearsExperience))).padStart(2, "0") : "00",
            skills: item.skills || [],
            status: item.status === "ready" ? "Ready" : item.status === "processing" ? "Processing" : "Error",
            initials,
          };
        })
      );
    } catch (err: any) {
      if (err.status === 404) {
        setNotFound(true);
      } else {
        toast.error(err.message || "Failed to load shortlist");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleRemove = async (candidateId: string, name: string) => {
    setRemovingId(candidateId);
    try {
      await api.delete(`/api/shortlists/${id}/items?candidateId=${candidateId}`);
      toast.success(`Removed ${name} from shortlist`);
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    } catch (err: any) {
      toast.error(err.message || "Failed to remove candidate");
    } finally {
      setRemovingId(null);
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    await handleRemove(pendingRemove.id, pendingRemove.name);
    setPendingRemove(null);
  };

  if (notFound) {
    return (
      <AppShell>
        <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-12">
          <Card className="max-w-md [--card-spacing:--spacing(8)]">
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant">search_off</span>
              <h1 className="font-headline-lg text-headline-lg text-primary">Shortlist not found</h1>
              <p className="font-body-md text-on-surface-variant">It may have been deleted, or you may not have access to it.</p>
              <Button asChild variant="gradient">
                <Link href="/shortlists">Back to Shortlists</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </AppShell>
    );
  }

  const columns: DataTableColumn<Candidate>[] = [
    {
      key: "candidate",
      header: "Candidate",
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container font-headline-md text-on-primary shrink-0">
            {c.initials}
          </div>
          <div>
            <div className="font-label-md text-label-md font-semibold text-primary">{c.name}</div>
            <div className="font-body-md text-[13px] text-on-surface-variant">{c.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (c) => <span className="text-[14px] text-on-surface">{c.title}</span>,
    },
    {
      key: "location",
      header: "Location",
      render: (c) => <span className="text-[14px] text-on-surface-variant">{c.location}</span>,
    },
    {
      key: "skills",
      header: "Top Skills",
      render: (c) => (
        <div className="flex flex-wrap gap-1.5">
          {c.skills.slice(0, 3).map((skill, i) => (
            <Badge key={skill} variant="outline" className={getSkillBadgeClass(i)}>{skill}</Badge>
          ))}
          {c.skills.length > 3 && <Badge variant="outline" className={SKILL_PLAIN}>+{c.skills.length - 3}</Badge>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => <CandidateStatusBadge status={c.status} />,
    },
    {
      key: "actions",
      header: "",
      cellClassName: "text-right",
      render: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={removingId === c.id}
            onClick={() => setPendingRemove({ id: c.id, name: c.name })}
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
            aria-label={`Remove ${c.name} from shortlist`}
            title="Remove from shortlist"
          >
            <span className="material-symbols-outlined text-[20px]">
              {removingId === c.id ? "sync" : "close"}
            </span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <TopAppBar
        leftContent={
          <div className="flex items-center gap-2 text-text-muted font-label-md">
            <Link href="/shortlists" className="hover:text-primary transition-colors">Shortlists</Link>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-on-surface font-medium">{shortlistName || "..."}</span>
          </div>
        }
        rightContent={
          <Button asChild variant="gradient" className="whitespace-nowrap">
            <Link href="/upload">+ Upload résumés</Link>
          </Button>
        }
      />
      <main className="mx-auto max-w-[1440px] w-full p-4 sm:p-6 lg:p-12 min-h-screen">
        <Card className="mb-8 [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container shrink-0">
                  <span className="material-symbols-outlined text-[22px]">bookmark</span>
                </div>
                <div>
                  <h1 className="font-headline-lg text-headline-lg text-primary mb-1">{shortlistName || "Shortlist"}</h1>
                  {loading ? (
                    <Skeleton className="h-4 w-40" />
                  ) : (
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {`${candidates.length} candidate${candidates.length === 1 ? "" : "s"} in this shortlist.`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="overflow-x-auto p-0">
            {loading ? (
              <TableSkeleton rows={5} columns={4} />
            ) : candidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant">group_off</span>
                <p className="font-body-md text-on-surface-variant">No candidates in this shortlist yet.</p>
                <Link href="/candidates" className="font-label-md text-primary hover:underline">
                  Browse candidates to add some →
                </Link>
              </div>
            ) : (
              <DataTable
                columns={columns}
                rows={candidates}
                getRowKey={(c) => c.id}
                onRowClick={(c) => router.push(`/candidates/${c.id}`)}
              />
            )}
          </CardContent>
        </Card>
      </main>
      <ConfirmDialog
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={confirmRemove}
        title="Remove candidate"
        description={
          pendingRemove
            ? `Remove ${pendingRemove.name} from this shortlist? This can't be undone.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
      />
    </AppShell>
  );
}
