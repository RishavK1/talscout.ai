"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TableRowSkeleton } from "@/components/ui/skeletons";

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
  intent: "interested" | "not_interested" | "referral" | "unclear" | null;
  status: "pending" | "approved" | "rejected" | "sent";
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const INTENT_META: Record<
  NonNullable<ReplyDraft["intent"]>,
  { label: string; icon: string; className: string }
> = {
  interested: {
    label: "Interested",
    icon: "thumb_up",
    className: "bg-tertiary-fixed/20 text-tertiary",
  },
  not_interested: {
    label: "Not interested",
    icon: "thumb_down",
    className: "bg-error-container text-on-error-container",
  },
  referral: {
    label: "Referral",
    icon: "forward",
    className: "bg-primary-container/10 text-primary",
  },
  unclear: {
    label: "Unclear",
    icon: "help",
    className: "bg-surface-container-high text-on-surface-variant",
  },
};

function IntentBadge({ intent }: { intent: ReplyDraft["intent"] }) {
  if (!intent) return null;
  const meta = INTENT_META[intent];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-label-md text-[11px] font-semibold",
        meta.className,
      )}
    >
      <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
      {meta.label}
    </span>
  );
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
        {/* AppShell's SidebarInset already renders a <main> around this page
         *  — a second <main> here breaks the screen-reader landmark, so this
         *  is a plain div even though it plays the same layout role. */}
        <div className="flex flex-1 lg:h-[calc(100dvh-73px)] lg:overflow-hidden">
          {/* Left pane: pending list */}
          <Card
            className={cn(
              "w-full flex-col gap-0 rounded-none border-0 border-r border-border-low-alpha py-0 ring-0 lg:flex lg:w-[400px] lg:shrink-0",
              selected ? "hidden" : "flex",
            )}
          >
            <CardHeader className="shrink-0 border-b border-border-low-alpha px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-primary-container/10 p-2 text-primary">
                  <span className="material-symbols-outlined text-[20px]">forum</span>
                </div>
                <div>
                  <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                    Pending replies{!loading && ` (${drafts.length})`}
                  </CardTitle>
                  <p className="font-body-md text-[12px] text-text-muted">
                    AI drafts wait here until you approve them.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 lg:min-h-0 lg:overflow-y-auto">
              {loading ? (
                <div className="divide-y divide-border-low-alpha">
                  {Array.from({ length: 5 }, (_, i) => (
                    <TableRowSkeleton key={i} columns={0} />
                  ))}
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
                        ? "border-l-2 border-l-tertiary-fixed-dim bg-tertiary-fixed/10"
                        : "hover:bg-tertiary-fixed/5",
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container/10 text-primary">
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
                      {d.intent && (
                        <div className="mt-1.5">
                          <IntentBadge intent={d.intent} />
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

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
                {/* TopAppBar (carrying the page title) is hidden below lg, and
                 *  this pane's own title (the "Pending replies" CardHeader)
                 *  is hidden once a draft is selected — without this, the
                 *  detail screen has no page-identity heading on mobile at
                 *  all beyond a small back link. min-h-10 also brings the
                 *  back link itself up to the app's usual touch-target size
                 *  (it had none before, ~20px tall). */}
                <div className="flex items-center justify-between gap-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="-ml-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-label-md text-label-md text-primary hover:underline"
                  >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    Back to inbox
                  </button>
                  <span className="font-label-md text-[12px] text-text-muted">Reply detail</span>
                </div>

                <Card className="[--card-spacing:--spacing(6)]">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-surface-container-high p-1.5 text-on-surface-variant">
                          <span className="material-symbols-outlined text-[18px]">move_to_inbox</span>
                        </div>
                        <CardTitle className="font-body-md text-[16px] font-semibold text-on-surface-variant">
                          Incoming message
                        </CardTitle>
                      </div>
                      <IntentBadge intent={selected.intent} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-2 font-body-md text-body-md font-medium text-on-surface">
                      {selected.inboundSubject || "(no subject)"}
                    </p>
                    <p className="whitespace-pre-wrap font-body-md text-body-md text-on-surface-variant">
                      {selected.inboundBody}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border border-primary-container/25 bg-primary-container/[0.03] [--card-spacing:--spacing(6)]">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-primary-container/10 p-1.5 text-primary">
                          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                        </div>
                        <CardTitle className="font-body-md text-[16px] font-semibold text-primary">
                          AI-drafted reply
                        </CardTitle>
                      </div>
                      {confidence != null && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-label-md text-[11px] font-semibold",
                            confidence >= 0.7
                              ? "bg-tertiary-fixed/20 text-tertiary"
                              : "bg-surface-container-high text-on-surface-variant",
                          )}
                        >
                          <span className="material-symbols-outlined text-[14px]">insights</span>
                          {Math.round(confidence * 100)}% confidence
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={8}
                      className="w-full rounded-xl border border-border-low-alpha bg-surface-white px-4 py-3 font-body-md text-on-surface placeholder-outline-variant focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {selected.reasoning && (
                      <p className="mt-3 rounded-xl border border-border-low-alpha bg-surface-container-low p-3 font-body-md text-[13px] text-on-surface-variant">
                        <span className="font-medium text-on-surface">AI reasoning:</span> {selected.reasoning}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {selected.status === "pending" && (
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button type="button" variant="destructive" size="lg" onClick={reject} disabled={busy} className="w-full sm:w-auto">
                      Reject
                    </Button>
                    <Button type="button" variant="outline" size="lg" onClick={regenerate} disabled={busy} className="w-full sm:w-auto">
                      Regenerate
                    </Button>
                    <Button type="button" variant="gradient" size="lg" onClick={approve} disabled={busy} className="w-full sm:w-auto">
                      <span className={cn("material-symbols-outlined text-[18px]", busy && "animate-spin")}>
                        {busy ? "sync" : "send"}
                      </span>
                      Approve &amp; send
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
