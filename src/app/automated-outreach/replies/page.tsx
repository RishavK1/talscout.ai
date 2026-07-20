"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ReplyDraft {
  id: string;
  campaignId: string;
  leadId: string;
  sendId: string;
  inboundSubject: string | null;
  inboundBody: string;
  draftBody: string;
  reasoning: string | null;
  confidence: string | null;
  status: "pending" | "approved" | "rejected" | "sent";
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AutomatedRepliesPage() {
  const [drafts, setDrafts] = useState<ReplyDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get<{ drafts: ReplyDraft[] }>("/api/automated-replies?limit=100");
      setDrafts(res.drafts);
    } catch (err) {
      if (!silent) toast.error(err instanceof ApiError ? err.message : "Failed to load replies");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, []);

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  const selectDraft = (draft: ReplyDraft) => {
    setSelectedId(draft.id);
    setEditBody(draft.draftBody);
  };

  const approve = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/automated-replies/${selected.id}/approve`, {
        draftBody: editBody !== selected.draftBody ? editBody : undefined,
      });
      toast.success("Reply approved and sent");
      setSelectedId(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to send reply");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/automated-replies/${selected.id}/reject`);
      toast.success("Reply rejected");
      setSelectedId(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to reject reply");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api.post<ReplyDraft>(`/api/automated-replies/${selected.id}/regenerate`);
      toast.success("Draft regenerated");
      setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setEditBody(updated.draftBody);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to regenerate");
    } finally {
      setBusy(false);
    }
  };

  const confidence = selected?.confidence != null ? Number(selected.confidence) : null;

  return (
    <AppShell>
      <div className="flex min-h-screen flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <span>Reply Review</span>
            </div>
          }
        />
        {/* Gmail-style split view. On lg+ the panes sit side by side inside a
            viewport-height container and scroll independently; on mobile it
            collapses to a single pane — list first, detail (with a back
            button) once a draft is selected. */}
        <main className="flex flex-1 lg:h-[calc(100dvh-73px)] lg:overflow-hidden">
          {/* Left pane: pending list */}
          <div
            className={cn(
              "w-full flex-col border-r border-border-low-alpha bg-white/60 lg:flex lg:w-[400px] lg:shrink-0",
              selected ? "hidden" : "flex",
            )}
          >
            <div className="shrink-0 border-b border-border-low-alpha p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  <span className="material-symbols-outlined text-[20px]">forum</span>
                </div>
                <div>
                  <h2 className="font-headline-md text-headline-md text-primary">
                    Pending replies{!loading && ` (${drafts.length})`}
                  </h2>
                  <p className="font-body-md text-[12px] text-text-muted">
                    AI drafts wait here until you approve them.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 p-8 font-body-md text-text-muted">
                  <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                  Loading...
                </div>
              ) : drafts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-low">
                    <span className="material-symbols-outlined text-[28px] text-outline">mark_email_read</span>
                  </div>
                  <p className="font-body-md text-body-md text-text-muted">
                    All clear — no replies waiting for review.
                  </p>
                </div>
              ) : (
                drafts.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => selectDraft(d)}
                    className={cn(
                      "flex w-full gap-3 border-b border-border-low-alpha p-4 text-left transition-colors",
                      selectedId === d.id
                        ? "border-l-2 border-l-primary bg-primary/5"
                        : "hover:bg-surface-container-lowest",
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container text-primary">
                      <span className="material-symbols-outlined text-[18px]">mail</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate font-body-md text-body-md font-medium text-on-surface">
                          {d.inboundSubject || "(no subject)"}
                        </span>
                        <span className="shrink-0 font-data-mono text-[11px] text-text-muted">
                          {formatDate(d.createdAt)}
                        </span>
                      </div>
                      <p className="line-clamp-2 font-body-md text-[13px] text-text-muted">
                        {d.inboundBody}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right pane: detail */}
          <div
            className={cn(
              "flex-1 lg:block lg:min-h-0 lg:overflow-y-auto",
              selected ? "block" : "hidden",
            )}
          >
            {!selected ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-low">
                  <span className="material-symbols-outlined text-[28px] text-outline">drafts</span>
                </div>
                <p className="font-body-md text-body-md text-text-muted">
                  Select a reply to review.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-[720px] space-y-5 p-4 sm:p-6 lg:p-8">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline lg:hidden"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Back to inbox
                </button>

                <div className="rounded-[20px] border border-border-low-alpha bg-white p-5 ambient-shadow sm:p-6">
                  <div className="mb-3 flex items-center gap-2.5">
                    <div className="rounded-lg bg-surface-container-high p-1.5 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px]">move_to_inbox</span>
                    </div>
                    <h3 className="font-headline-md text-[16px] text-on-surface-variant">
                      Incoming message
                    </h3>
                  </div>
                  <p className="mb-2 font-body-md text-body-md font-medium text-on-surface">
                    {selected.inboundSubject || "(no subject)"}
                  </p>
                  <p className="whitespace-pre-wrap font-body-md text-body-md text-on-surface-variant">
                    {selected.inboundBody}
                  </p>
                </div>

                <div className="rounded-[20px] border border-border-low-alpha bg-white p-5 ambient-shadow sm:p-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                      </div>
                      <h3 className="font-headline-md text-[16px] text-primary">AI-drafted reply</h3>
                    </div>
                    {confidence != null && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-label-md text-[11px]",
                          confidence >= 0.7
                            ? "bg-tertiary-fixed/25 text-tertiary-container"
                            : "bg-surface-container-high text-on-surface-variant",
                        )}
                      >
                        <span className="material-symbols-outlined text-[14px]">insights</span>
                        {Math.round(confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={8}
                    className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {selected.reasoning && (
                    <p className="mt-3 rounded-xl bg-surface-container-lowest p-3 font-body-md text-[13px] text-text-muted">
                      <span className="font-medium text-on-surface-variant">AI reasoning:</span>{" "}
                      {selected.reasoning}
                    </p>
                  )}
                </div>

                {selected.status === "pending" && (
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                    <button
                      type="button"
                      onClick={reject}
                      disabled={busy}
                      className="rounded-xl border border-error/30 px-5 py-2.5 font-label-md text-label-md text-error transition-colors hover:bg-error/5 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={regenerate}
                      disabled={busy}
                      className="rounded-xl border border-border-low-alpha px-5 py-2.5 font-label-md text-label-md text-primary transition-colors hover:bg-surface-container-low disabled:opacity-50"
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={approve}
                      disabled={busy}
                      className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
                    >
                      <span className={cn("material-symbols-outlined text-[18px]", busy && "animate-spin")}>
                        {busy ? "sync" : "send"}
                      </span>
                      Approve &amp; send
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
