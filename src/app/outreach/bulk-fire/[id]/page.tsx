"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { fadeUp, stagger, item as itemVariants } from "@/lib/motion";

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
}

const STEP_LABELS = ["Day 0", "Day 3", "Day 7"];

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
  file_missing: "The uploaded file could not be found — please try uploading again.",
  no_leads_found: "No leads could be read from this file — check it has a name and email for each lead.",
  docx_parse_failed: "This file couldn't be read as a .docx — please re-export and try again.",
  import_failed: "Import failed unexpectedly — please try uploading again.",
};

const DEFAULT_SEQUENCE: SequenceStep[] = [
  { stepIndex: 0, dayOffset: 0, subjectTemplate: "", bodyTemplate: "" },
  { stepIndex: 1, dayOffset: 3, subjectTemplate: "", bodyTemplate: "" },
  { stepIndex: 2, dayOffset: 7, subjectTemplate: "", bodyTemplate: "" },
];

export default function BulkFireCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [counts, setCounts] = useState<Counts>({ scheduled: 0, sent: 0, failed: 0, skipped: 0 });
  const [leadCount, setLeadCount] = useState(0);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [sequence, setSequence] = useState<SequenceStep[]>(DEFAULT_SEQUENCE);
  const [savingSequence, setSavingSequence] = useState(false);

  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fireStep, setFireStep] = useState(0);
  const [firing, setFiring] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<{ campaign: Campaign; counts: Counts; leadCount: number }>(
        `/api/outreach/campaigns/${id}`,
      );
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

  const loadLeads = async () => {
    try {
      const res = await api.get<{ leads: Lead[] }>(`/api/outreach/campaigns/${id}/leads`);
      setLeads(res.leads);
    } catch (err: any) {
      toast.error(err.message || "Failed to load leads");
    }
  };

  useEffect(() => {
    load();
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sends and the docx import both run as background jobs — poll until the
  // campaign settles into a state that no longer changes on its own.
  useEffect(() => {
    if (campaign?.status !== "running" && campaign?.status !== "importing") return;
    const interval = setInterval(() => {
      load();
      loadLeads();
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status]);

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
    setSequence((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
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
            setUploadProgress(Math.round((event.loaded / event.total) * 60) + 20);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Storage upload failed: status ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error during storage upload"));
        xhr.send(file);
      });

      setUploadProgress(85);
      await api.post(`/api/outreach/campaigns/${id}/leads/upload/complete`, {
        fileKey: presign.fileKey,
      });

      setUploadProgress(100);
      toast.success(`Importing leads from "${file.name}"…`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to import leads");
    } finally {
      setTimeout(() => setUploadProgress(null), 600);
    }
  };

  const handleFire = async () => {
    setFiring(true);
    try {
      const res = await api.post<{ scheduled: number }>(`/api/outreach/campaigns/${id}/fire`, {
        stepIndex: fireStep,
      });
      toast.success(`Scheduled ${res.scheduled} send${res.scheduled === 1 ? "" : "s"}`);
      load();
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
        action === "pause" ? "Campaign paused" : action === "resume" ? "Campaign resumed" : "Campaign stopped",
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
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant">search_off</span>
          <h1 className="font-headline-lg text-headline-lg text-primary">Campaign not found</h1>
          <p className="font-body-md text-on-surface-variant">It may have been deleted, or you may not have access to it.</p>
          <Link href="/outreach/bulk-fire" className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container">
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
          <span className="material-symbols-outlined mr-2 animate-spin">sync</span> Loading campaign…
        </main>
      </AppShell>
    );
  }

  const totalSent = counts.sent + counts.failed + counts.skipped;
  const totalTracked = counts.scheduled + totalSent;
  const progressPct = totalTracked === 0 ? 0 : Math.round((totalSent / totalTracked) * 100);

  return (
    <AppShell>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
        accept=".docx"
        className="hidden"
        aria-label="Upload leads docx hidden input"
      />
      <TopAppBar
        leftContent={
          <div className="flex items-center gap-2 text-text-muted font-label-md">
            <Link href="/outreach/bulk-fire" className="hover:text-primary transition-colors">
              Bulk Fire
            </Link>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-on-surface font-medium truncate max-w-[220px]">{campaign.name}</span>
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
            {(campaign.status === "running" || campaign.status === "paused") && (
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
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">{campaign.name}</h1>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 font-label-md text-[11px] capitalize ${STATUS_STYLE[campaign.status]}`}>
                {campaign.status}
              </span>
              <span className="font-data-mono text-[12px] text-text-muted">{leadCount} leads</span>
            </div>
            {campaign.status === "error" && campaign.errorReason && (
              <p className="mt-2 font-body-md text-[13px] text-error">
                {ERROR_REASON_LABELS[campaign.errorReason] ?? campaign.errorReason}
              </p>
            )}
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
                <h2 className="font-headline-md text-[18px] text-on-surface">Send progress</h2>
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
                  { label: "Scheduled", value: counts.scheduled, color: "text-secondary" },
                  { label: "Sent", value: counts.sent, color: "text-tertiary" },
                  { label: "Failed", value: counts.failed, color: "text-error" },
                  { label: "Skipped", value: counts.skipped, color: "text-on-surface-variant" },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl bg-bg-cream/40 p-3 text-center">
                    <div className={`font-data-mono text-[22px] font-semibold ${c.color}`}>{c.value}</div>
                    <div className="font-label-md text-[11px] uppercase tracking-wide text-text-muted">{c.label}</div>
                  </div>
                ))}
              </div>
              {campaign.status === "running" && (
                <div className="mt-4 flex items-center gap-2 font-label-md text-[12px] text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                  Sending durably in the background — safe to close this tab.
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Leads import */}
        <section className="mb-10">
          <h2 className="mb-4 font-headline-md text-[18px] text-on-surface">Leads</h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
            }}
            onClick={triggerBrowse}
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed p-8 text-center transition-all ${
              dragging ? "border-primary bg-primary/5 scale-[1.005]" : "border-border-low-alpha hover:border-primary/50"
            }`}
          >
            <span className="material-symbols-outlined mb-2 text-[32px] text-primary">cloud_upload</span>
            <p className="font-body-md text-on-surface">
              Drag &amp; drop a leads playbook (.docx), or{" "}
              <span className="font-semibold text-primary underline underline-offset-4">browse</span>
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
            <div className="overflow-x-auto rounded-[20px] border border-border-low-alpha bg-white">
              <table className="w-full text-left">
                <thead className="border-b border-border-low-alpha bg-surface-container-low">
                  <tr>
                    {["Name", "Niche", "Location", "Decision maker", "Email", "Status"].map((h) => (
                      <th key={h} className="px-4 py-3 font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-border-low-alpha last:border-0">
                      <td className="px-4 py-3 font-body-md text-[13px] text-on-surface">{lead.name}</td>
                      <td className="px-4 py-3 font-body-md text-[13px] text-on-surface-variant">{lead.niche || "—"}</td>
                      <td className="px-4 py-3 font-body-md text-[13px] text-on-surface-variant">{lead.location || "—"}</td>
                      <td className="px-4 py-3 font-body-md text-[13px] text-on-surface-variant">{lead.decisionMaker || "—"}</td>
                      <td className="px-4 py-3 font-data-mono text-[12px] text-on-surface-variant">{lead.email || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 font-label-md text-[11px] capitalize ${LEAD_STATUS_STYLE[lead.status]}`}>
                          {lead.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Sequence editor */}
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-headline-md text-[18px] text-on-surface">Sequence</h2>
            <button
              type="button"
              onClick={handleSaveSequence}
              disabled={savingSequence}
              className="rounded-lg bg-primary px-4 py-2 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
            >
              {savingSequence ? "Saving…" : "Save sequence"}
            </button>
          </div>
          <motion.div variants={stagger()} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {sequence.map((step, i) => (
              <motion.div key={step.stepIndex} variants={itemVariants} className="rounded-[20px] border border-border-low-alpha bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-label-md text-label-md font-semibold text-on-surface">{STEP_LABELS[i]}</h3>
                  <span className="font-data-mono text-[11px] text-text-muted">+{step.dayOffset}d</span>
                </div>
                <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                  Subject
                </label>
                <input
                  value={step.subjectTemplate}
                  onChange={(e) => updateStep(i, { subjectTemplate: e.target.value })}
                  placeholder="{Quick question|Following up} about {{niche}} leads"
                  className="mb-3 w-full rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                  Body
                </label>
                <textarea
                  value={step.bodyTemplate}
                  onChange={(e) => updateStep(i, { bodyTemplate: e.target.value })}
                  rows={6}
                  placeholder={"Hi {{decisionMaker}},\n\n{I noticed|I came across} {{name}} and thought..."}
                  className="w-full resize-none rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </motion.div>
            ))}
          </motion.div>
          <p className="mt-3 font-label-md text-[11px] text-text-muted">
            Use <span className="font-data-mono">{"{option a|option b}"}</span> for spintax and{" "}
            <span className="font-data-mono">{"{{name}}"}</span>/<span className="font-data-mono">{"{{niche}}"}</span>/
            <span className="font-data-mono">{"{{decisionMaker}}"}</span> for per-lead personalization.
          </p>
        </section>

        {/* Fire controls */}
        <section className="mb-10 rounded-[20px] border border-border-low-alpha bg-white p-6">
          <h2 className="mb-4 font-headline-md text-[18px] text-on-surface">Fire</h2>
          <p className="mb-4 font-body-md text-[13px] text-on-surface-variant">
            Fires one sequence step to every lead eligible for it — a lead that already received its
            Day 0 email is still eligible for Day 3.
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
              {firing ? "Scheduling…" : `Fire ${STEP_LABELS[fireStep]}`}
            </button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
