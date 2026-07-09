"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { fadeUp, easeOut } from "@/lib/motion";

type CampaignStatus =
  | "draft"
  | "importing"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "error";

interface SequenceStep {
  stepIndex: number;
  dayOffset: number;
  subjectTemplate: string;
  bodyTemplate: string;
}

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  sequence: SequenceStep[];
  blockMinutes: number;
  errorReason: string | null;
}

interface Counts {
  scheduled: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface Lead {
  id: string;
  name: string;
  niche: string | null;
  location: string | null;
  decisionMaker: string | null;
  email: string | null;
  phone: string | null;
  status: "pending" | "scheduled" | "sent" | "bounced" | "failed" | "skipped";
  /** Next scheduled (not yet sent) send time for this lead, if any — drives
   *  the leads-table countdown timer. */
  nextSendAt: string | null;
}

interface LeadTemplateStep {
  stepIndex: number;
  subject: string;
  body: string;
  isOwn: boolean;
}

/** Ticking mm:ss countdown to a lead's next scheduled send — replaces the
 *  static "Niche" column so pacing is visible per-row, not just in the
 *  aggregate progress panel. */
function SendCountdown({ nextSendAt }: { nextSendAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!nextSendAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [nextSendAt]);

  if (!nextSendAt) {
    return <span className="text-on-surface-variant">—</span>;
  }

  const remainingMs = new Date(nextSendAt).getTime() - now;
  if (remainingMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <span className="material-symbols-outlined animate-spin text-[14px]">
          sync
        </span>
        Sending…
      </span>
    );
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return (
    <span className="text-secondary">
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}

/** Modal for viewing/editing the Day 0/3/7 email copy that will actually be
 *  sent to one lead (its own imported copy where set, else the campaign's
 *  fallback sequence) — opened from the leads table's "View emails" button. */
function LeadEmailsModal({
  campaignId,
  lead,
  onClose,
  onSaved,
}: {
  campaignId: string;
  lead: Lead | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [steps, setSteps] = useState<LeadTemplateStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setLoading(true);
    api
      .get<{ leadId: string; steps: LeadTemplateStep[] }>(
        `/api/outreach/campaigns/${campaignId}/leads/${lead.id}/templates`,
      )
      .then((res) => setSteps(res.steps))
      .catch((err: any) =>
        toast.error(err.message || "Failed to load emails"),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, lead?.id]);

  const updateStep = (stepIndex: number, patch: Partial<LeadTemplateStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.stepIndex === stepIndex ? { ...s, ...patch } : s)),
    );
  };

  const handleSave = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await api.put(
        `/api/outreach/campaigns/${campaignId}/leads/${lead.id}/templates`,
        {
          steps: steps.map(({ stepIndex, subject, body }) => ({
            stepIndex,
            subject,
            body,
          })),
        },
      );
      toast.success("Emails updated for this lead");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save emails");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!lead}
      onClose={onClose}
      title={lead ? `Emails for ${lead.name}` : "Emails"}
      subtitle="The exact subject and body this lead will be sent at each step — edit and save to override just this lead."
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-10 font-body-md text-on-surface-variant">
          <span className="material-symbols-outlined mr-2 animate-spin">
            sync
          </span>
          Loading…
        </div>
      ) : (
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {steps.map((step) => (
            <div
              key={step.stepIndex}
              className="rounded-[16px] border border-border-low-alpha bg-bg-cream/30 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-headline-md text-[14px] text-on-surface">
                  {STEP_LABELS[step.stepIndex]}
                </h3>
                {step.isOwn && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-label-md text-[10px] text-primary">
                    Custom copy
                  </span>
                )}
              </div>
              <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                Subject
              </label>
              <input
                value={step.subject}
                onChange={(e) =>
                  updateStep(step.stepIndex, { subject: e.target.value })
                }
                className="mb-3 w-full rounded-lg border border-border-low-alpha bg-white px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                Body
              </label>
              <textarea
                value={step.body}
                onChange={(e) =>
                  updateStep(step.stepIndex, { body: e.target.value })
                }
                rows={5}
                className="w-full resize-none rounded-lg border border-border-low-alpha bg-white px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-3 border-t border-border-low-alpha pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border-low-alpha bg-white px-4 py-2 font-label-md text-[12px] text-on-surface transition-colors hover:bg-surface-container-low"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-lg bg-primary px-4 py-2 font-label-md text-[12px] text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

const STEP_LABELS = ["Day 0", "Day 3", "Day 7"];
const LEADS_PAGE_SIZE = 10;

const STATUS_STYLE: Record<CampaignStatus, string> = {
  draft: "bg-surface-container-high text-on-surface-variant",
  importing: "bg-secondary-container/30 text-secondary",
  ready: "bg-tertiary-fixed/30 text-on-tertiary-fixed-variant",
  running: "bg-primary/10 text-primary",
  paused: "bg-surface-container-high text-on-surface-variant",
  completed: "bg-tertiary/10 text-tertiary",
  error: "bg-error/10 text-error",
};

const LEAD_STATUS_STYLE: Record<Lead["status"], string> = {
  pending: "bg-surface-container-high text-on-surface-variant",
  scheduled: "bg-secondary-container/30 text-secondary",
  sent: "bg-tertiary/10 text-tertiary",
  bounced: "bg-error/10 text-error",
  failed: "bg-error/10 text-error",
  skipped: "bg-surface-container-high text-on-surface-variant",
};

const ERROR_REASON_LABELS: Record<string, string> = {
  file_missing:
    "The uploaded file could not be found — please try uploading again.",
  no_leads_found:
    "No leads could be read from this file — check it has a name and email for each lead.",
  docx_parse_failed:
    "This file couldn't be read as a .docx — please re-export and try again.",
  import_failed: "Import failed unexpectedly — please try uploading again.",
};

const DEFAULT_SEQUENCE: SequenceStep[] = [
  { stepIndex: 0, dayOffset: 0, subjectTemplate: "", bodyTemplate: "" },
  { stepIndex: 1, dayOffset: 3, subjectTemplate: "", bodyTemplate: "" },
  { stepIndex: 2, dayOffset: 7, subjectTemplate: "", bodyTemplate: "" },
];

/** Compact page-number list with ellipses, e.g. [1, "…", 4, 5, 6, "…", 20] —
 *  keeps the control usable even for a campaign with hundreds of leads. */
function paginationRange(current: number, total: number): (number | "…")[] {
  const delta = 1;
  const pages: number[] = [];
  for (let i = 1; i <= total; i++) {
    if (
      i === 1 ||
      i === total ||
      (i >= current - delta && i <= current + delta)
    ) {
      pages.push(i);
    }
  }
  const withDots: (number | "…")[] = [];
  let last: number | undefined;
  for (const p of pages) {
    if (last !== undefined) {
      if (p - last === 2) withDots.push(last + 1);
      else if (p - last !== 1) withDots.push("…");
    }
    withDots.push(p);
    last = p;
  }
  return withDots;
}

export default function BulkFireCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [counts, setCounts] = useState<Counts>({
    scheduled: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  });
  const [leadCount, setLeadCount] = useState(0);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [sequence, setSequence] = useState<SequenceStep[]>(DEFAULT_SEQUENCE);
  const [savingSequence, setSavingSequence] = useState(false);
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [leadsPage, setLeadsPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [emailsLeadId, setEmailsLeadId] = useState<string | null>(null);

  const [fireStep, setFireStep] = useState(0);
  const [firing, setFiring] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<{
        campaign: Campaign;
        counts: Counts;
        leadCount: number;
      }>(`/api/outreach/campaigns/${id}`);
      setCampaign(res.campaign);
      setCounts(res.counts);
      setLeadCount(res.leadCount);
      setSequence(
        res.campaign.sequence.length === 3
          ? res.campaign.sequence
          : DEFAULT_SEQUENCE,
      );
    } catch (err: any) {
      if (err.status === 404) {
        setNotFound(true);
      } else {
        toast.error(err.message || "Failed to load campaign");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLeads = async (page: number) => {
    try {
      const offset = (page - 1) * LEADS_PAGE_SIZE;
      const res = await api.get<{ leads: Lead[]; total: number }>(
        `/api/outreach/campaigns/${id}/leads?limit=${LEADS_PAGE_SIZE}&offset=${offset}`,
      );
      setLeads(res.leads);
      setLeadCount(res.total);
    } catch (err: any) {
      toast.error(err.message || "Failed to load leads");
    }
  };

  useEffect(() => {
    load();
    loadLeads(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sends and the docx import both run as background jobs — poll until the
  // campaign settles into a state that no longer changes on its own.
  useEffect(() => {
    if (campaign?.status !== "running" && campaign?.status !== "importing")
      return;
    const interval = setInterval(() => {
      load();
      loadLeads(leadsPage);
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status, leadsPage]);

  const handleSaveSequence = async () => {
    setSavingSequence(true);
    try {
      await api.put(`/api/outreach/campaigns/${id}/sequence`, { sequence });
      toast.success("Sequence saved");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save sequence");
    } finally {
      setSavingSequence(false);
    }
  };

  const updateStep = (index: number, patch: Partial<SequenceStep>) => {
    setSequence((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const triggerBrowse = () => fileInputRef.current?.click();

  const handleFiles = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Only .docx lead playbooks are supported");
      return;
    }
    uploadLeadsDocx(file);
  };

  const uploadLeadsDocx = async (file: File) => {
    setUploadProgress(5);
    try {
      const presign = await api.post<{ fileKey: string; uploadUrl: string }>(
        `/api/outreach/campaigns/${id}/leads/upload/request`,
        {
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        },
      );
      setUploadProgress(20);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presign.uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(
              Math.round((event.loaded / event.total) * 60) + 20,
            );
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Storage upload failed: status ${xhr.status}`));
        };
        xhr.onerror = () =>
          reject(new Error("Network error during storage upload"));
        xhr.send(file);
      });

      setUploadProgress(85);
      await api.post(`/api/outreach/campaigns/${id}/leads/upload/complete`, {
        fileKey: presign.fileKey,
      });

      setUploadProgress(100);
      toast.success(`Importing leads from "${file.name}"…`);
      // Refresh BOTH the campaign (status/leadCount) and the leads table —
      // the import can finish synchronously (dev/in-process queue), so by the
      // time this resolves the leads may already exist. Previously only
      // `load()` ran here, which is why the table could still say "No leads
      // imported yet" even after the header showed the new lead count.
      setSelectedIds(new Set());
      setLeadsPage(1);
      await Promise.all([load(), loadLeads(1)]);
    } catch (err: any) {
      toast.error(err.message || "Failed to import leads");
    } finally {
      setTimeout(() => setUploadProgress(null), 600);
    }
  };

  const totalLeadsPages = Math.max(1, Math.ceil(leadCount / LEADS_PAGE_SIZE));

  const goToLeadsPage = (page: number) => {
    const next = Math.min(Math.max(1, page), totalLeadsPages);
    setLeadsPage(next);
    loadLeads(next);
  };

  const selectableIds = leads.filter((l) => !!l.email).map((l) => l.id);
  const allSelectedOnPage =
    selectableIds.length > 0 &&
    selectableIds.every((lid) => selectedIds.has(lid));
  const someSelectedOnPage = selectableIds.some((lid) => selectedIds.has(lid));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someSelectedOnPage && !allSelectedOnPage;
    }
  }, [someSelectedOnPage, allSelectedOnPage]);

  const toggleLead = (leadId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        selectableIds.forEach((lid) => next.delete(lid));
      } else {
        selectableIds.forEach((lid) => next.add(lid));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleFire = async () => {
    setFiring(true);
    try {
      const leadIds =
        selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const res = await api.post<{ scheduled: number }>(
        `/api/outreach/campaigns/${id}/fire`,
        {
          stepIndex: fireStep,
          ...(leadIds ? { leadIds } : {}),
        },
      );
      toast.success(
        `Scheduled ${res.scheduled} send${res.scheduled === 1 ? "" : "s"}`,
      );
      clearSelection();
      load();
      loadLeads(leadsPage);
    } catch (err: any) {
      toast.error(err.message || "Failed to fire campaign");
    } finally {
      setFiring(false);
    }
  };

  const runControl = async (action: "pause" | "resume" | "stop") => {
    setControlBusy(true);
    try {
      await api.post(`/api/outreach/campaigns/${id}/${action}`);
      toast.success(
        action === "pause"
          ? "Campaign paused"
          : action === "resume"
            ? "Campaign resumed"
            : "Campaign stopped",
      );
      load();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} campaign`);
    } finally {
      setControlBusy(false);
    }
  };

  if (notFound) {
    return (
      <AppShell>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant">
            search_off
          </span>
          <h1 className="font-headline-lg text-headline-lg text-primary">
            Campaign not found
          </h1>
          <p className="font-body-md text-on-surface-variant">
            It may have been deleted, or you may not have access to it.
          </p>
          <Link
            href="/outreach/bulk-fire"
            className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container"
          >
            Back to Bulk Fire
          </Link>
        </main>
      </AppShell>
    );
  }

  if (loading || !campaign) {
    return (
      <AppShell>
        <main className="flex min-h-screen items-center justify-center font-body-md text-on-surface-variant">
          <span className="material-symbols-outlined mr-2 animate-spin">
            sync
          </span>{" "}
          Loading campaign…
        </main>
      </AppShell>
    );
  }

  const totalSent = counts.sent + counts.failed + counts.skipped;
  const totalTracked = counts.scheduled + totalSent;
  const progressPct =
    totalTracked === 0 ? 0 : Math.round((totalSent / totalTracked) * 100);

  return (
    <AppShell>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) =>
          e.target.files && handleFiles(Array.from(e.target.files))
        }
        accept=".docx"
        className="hidden"
        aria-label="Upload leads docx hidden input"
      />
      <TopAppBar
        leftContent={
          <div className="flex items-center gap-2 text-text-muted font-label-md">
            <Link
              href="/outreach/bulk-fire"
              className="hover:text-primary transition-colors"
            >
              Bulk Fire
            </Link>
            <span className="material-symbols-outlined text-sm">
              chevron_right
            </span>
            <span className="text-on-surface font-medium truncate max-w-[220px]">
              {campaign.name}
            </span>
          </div>
        }
        rightContent={
          <div className="flex items-center gap-2">
            {campaign.status === "running" && (
              <button
                type="button"
                disabled={controlBusy}
                onClick={() => runControl("pause")}
                className="rounded-lg border border-border-low-alpha bg-white px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
              >
                Pause
              </button>
            )}
            {campaign.status === "paused" && (
              <button
                type="button"
                disabled={controlBusy}
                onClick={() => runControl("resume")}
                className="rounded-lg border border-border-low-alpha bg-white px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
              >
                Resume
              </button>
            )}
            {(campaign.status === "running" ||
              campaign.status === "paused") && (
              <button
                type="button"
                disabled={controlBusy}
                onClick={() => runControl("stop")}
                className="rounded-lg border border-error/20 bg-white px-4 py-2 font-label-md text-label-md text-error transition-colors hover:bg-error/5 disabled:opacity-50"
              >
                Stop
              </button>
            )}
          </div>
        }
      />

      <main className="mx-auto max-w-[1160px] p-4 sm:p-6 lg:p-12 min-h-screen">
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
              {campaign.name}
            </h1>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 font-label-md text-[11px] capitalize ${STATUS_STYLE[campaign.status]}`}
              >
                {campaign.status}
              </span>
              <span className="font-data-mono text-[12px] text-text-muted">
                {leadCount} leads
              </span>
            </div>
            {campaign.status === "error" && campaign.errorReason && (
              <p className="mt-2 font-body-md text-[13px] text-error">
                {ERROR_REASON_LABELS[campaign.errorReason] ??
                  campaign.errorReason}
              </p>
            )}
            
            {/* Mobile/Tablet campaign controls */}
            <div className="flex flex-wrap items-center gap-2 mt-4 lg:hidden">
              {campaign.status === "running" && (
                <button
                  type="button"
                  disabled={controlBusy}
                  onClick={() => runControl("pause")}
                  className="rounded-lg border border-border-low-alpha bg-white px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
                >
                  Pause
                </button>
              )}
              {campaign.status === "paused" && (
                <button
                  type="button"
                  disabled={controlBusy}
                  onClick={() => runControl("resume")}
                  className="rounded-lg border border-border-low-alpha bg-white px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
                >
                  Resume
                </button>
              )}
              {(campaign.status === "running" ||
                campaign.status === "paused") && (
                <button
                  type="button"
                  disabled={controlBusy}
                  onClick={() => runControl("stop")}
                  className="rounded-lg border border-error/20 bg-white px-4 py-2 font-label-md text-label-md text-error transition-colors hover:bg-error/5 disabled:opacity-50"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Progress panel — animated, polled while running */}
        <AnimatePresence>
          {(campaign.status === "running" || totalTracked > 0) && (
            <motion.section
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0 }}
              className="mb-10 rounded-[20px] border border-border-low-alpha bg-white p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-headline-md text-[18px] text-on-surface">
                  Send progress
                </h2>
                <span className="font-data-mono text-[13px] text-text-muted">
                  {totalSent} / {totalTracked} sent
                </span>
              </div>
              <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                <motion.div
                  className="h-full bg-primary"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    label: "Scheduled",
                    value: counts.scheduled,
                    color: "text-secondary",
                  },
                  { label: "Sent", value: counts.sent, color: "text-tertiary" },
                  {
                    label: "Failed",
                    value: counts.failed,
                    color: "text-error",
                  },
                  {
                    label: "Skipped",
                    value: counts.skipped,
                    color: "text-on-surface-variant",
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-xl bg-bg-cream/40 p-3 text-center"
                  >
                    <div
                      className={`font-data-mono text-[22px] font-semibold ${c.color}`}
                    >
                      {c.value}
                    </div>
                    <div className="font-label-md text-[11px] uppercase tracking-wide text-text-muted">
                      {c.label}
                    </div>
                  </div>
                ))}
              </div>
              {campaign.status === "running" && (
                <div className="mt-4 flex items-center gap-2 font-label-md text-[12px] text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin text-[16px]">
                    sync
                  </span>
                  Sending durably in the background — safe to close this tab.
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Leads import */}
        <section className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-headline-md text-[18px] text-on-surface">
              Leads
            </h2>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="font-label-md text-[12px] text-primary">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="font-label-md text-[12px] text-on-surface-variant underline underline-offset-2 transition-colors hover:text-on-surface"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files)
                handleFiles(Array.from(e.dataTransfer.files));
            }}
            onClick={triggerBrowse}
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed p-8 text-center transition-all ${
              dragging
                ? "border-primary bg-primary/5 scale-[1.005]"
                : "border-border-low-alpha hover:border-primary/50"
            }`}
          >
            <span className="material-symbols-outlined mb-2 text-[32px] text-primary">
              cloud_upload
            </span>
            <p className="font-body-md text-on-surface">
              Drag &amp; drop a leads playbook (.docx), or{" "}
              <span className="font-semibold text-primary underline underline-offset-4">
                browse
              </span>
            </p>
            <p className="mt-1 font-label-md text-[11px] uppercase tracking-wider text-on-surface-variant">
              One .docx · up to 10MB
            </p>
          </div>

          {uploadProgress !== null && (
            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {leads.length === 0 ? (
            <div className="rounded-[20px] border border-border-low-alpha bg-white p-8 text-center font-body-md text-on-surface-variant">
              No leads imported yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-[20px] border border-border-low-alpha bg-white">
                <table className="w-full text-left">
                  <thead className="border-b border-border-low-alpha bg-surface-container-low">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allSelectedOnPage}
                          onChange={toggleSelectAllOnPage}
                          disabled={selectableIds.length === 0}
                          aria-label="Select all leads on this page"
                          className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20 disabled:opacity-40"
                        />
                      </th>
                      {[
                        "Name",
                        "Next send",
                        "Emails",
                        "Decision maker",
                        "Email",
                        "Status",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr
                        key={lead.id}
                        onClick={() => lead.email && toggleLead(lead.id)}
                        className={`border-b border-border-low-alpha last:border-0 ${
                          lead.email
                            ? "cursor-pointer hover:bg-surface-container-low/50"
                            : ""
                        } ${selectedIds.has(lead.id) ? "bg-primary/5" : ""}`}
                      >
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(lead.id)}
                            onChange={() => toggleLead(lead.id)}
                            disabled={!lead.email}
                            aria-label={`Select ${lead.name}`}
                            title={
                              lead.email
                                ? undefined
                                : "No email on file — can't be sent to"
                            }
                            className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-4 py-3 font-body-md text-[13px] text-on-surface">
                          {lead.name}
                        </td>
                        <td className="px-4 py-3 font-data-mono text-[12px]">
                          <SendCountdown nextSendAt={lead.nextSendAt} />
                        </td>
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setEmailsLeadId(lead.id)}
                            className="rounded-lg border border-border-low-alpha bg-white px-3 py-1.5 font-label-md text-[11px] text-on-surface transition-colors hover:bg-surface-container-low"
                          >
                            View emails
                          </button>
                        </td>
                        <td className="px-4 py-3 font-body-md text-[13px] text-on-surface-variant">
                          {lead.decisionMaker || "—"}
                        </td>
                        <td className="px-4 py-3 font-data-mono text-[12px] text-on-surface-variant">
                          {lead.email || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-label-md text-[11px] capitalize ${LEAD_STATUS_STYLE[lead.status]}`}
                          >
                            {lead.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                <span className="font-body-md text-[12px] text-on-surface-variant">
                  Showing {(leadsPage - 1) * LEADS_PAGE_SIZE + 1}–
                  {Math.min(leadsPage * LEADS_PAGE_SIZE, leadCount)} of{" "}
                  {leadCount}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => goToLeadsPage(leadsPage - 1)}
                    disabled={leadsPage <= 1}
                    aria-label="Previous page"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-low-alpha text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      chevron_left
                    </span>
                  </button>
                  {paginationRange(leadsPage, totalLeadsPages).map((p, i) =>
                    p === "…" ? (
                      <span
                        key={`ellipsis-${i}`}
                        className="px-1 font-label-md text-[12px] text-on-surface-variant"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => goToLeadsPage(p)}
                        aria-current={p === leadsPage ? "page" : undefined}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg font-label-md text-[12px] transition-colors ${
                          p === leadsPage
                            ? "bg-primary text-on-primary"
                            : "border border-border-low-alpha text-on-surface-variant hover:bg-surface-container-low"
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => goToLeadsPage(leadsPage + 1)}
                    disabled={leadsPage >= totalLeadsPages}
                    aria-label="Next page"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-low-alpha text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      chevron_right
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Fallback sequence — collapsed by default. Most leads carry their
            own imported copy (see the docx templates), so this only matters
            as a shared default for leads that don't. */}
        <section className="mb-10 rounded-[20px] border border-border-low-alpha bg-white">
          <button
            type="button"
            onClick={() => setSequenceOpen((o) => !o)}
            aria-expanded={sequenceOpen}
            className="flex w-full items-center justify-between gap-4 p-5 text-left"
          >
            <div>
              <h2 className="font-headline-md text-[16px] text-on-surface">
                Fallback sequence{" "}
                <span className="font-label-md text-[11px] font-normal text-on-surface-variant">
                  (optional)
                </span>
              </h2>
              <p className="mt-0.5 font-body-md text-[12px] text-on-surface-variant">
                Only used for leads that don&apos;t carry their own custom email
                copy from the imported playbook.
              </p>
            </div>
            <span
              className={`material-symbols-outlined shrink-0 text-on-surface-variant transition-transform duration-200 ${
                sequenceOpen ? "rotate-180" : ""
              }`}
            >
              expand_more
            </span>
          </button>

          <AnimatePresence initial={false}>
            {sequenceOpen && (
              <motion.div
                key="sequence-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: easeOut }}
                className="overflow-hidden border-t border-border-low-alpha"
              >
                <div className="p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-1 rounded-lg bg-surface-container-low p-1">
                      {STEP_LABELS.map((label, i) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setActiveStep(i)}
                          className={`rounded-md px-3 py-1.5 font-label-md text-[12px] transition-colors ${
                            activeStep === i
                              ? "bg-white text-primary shadow-sm"
                              : "text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {label}{" "}
                          <span className="text-[10px] text-text-muted">
                            +{sequence[i].dayOffset}d
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveSequence}
                      disabled={savingSequence}
                      className="rounded-lg bg-primary px-4 py-2 font-label-md text-[12px] text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
                    >
                      {savingSequence ? "Saving…" : "Save sequence"}
                    </button>
                  </div>

                  <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                    Subject
                  </label>
                  <input
                    value={sequence[activeStep].subjectTemplate}
                    onChange={(e) =>
                      updateStep(activeStep, {
                        subjectTemplate: e.target.value,
                      })
                    }
                    placeholder="{Quick question|Following up} about {{niche}} leads"
                    className="mb-3 w-full rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                    Body
                  </label>
                  <textarea
                    value={sequence[activeStep].bodyTemplate}
                    onChange={(e) =>
                      updateStep(activeStep, { bodyTemplate: e.target.value })
                    }
                    rows={5}
                    placeholder={
                      "Hi {{decisionMaker}},\n\n{I noticed|I came across} {{name}} and thought..."
                    }
                    className="w-full resize-none rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-3 font-label-md text-[11px] text-text-muted">
                    Use{" "}
                    <span className="font-data-mono">
                      {"{option a|option b}"}
                    </span>{" "}
                    for spintax and{" "}
                    <span className="font-data-mono">{"{{name}}"}</span>/
                    <span className="font-data-mono">{"{{niche}}"}</span>/
                    <span className="font-data-mono">
                      {"{{decisionMaker}}"}
                    </span>{" "}
                    for per-lead personalization.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Fire controls */}
        <section className="mb-10 rounded-[20px] border border-border-low-alpha bg-white p-6">
          <h2 className="mb-4 font-headline-md text-[18px] text-on-surface">
            Fire
          </h2>
          <p className="mb-4 font-body-md text-[13px] text-on-surface-variant">
            {selectedIds.size > 0
              ? `Fires the selected step to only your ${selectedIds.size} selected lead${selectedIds.size === 1 ? "" : "s"} (still limited to whichever are eligible for it).`
              : "Fires one sequence step to every lead eligible for it — a lead that already received its Day 0 email is still eligible for Day 3. Select specific rows above to fire to only some leads."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={fireStep}
              onChange={(e) => setFireStep(Number(e.target.value))}
              className="rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {STEP_LABELS.map((label, i) => (
                <option key={i} value={i}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleFire}
              disabled={firing || leadCount === 0}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
            >
              {firing
                ? "Scheduling…"
                : selectedIds.size > 0
                  ? `Fire ${STEP_LABELS[fireStep]} to ${selectedIds.size} selected`
                  : `Fire ${STEP_LABELS[fireStep]} to all eligible`}
            </button>
          </div>
        </section>
      </main>

      <LeadEmailsModal
        campaignId={id}
        lead={leads.find((l) => l.id === emailsLeadId) ?? null}
        onClose={() => setEmailsLeadId(null)}
        onSaved={() => loadLeads(leadsPage)}
      />
    </AppShell>
  );
}
