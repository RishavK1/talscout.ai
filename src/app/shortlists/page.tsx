"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderCard } from "@/components/app/page-header-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeletons";

interface Shortlist {
  id: string;
  name: string;
  createdAt: string;
  candidateCount: number;
  lastUpdated: string | null;
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Never";

export default function ShortlistsPage() {
  const router = useRouter();
  const [shortlists, setShortlists] = useState<Shortlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newShortlistName, setNewShortlistName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadShortlists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ shortlists: Shortlist[] }>("/api/shortlists");
      setShortlists(res.shortlists);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load shortlists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShortlists();
  }, [loadShortlists]);

  const handleOpenModal = () => {
    setNewShortlistName("");
    setIsModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortlistName.trim()) return;
    try {
      setCreating(true);
      await api.post("/api/shortlists", { name: newShortlistName.trim() });
      toast.success("Shortlist created");
      setNewShortlistName("");
      setIsModalOpen(false);
      loadShortlists();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create shortlist");
    } finally {
      setCreating(false);
    }
  };

  const filtered = shortlists.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const totalCandidates = shortlists.reduce((n, s) => n + s.candidateCount, 0);

  const columns: DataTableColumn<Shortlist>[] = [
    {
      key: "name",
      header: "Name",
      render: (s) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
            <span className="material-symbols-outlined text-[18px]">bookmarks</span>
          </div>
          <span className="font-body-md text-[14px] font-medium text-on-surface">{s.name}</span>
        </div>
      ),
    },
    {
      key: "candidates",
      header: "Candidates",
      render: (s) =>
        s.candidateCount > 0 ? (
          <StatusBadge tone="active">
            {s.candidateCount} candidate{s.candidateCount === 1 ? "" : "s"}
          </StatusBadge>
        ) : (
          <StatusBadge tone="draft">Empty</StatusBadge>
        ),
    },
    {
      key: "updated",
      header: "Last updated",
      render: (s) => (
        <span className="font-data-mono text-[12px] text-on-surface-variant">
          {fmtDate(s.lastUpdated)}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (s) => (
        <span className="font-data-mono text-[12px] text-on-surface-variant">
          {fmtDate(s.createdAt)}
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
              <span>Shortlists</span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full">
          <PageHeaderCard
            icon="bookmarks"
            title="Shortlists"
            description="Curated candidate pools for a specific role — group the people worth moving forward and keep your team working from one list."
            action={
              <Button
                type="button"
                variant="gradient"
                size="lg"
                onClick={handleOpenModal}
                className="w-full justify-center sm:w-auto"
              >
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
                New shortlist
              </Button>
            }
          />

          {!loading && shortlists.length > 0 && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              {[
                { icon: "bookmarks", label: "Shortlists", value: shortlists.length },
                { icon: "group", label: "Candidates shortlisted", value: totalCandidates },
              ].map((stat) => (
                <Card key={stat.label} className="[--card-spacing:--spacing(5)]">
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary">
                      <span className="material-symbols-outlined text-[20px]">{stat.icon}</span>
                    </div>
                    <div>
                      <p className="font-data-mono text-[20px] font-semibold text-on-surface">
                        {stat.value}
                      </p>
                      <p className="font-label-md text-[12px] text-text-muted">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {!loading && shortlists.length > 0 && (
                <div className="border-b border-border-low-alpha p-4">
                  <div className="relative max-w-sm">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">
                      search
                    </span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search shortlists…"
                      type="search"
                      aria-label="Search shortlists"
                      className="w-full rounded-xl border border-border-low-alpha bg-surface-container-low py-2.5 pl-10 pr-4 font-body-md text-[13px] text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}
              {loading ? (
                <TableSkeleton rows={5} columns={3} withAvatar />
              ) : (
                <DataTable
                  columns={columns}
                  rows={filtered}
                  getRowKey={(s) => s.id}
                  onRowClick={(s) => router.push(`/shortlists/${s.id}`)}
                  emptyState={
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-outline text-[32px]">
                        bookmarks
                      </span>
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        {shortlists.length === 0
                          ? "No shortlists yet. Create one to start grouping candidates for a role."
                          : `No shortlists match “${search}”.`}
                      </p>
                      {shortlists.length === 0 ? (
                        <Button type="button" variant="gradient" onClick={handleOpenModal}>
                          New shortlist
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" onClick={() => setSearch("")}>
                          Clear search
                        </Button>
                      )}
                    </div>
                  }
                />
              )}
            </CardContent>
          </Card>

          {!loading && shortlists.length === 0 && (
            <p className="mt-6 text-center font-body-md text-[13px] text-text-muted">
              Shortlists draw from your candidate database —{" "}
              <Link href="/upload" className="text-primary underline underline-offset-2">
                upload résumés
              </Link>{" "}
              or{" "}
              <Link href="/search" className="text-primary underline underline-offset-2">
                search candidates
              </Link>{" "}
              to fill one.
            </p>
          )}
        </main>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => !creating && setIsModalOpen(false)}
        title="Create new shortlist"
        subtitle="Organize candidates into a dedicated pool for a specific role."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-6">
          <div>
            <label htmlFor="shortlistName" className="mb-2 block font-label-md text-on-surface">
              Shortlist name
            </label>
            <input
              id="shortlistName"
              type="text"
              required
              disabled={creating}
              autoFocus
              value={newShortlistName}
              onChange={(e) => setNewShortlistName(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer — Q3"
              className="w-full rounded-xl border border-border-low-alpha bg-surface-container-low px-4 py-3 font-body-md text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !newShortlistName.trim()}>
              {creating ? "Creating…" : "Create shortlist"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
