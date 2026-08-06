"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { fadeUp, easeOut } from "@/lib/motion";
import { useAuth } from "@/components/app/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/skeletons";

/** Only needed once a user opens a lead's email history — kept out of the
 *  initial bundle for this already-large page. */
const LeadEmailsModal = dynamic(() => import("./lead-emails-modal"), {
  ssr: false,
});

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

interface WhatsAppSequenceStep {
  stepIndex: number;
  dayOffset: number;
  templateId: string;
  templateParams: string[];
}

interface Campaign {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  status: CampaignStatus;
  sequence: SequenceStep[] | WhatsAppSequenceStep[];
  blockMinutes: number;
  errorReason: string | null;
  /** A pending "fire at this time" request set via the schedule-fire UI —
   *  null means no schedule is pending. */
  scheduledFireAt: string | null;
  scheduledFireStepIndex: number | null;
  scheduledFireLeadIds: string[] | null;
  /** True when the pending scheduled fire will also auto-schedule the Day 3/
   *  Day 7 follow-ups (same thread, same mailbox). */
  scheduledFireCascade: boolean;
  /** null/empty means "every active sender account" — see
   *  resolveCampaignSenders in outreach.service.ts. */
  senderAccountIds: string[] | null;
}

interface Sender {
  id: string;
  type: "gmail" | "smtp" | "whatsapp";
  label: string;
  email: string;
  isActive: boolean;
}

interface WhatsAppTemplate {
  id: string;
  senderAccountId: string;
  metaTemplateName: string;
  category: "marketing" | "utility" | "authentication";
  language: string;
  bodyText: string;
  placeholderCount: number;
  status: "pending" | "approved" | "rejected" | "disabled";
  rejectionReason: string | null;
}

const TEMPLATE_STATUS_TONE: Record<WhatsAppTemplate["status"], StatusBadgeProps["tone"]> = {
  pending: "invited",
  approved: "active",
  rejected: "error",
  disabled: "draft",
};

interface Counts {
  scheduled: number;
  sent: number;
  failed: number;
  skipped: number;
}

/** Per-step (Day 0/3/7) rollup from GET /campaigns/[id] — drives the
 *  "Day 3 · 40 scheduled · fires Jul 19, 9:04 AM" lines so cascaded
 *  follow-ups are visible the moment they're created. */
interface StepSummary {
  stepIndex: number;
  scheduled: number;
  sent: number;
  failed: number;
  skipped: number;
  firstScheduledAt: string | null;
  lastScheduledAt: string | null;
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
  /** When this lead's Day 0 email actually went out, if it has. */
  day0SentAt: string | null;
}

/** "Mon, Jul 13 · 2:01 PM" in the viewer's timezone. */
function formatSentAt(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** Ticking mm:ss countdown to a lead's next scheduled send — replaces the
 *  static "Niche" column so pacing is visible per-row, not just in the
 *  aggregate progress panel. */
function SendCountdown({
  nextSendAt,
  paused,
}: {
  nextSendAt: string | null;
  /** True while the campaign is paused/stopped — the send row still says
   *  "scheduled" until its own job wakes up and self-skips, so without this
   *  the countdown would keep ticking toward "Sending…" for a send that
   *  will actually be silently skipped, not sent. */
  paused?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!nextSendAt || paused) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [nextSendAt, paused]);

  if (!nextSendAt) {
    return <span className="text-on-surface-variant">—</span>;
  }

  if (paused) {
    return (
      <span className="inline-flex items-center gap-1 text-on-surface-variant">
        <span className="material-symbols-outlined text-[14px]">pause</span>
        Paused
      </span>
    );
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

/** Ticking day/hour/minute countdown to a scheduled fire — same idiom as
 *  SendCountdown but formatted for a week-out horizon instead of mm:ss. */
function ScheduleCountdown({ scheduledFireAt }: { scheduledFireAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [scheduledFireAt]);

  const remainingMs = new Date(scheduledFireAt).getTime() - now;
  if (remainingMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <span className="material-symbols-outlined animate-spin text-[14px]">
          sync
        </span>
        Firing…
      </span>
    );
  }

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return <span className="text-secondary">in {parts.join(" ")}</span>;
}

/** Modal for viewing/editing the Day 0/3/7 email copy that will actually be
 *  sent to one lead (its own imported copy where set, else the campaign's
 *  fallback sequence) — opened from the leads table's "View emails" button. */
const STEP_LABELS = ["Day 0", "Day 3", "Day 7"];
const LEADS_PAGE_SIZE = 10;

const STATUS_TONE: Record<CampaignStatus, StatusBadgeProps["tone"]> = {
  draft: "draft",
  importing: "invited",
  ready: "active",
  running: "active",
  paused: "neutral",
  completed: "active",
  error: "error",
};

const LEAD_STATUS_TONE: Record<Lead["status"], StatusBadgeProps["tone"]> = {
  pending: "draft",
  scheduled: "invited",
  sent: "active",
  bounced: "error",
  failed: "error",
  skipped: "draft",
};

const ERROR_REASON_LABELS: Record<string, string> = {
  file_missing:
    "The uploaded file could not be found — please try uploading again.",
  no_leads_found:
    "No leads could be read from this file — check it has a name and email for each lead.",
  docx_parse_failed:
    "This file couldn't be read as a .docx — please re-export and try again.",
  import_failed: "Import failed unexpectedly — please try uploading again.",
  enqueue_failed: "Import failed to start — please try uploading again.",
};

const DEFAULT_SEQUENCE: SequenceStep[] = [
  { stepIndex: 0, dayOffset: 0, subjectTemplate: "", bodyTemplate: "" },
  { stepIndex: 1, dayOffset: 3, subjectTemplate: "", bodyTemplate: "" },
  { stepIndex: 2, dayOffset: 7, subjectTemplate: "", bodyTemplate: "" },
];

const DEFAULT_WHATSAPP_SEQUENCE: WhatsAppSequenceStep[] = [
  { stepIndex: 0, dayOffset: 0, templateId: "", templateParams: [] },
  { stepIndex: 1, dayOffset: 3, templateId: "", templateParams: [] },
  { stepIndex: 2, dayOffset: 7, templateId: "", templateParams: [] },
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

/** Template picker + dynamic {{n}} placeholder inputs for one WhatsApp
 *  sequence step. Only approved templates are selectable — the caller is
 *  responsible for filtering `templates` down to those. */
function WhatsAppStepEditor({
  step,
  templates,
  onChange,
}: {
  step: WhatsAppSequenceStep;
  templates: WhatsAppTemplate[];
  onChange: (patch: Partial<WhatsAppSequenceStep>) => void;
}) {
  const selected = templates.find((t) => t.id === step.templateId);

  const handleTemplateChange = (templateId: string) => {
    const t = templates.find((tpl) => tpl.id === templateId);
    onChange({
      templateId,
      templateParams: t
        ? Array.from(
            { length: t.placeholderCount },
            (_, i) => step.templateParams[i] ?? "",
          )
        : [],
    });
  };

  const updateParam = (i: number, value: string) => {
    const next = [...step.templateParams];
    next[i] = value;
    onChange({ templateParams: next });
  };

  if (templates.length === 0) {
    return (
      <p className="rounded-lg bg-bg-cream/40 p-4 font-body-md text-[13px] text-on-surface-variant">
        No approved templates yet — submit one above and wait for Meta to
        approve it before it can be used here.
      </p>
    );
  }

  return (
    <div>
      <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
        Template
      </label>
      <select
        value={step.templateId}
        onChange={(e) => handleTemplateChange(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">Select a template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.metaTemplateName} ({t.category})
          </option>
        ))}
      </select>

      {selected && (
        <>
          <p className="mb-3 rounded-lg bg-bg-cream/40 p-3 font-body-md text-[13px] text-on-surface-variant">
            {selected.bodyText}
          </p>
          {selected.placeholderCount > 0 && (
            <div className="space-y-2">
              {Array.from({ length: selected.placeholderCount }, (_, i) => (
                <div key={i}>
                  <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                    {`{{${i + 1}}}`}
                  </label>
                  <input
                    value={step.templateParams[i] ?? ""}
                    onChange={(e) => updateParam(i, e.target.value)}
                    placeholder="{{name}} or literal text"
                    className="w-full rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BulkFireCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { can, loading: authLoading } = useAuth();
  const canScheduler = can("outreach_scheduler");

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
  const [whatsappSequence, setWhatsappSequence] = useState<
    WhatsAppSequenceStep[]
  >(DEFAULT_WHATSAPP_SEQUENCE);
  // The 4s background poll (below) calls load() while a user may be
  // mid-edit in the sequence textareas — without this, their unsaved copy
  // was silently clobbered by the server's last-saved version every 4
  // seconds. Set on every edit, cleared right before load() re-hydrates
  // after a confirmed save.
  const sequenceDirtyRef = useRef(false);
  const [savingSequence, setSavingSequence] = useState(false);
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    senderAccountId: "",
    metaTemplateName: "",
    category: "utility" as WhatsAppTemplate["category"],
    language: "en_US",
    bodyText: "",
  });

  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [leadsPage, setLeadsPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [emailsLeadId, setEmailsLeadId] = useState<string | null>(null);

  const [fireStep, setFireStep] = useState(0);
  const [firing, setFiring] = useState(false);
  const [confirmFireOpen, setConfirmFireOpen] = useState(false);
  // Opt-in "also schedule Day 3 & Day 7" cascade for Day 0 fires — see
  // fireCampaignSchema.cascadeFollowups.
  const [cascadeFollowups, setCascadeFollowups] = useState(false);
  const [stepSummary, setStepSummary] = useState<StepSummary[]>([]);
  const [controlBusy, setControlBusy] = useState(false);
  const [scheduledAtInput, setScheduledAtInput] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [cancelingSchedule, setCancelingSchedule] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderIds, setSelectedSenderIds] = useState<Set<string>>(new Set());
  const [savingSenders, setSavingSenders] = useState(false);
  // Lazy-initialized once at mount (not recomputed on every render) — the
  // `datetime-local` input's `min` just needs to be "roughly now".
  const [minScheduleTime] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16),
  );

  const load = async () => {
    try {
      const res = await api.get<{
        campaign: Campaign;
        counts: Counts;
        leadCount: number;
        stepSummary: StepSummary[];
      }>(`/api/outreach/campaigns/${id}`);
      setCampaign(res.campaign);
      setCounts(res.counts);
      setLeadCount(res.leadCount);
      setStepSummary(res.stepSummary ?? []);
      // Skip re-hydrating fields the user may currently be editing — this
      // runs on every 4s background poll (see the interval below), and
      // overwriting a mid-edit textarea/checkbox with the server's
      // last-saved copy every 4 seconds silently discarded unsaved work.
      if (!sequenceDirtyRef.current) {
        if (res.campaign.channel === "whatsapp") {
          const s = res.campaign.sequence as WhatsAppSequenceStep[];
          setWhatsappSequence(s.length === 3 ? s : DEFAULT_WHATSAPP_SEQUENCE);
        } else {
          const s = res.campaign.sequence as SequenceStep[];
          setSequence(s.length === 3 ? s : DEFAULT_SEQUENCE);
        }
      }
      if (!sendersDirty) {
        setSelectedSenderIds(new Set(res.campaign.senderAccountIds ?? []));
      }
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

  const loadSenders = async () => {
    try {
      const res = await api.get<{ senders: Sender[] }>("/api/outreach/senders");
      setSenders(res.senders);
    } catch (err: any) {
      toast.error(err.message || "Failed to load sender accounts");
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await api.get<{ templates: WhatsAppTemplate[] }>(
        "/api/outreach/whatsapp/templates",
      );
      setTemplates(res.templates);
    } catch (err: any) {
      toast.error(err.message || "Failed to load WhatsApp templates");
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
    loadSenders();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sends and the docx import both run as background jobs — poll until the
  // campaign settles into a state that no longer changes on its own. A
  // pending scheduledFireAt also needs polling so the banner flips over to
  // "running" the moment the scheduled job actually fires, with no manual
  // refresh required.
  useEffect(() => {
    if (
      campaign?.status !== "running" &&
      campaign?.status !== "importing" &&
      !campaign?.scheduledFireAt
    )
      return;
    const interval = setInterval(() => {
      load();
      loadLeads(leadsPage);
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status, campaign?.scheduledFireAt, leadsPage]);

  const handleSaveSequence = async () => {
    setSavingSequence(true);
    try {
      if (campaign?.channel === "whatsapp") {
        await api.put(`/api/outreach/campaigns/${id}/sequence/whatsapp`, {
          sequence: whatsappSequence,
        });
      } else {
        await api.put(`/api/outreach/campaigns/${id}/sequence`, { sequence });
      }
      toast.success("Sequence saved");
      sequenceDirtyRef.current = false;
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save sequence");
    } finally {
      setSavingSequence(false);
    }
  };

  const handleSubmitTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingTemplate(true);
    try {
      await api.post("/api/outreach/whatsapp/templates", {
        senderAccountId: newTemplate.senderAccountId,
        metaTemplateName: newTemplate.metaTemplateName.trim(),
        category: newTemplate.category,
        language: newTemplate.language.trim() || "en_US",
        bodyText: newTemplate.bodyText,
      });
      toast.success("Template submitted for approval");
      setNewTemplateOpen(false);
      setNewTemplate({
        senderAccountId: "",
        metaTemplateName: "",
        category: "utility",
        language: "en_US",
        bodyText: "",
      });
      loadTemplates();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit template");
    } finally {
      setSubmittingTemplate(false);
    }
  };

  const toggleSender = (senderId: string) => {
    setSelectedSenderIds((prev) => {
      const next = new Set(prev);
      if (next.has(senderId)) next.delete(senderId);
      else next.add(senderId);
      return next;
    });
  };

  const sendersDirty =
    JSON.stringify([...selectedSenderIds].sort()) !==
    JSON.stringify([...(campaign?.senderAccountIds ?? [])].sort());

  const handleSaveSenders = async () => {
    setSavingSenders(true);
    try {
      await api.put(`/api/outreach/campaigns/${id}/senders`, {
        senderAccountIds: [...selectedSenderIds],
      });
      toast.success("Senders saved");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save senders");
    } finally {
      setSavingSenders(false);
    }
  };

  const updateWhatsAppStep = (
    index: number,
    patch: Partial<WhatsAppSequenceStep>,
  ) => {
    sequenceDirtyRef.current = true;
    setWhatsappSequence((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const updateStep = (index: number, patch: Partial<SequenceStep>) => {
    sequenceDirtyRef.current = true;
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

  /** Adds every lead in the campaign (not just this page) whose Day 0 went
   *  out on the same calendar day (viewer's timezone) to the selection — one
   *  click turns "fire Day 3 for Monday's batch" from 18 checkboxes into a
   *  single tap on the date. Pages through the leads endpoint at its max
   *  page size to build the full id list. */
  const selectSameSendDay = async (sentAt: string | null) => {
    if (!sentAt) return;
    const day = new Date(sentAt).toDateString();
    try {
      const matched: string[] = [];
      let offset = 0;
      for (;;) {
        const res = await api.get<{ leads: Lead[]; total: number }>(
          `/api/outreach/campaigns/${id}/leads?limit=100&offset=${offset}`,
        );
        for (const l of res.leads) {
          if (
            l.email &&
            l.day0SentAt &&
            new Date(l.day0SentAt).toDateString() === day
          ) {
            matched.push(l.id);
          }
        }
        offset += res.leads.length;
        if (offset >= res.total || res.leads.length === 0) break;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        matched.forEach((lid) => next.add(lid));
        return next;
      });
      toast.success(
        `Selected ${matched.length} lead${matched.length === 1 ? "" : "s"} sent on ${new Date(sentAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to select by day");
    }
  };

  const handleFire = async () => {
    setFiring(true);
    try {
      const leadIds =
        selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const res = await api.post<{
        scheduled: number;
        followupsScheduled?: number;
        skippedForDailyCapCount?: number;
        skippedForSenderCapCount?: number;
      }>(`/api/outreach/campaigns/${id}/fire`, {
        stepIndex: fireStep,
        cascadeFollowups: fireStep === 0 && cascadeFollowups,
        ...(leadIds ? { leadIds } : {}),
      });
      const skipped =
        (res.skippedForDailyCapCount ?? 0) + (res.skippedForSenderCapCount ?? 0);
      const reason =
        res.skippedForDailyCapCount && res.skippedForSenderCapCount
          ? "daily send and sender limits reached"
          : res.skippedForSenderCapCount
            ? "sender daily limit reached"
            : "daily send limit reached";
      const followups = res.followupsScheduled
        ? ` + ${res.followupsScheduled} Day 3/Day 7 follow-up${res.followupsScheduled === 1 ? "" : "s"}`
        : "";
      toast.success(
        skipped > 0
          ? `Fired to ${res.scheduled} lead${res.scheduled === 1 ? "" : "s"}${followups} — ${skipped} skipped, ${reason}`
          : `Scheduled ${res.scheduled} send${res.scheduled === 1 ? "" : "s"}${followups}`,
      );
      clearSelection();
      load();
      loadLeads(leadsPage);
    } catch (err: any) {
      toast.error(err.message || "Failed to fire campaign");
    } finally {
      setFiring(false);
      setConfirmFireOpen(false);
    }
  };

  const handleScheduleFire = async () => {
    if (!scheduledAtInput) {
      toast.error("Pick a date and time first");
      return;
    }
    setScheduling(true);
    try {
      const leadIds =
        selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      await api.post(`/api/outreach/campaigns/${id}/fire/schedule`, {
        stepIndex: fireStep,
        scheduledFireAt: new Date(scheduledAtInput).toISOString(),
        cascadeFollowups: fireStep === 0 && cascadeFollowups,
        ...(leadIds ? { leadIds } : {}),
      });
      toast.success("Fire scheduled");
      clearSelection();
      setScheduledAtInput("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule fire");
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelScheduledFire = async () => {
    setCancelingSchedule(true);
    try {
      await api.delete(`/api/outreach/campaigns/${id}/fire/schedule`);
      toast.success("Scheduled fire canceled");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel scheduled fire");
    } finally {
      setCancelingSchedule(false);
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
            className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-[filter] hover:brightness-110"
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
        <main className="mx-auto max-w-[1440px] w-full p-4 sm:p-6 lg:p-12 min-h-screen">
          <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-7 w-56" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
          </section>
          <div className="mb-8 rounded-2xl border border-border-low-alpha bg-surface-white p-6 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="rounded-2xl border border-border-low-alpha bg-surface-white overflow-hidden">
            <div className="border-b border-border-low-alpha p-6">
              <Skeleton className="h-5 w-28" />
            </div>
            <TableSkeleton rows={6} columns={3} />
          </div>
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
              <Button type="button" variant="outline" loading={controlBusy} onClick={() => runControl("pause")}>
                Pause
              </Button>
            )}
            {campaign.status === "paused" && (
              <Button type="button" variant="outline" loading={controlBusy} onClick={() => runControl("resume")}>
                Resume
              </Button>
            )}
            {(campaign.status === "running" ||
              campaign.status === "paused") && (
              <Button type="button" variant="destructive" loading={controlBusy} onClick={() => runControl("stop")}>
                Stop
              </Button>
            )}
          </div>
        }
      />

      <main className="mx-auto max-w-[1440px] w-full p-4 sm:p-6 lg:p-12 min-h-screen">
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
              {campaign.name}
            </h1>
            <div className="flex items-center gap-2">
              <StatusBadge tone={STATUS_TONE[campaign.status]} className="capitalize">
                {campaign.status}
              </StatusBadge>
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
              className="mb-10 rounded-2xl border border-border-low-alpha bg-surface-white p-6"
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
                <Button type="button" variant="link" size="xs" onClick={clearSelection} className="h-auto p-0 text-[12px] text-on-surface-variant hover:text-on-surface">
                  Clear selection
                </Button>
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
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
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
            <div className="rounded-2xl border border-border-low-alpha bg-surface-white p-8 text-center font-body-md text-on-surface-variant">
              No leads imported yet.
            </div>
          ) : (
            <>
              {/* Always a real table, even on mobile — checkbox multi-select
               *  is the primary workflow here (Fire targets whichever leads
               *  are checked), and a hand-rolled mobile card list previously
               *  had no width containment of its own, so any slightly-long
               *  business name pushed the WHOLE PAGE into horizontal scroll
               *  instead of just this table. The table's overflow-x-auto
               *  wrapper below scopes scrolling to itself, same pattern the
               *  shared Table/DataTable primitives use everywhere else. */}
              <div className="overflow-x-auto rounded-2xl border border-border-low-alpha bg-surface-white">
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
                        "Sent on",
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
                          <SendCountdown
                            nextSendAt={lead.nextSendAt}
                            paused={campaign?.status === "paused"}
                          />
                        </td>
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEmailsLeadId(lead.id)}
                          >
                            View emails
                          </Button>
                        </td>
                        <td
                          className="px-4 py-3 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lead.day0SentAt ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => selectSameSendDay(lead.day0SentAt)}
                              title="Click to also select everyone sent on this day"
                              className="h-auto px-2 py-1 font-data-mono text-[12px] text-on-surface-variant hover:text-primary"
                            >
                              {formatSentAt(lead.day0SentAt)}
                            </Button>
                          ) : (
                            <span className="px-2 font-data-mono text-[12px] text-on-surface-variant">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-data-mono text-[12px] text-on-surface-variant">
                          {lead.email || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={LEAD_STATUS_TONE[lead.status]} className="capitalize">
                            {lead.status}
                          </StatusBadge>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => goToLeadsPage(leadsPage - 1)}
                    disabled={leadsPage <= 1}
                    aria-label="Previous page"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      chevron_left
                    </span>
                  </Button>
                  {paginationRange(leadsPage, totalLeadsPages).map((p, i) =>
                    p === "…" ? (
                      <span
                        key={`ellipsis-${i}`}
                        className="px-1 font-label-md text-[12px] text-on-surface-variant"
                      >
                        …
                      </span>
                    ) : (
                      <Button
                        key={p}
                        type="button"
                        variant={p === leadsPage ? "default" : "outline"}
                        size="icon"
                        onClick={() => goToLeadsPage(p)}
                        aria-current={p === leadsPage ? "page" : undefined}
                      >
                        {p}
                      </Button>
                    ),
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => goToLeadsPage(leadsPage + 1)}
                    disabled={leadsPage >= totalLeadsPages}
                    aria-label="Next page"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      chevron_right
                    </span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* WhatsApp template library — only relevant for whatsapp-channel
            campaigns. Templates are tenant-wide (not per-campaign), managed
            here since this is where you'd want them while building a
            sequence. */}
        {campaign.channel === "whatsapp" && (
          <section className="mb-10 rounded-2xl border border-border-low-alpha bg-surface-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-headline-md text-[16px] text-on-surface">
                  WhatsApp templates
                </h2>
                <p className="mt-0.5 font-body-md text-[12px] text-on-surface-variant">
                  Only <strong>approved</strong> templates can be used in the
                  sequence below — Meta reviews new submissions, usually
                  within minutes to a day.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewTemplateOpen(true)}
                disabled={senders.filter((s) => s.type === "whatsapp").length === 0}
                title={
                  senders.filter((s) => s.type === "whatsapp").length === 0
                    ? "Connect a WhatsApp sender first"
                    : undefined
                }
              >
                + Submit template
              </Button>
            </div>
            {templates.length === 0 ? (
              <p className="rounded-lg bg-bg-cream/40 p-4 font-body-md text-[13px] text-on-surface-variant">
                No templates submitted yet.
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-low-alpha p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-data-mono text-[12px] text-on-surface">
                          {t.metaTemplateName}
                        </span>
                        <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-md text-[10px] capitalize text-on-surface-variant">
                          {t.category}
                        </span>
                      </div>
                      <p className="mt-0.5 max-w-md truncate font-body-md text-[12px] text-on-surface-variant">
                        {t.bodyText}
                      </p>
                      {t.status === "rejected" && t.rejectionReason && (
                        <p className="mt-0.5 font-body-md text-[11px] text-error">
                          {t.rejectionReason}
                        </p>
                      )}
                    </div>
                    <StatusBadge tone={TEMPLATE_STATUS_TONE[t.status]} className="shrink-0 capitalize">
                      {t.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Fallback sequence — collapsed by default. Most leads carry their
            own imported copy (see the docx templates), so this only matters
            as a shared default for leads that don't. For WhatsApp campaigns,
            "fallback" isn't quite right (there's no per-lead custom copy
            path), but the section still holds the one sequence that fires. */}
        <section className="mb-10 rounded-2xl border border-border-low-alpha bg-surface-white">
          <button
            type="button"
            onClick={() => setSequenceOpen((o) => !o)}
            aria-expanded={sequenceOpen}
            className="flex w-full items-center justify-between gap-4 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset"
          >
            <div>
              <h2 className="font-headline-md text-[16px] text-on-surface">
                {campaign.channel === "whatsapp"
                  ? "Template sequence"
                  : "Fallback sequence"}{" "}
                {campaign.channel !== "whatsapp" && (
                  <span className="font-label-md text-[11px] font-normal text-on-surface-variant">
                    (optional)
                  </span>
                )}
              </h2>
              <p className="mt-0.5 font-body-md text-[12px] text-on-surface-variant">
                {campaign.channel === "whatsapp"
                  ? "Pick an approved template and fill in its {{n}} placeholders for each day of the sequence."
                  : "Only used for leads that don't carry their own custom email copy from the imported playbook."}
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
                          className={`rounded-md px-3 py-1.5 font-label-md text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 ${
                            activeStep === i
                              ? "bg-surface-white text-primary shadow-sm"
                              : "text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {label}{" "}
                          <span className="text-[10px] text-text-muted">
                            +
                            {campaign.channel === "whatsapp"
                              ? whatsappSequence[i].dayOffset
                              : sequence[i].dayOffset}
                            d
                          </span>
                        </button>
                      ))}
                    </div>
                    <Button type="button" variant="gradient" size="sm" loading={savingSequence} onClick={handleSaveSequence}>
                      {savingSequence ? "Saving…" : "Save sequence"}
                    </Button>
                  </div>

                  {campaign.channel === "whatsapp" ? (
                    <WhatsAppStepEditor
                      step={whatsappSequence[activeStep]}
                      templates={templates.filter((t) => t.status === "approved")}
                      onChange={(patch) => updateWhatsAppStep(activeStep, patch)}
                    />
                  ) : (
                    <>
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
                          updateStep(activeStep, {
                            bodyTemplate: e.target.value,
                          })
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
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* US-marketing warning — Meta currently blocks marketing-category
            WhatsApp templates from being sent to +1 numbers. Surfaced here so
            it's visible before Fire, backed by the same server-side filter in
            fireCampaign (skip-and-report, not a hard block). */}
        {campaign.channel === "whatsapp" &&
          (() => {
            const activeTemplate = templates.find(
              (t) => t.id === whatsappSequence[fireStep]?.templateId,
            );
            if (activeTemplate?.category !== "marketing") return null;
            const usLeadCount = leads.filter((l) =>
              l.phone?.startsWith("+1"),
            ).length;
            if (usLeadCount === 0) return null;
            return (
              <div className="mb-6 flex items-start gap-3 rounded-[16px] border border-tertiary/30 bg-tertiary/5 p-4">
                <span className="material-symbols-outlined text-[18px] text-tertiary">
                  warning
                </span>
                <p className="font-body-md text-[13px] text-on-surface">
                  {STEP_LABELS[fireStep]} uses a marketing-category template.
                  Meta currently blocks marketing templates to US (+1) phone
                  numbers, so {usLeadCount} lead
                  {usLeadCount === 1 ? "" : "s"} on this page will be skipped
                  automatically when you fire — not sent, not counted as
                  failed.
                </p>
              </div>
            );
          })()}

        {/* Fire controls */}
        <section className="mb-10 rounded-2xl border border-border-low-alpha bg-surface-white p-6">
          <h2 className="mb-4 font-headline-md text-[18px] text-on-surface">
            Send from
          </h2>
          <p className="mb-4 font-body-md text-[13px] text-on-surface-variant">
            {selectedSenderIds.size > 0
              ? `Fire (immediate or scheduled) rotates across only your ${selectedSenderIds.size} selected sender${selectedSenderIds.size === 1 ? "" : "s"}.`
              : "No senders selected — Fire rotates across every active sender account."}
          </p>
          {senders.length === 0 ? (
            <p className="font-body-md text-[13px] text-on-surface-variant">
              No sender accounts connected yet.
            </p>
          ) : (
            <div className="mb-4 flex flex-wrap gap-3">
              {senders.map((sender) => (
                <label
                  key={sender.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 font-body-md text-[13px] transition-colors ${
                    selectedSenderIds.has(sender.id)
                      ? "border-primary bg-primary/5 text-on-surface"
                      : "border-border-low-alpha text-on-surface-variant"
                  } ${sender.isActive ? "" : "opacity-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSenderIds.has(sender.id)}
                    onChange={() => toggleSender(sender.id)}
                    className="accent-primary"
                  />
                  {sender.label} ({sender.email})
                  {!sender.isActive && " — paused"}
                </label>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            className="border-primary text-primary hover:bg-primary/5 hover:text-primary"
            onClick={handleSaveSenders}
            loading={savingSenders}
            disabled={!sendersDirty}
          >
            {savingSenders ? "Saving…" : "Save senders"}
          </Button>
        </section>

        <section className="mb-10 rounded-2xl border border-border-low-alpha bg-surface-white p-6">
          <h2 className="mb-4 font-headline-md text-[18px] text-on-surface">
            Fire
          </h2>
          <p className="mb-4 font-body-md text-[13px] text-on-surface-variant">
            {selectedIds.size > 0
              ? `Fires the selected step to only your ${selectedIds.size} selected lead${selectedIds.size === 1 ? "" : "s"} (still limited to whichever are eligible for it).`
              : "Fires one sequence step to every lead eligible for it — a lead that already received its Day 0 email is still eligible for Day 3. Select specific rows above to fire to only some leads."}
          </p>
          {campaign.scheduledFireAt ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-secondary/30 bg-secondary-container/10 px-4 py-3">
              <p className="font-body-md text-[13px] text-on-surface">
                <span className="material-symbols-outlined align-middle text-[16px] text-secondary">
                  schedule
                </span>{" "}
                Scheduled to fire{" "}
                <strong>
                  {STEP_LABELS[campaign.scheduledFireStepIndex ?? 0]}
                </strong>{" "}
                on {new Date(campaign.scheduledFireAt).toLocaleString()} (
                <ScheduleCountdown scheduledFireAt={campaign.scheduledFireAt} />
                )
                {campaign.scheduledFireCascade
                  ? " + Day 3 & Day 7 follow-ups (same thread)"
                  : ""}
                {campaign.scheduledFireLeadIds
                  ? ` — ${campaign.scheduledFireLeadIds.length} selected lead${campaign.scheduledFireLeadIds.length === 1 ? "" : "s"}`
                  : " — all eligible leads"}
              </p>
              <Button type="button" variant="outline" size="sm" loading={cancelingSchedule} onClick={handleCancelScheduledFire}>
                {cancelingSchedule ? "Canceling…" : "Cancel schedule"}
              </Button>
            </div>
          ) : (
            <>
              {campaign.channel === "email" && (
                <label className="mb-3 flex w-fit cursor-pointer items-start gap-2.5 rounded-lg border border-border-low-alpha bg-bg-cream/30 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={fireStep === 0 && cascadeFollowups}
                    disabled={fireStep !== 0}
                    onChange={(e) => setCascadeFollowups(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="font-body-md text-[13px] text-on-surface">
                    Also schedule <strong>Day 3 &amp; Day 7</strong> follow-ups
                    automatically
                    <span className="block font-body-md text-[12px] text-on-surface-variant">
                      Each lead gets Day 3 and Day 7 at the same time of day, 3
                      and 7 days after its Day 0 send — sent as a reply in the
                      same email thread, from the same mailbox. Skipped
                      automatically if Day 0 fails{fireStep !== 0 ? " (Day 0 fires only)" : ""}.
                    </span>
                  </span>
                </label>
              )}
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
              <Button
                type="button"
                variant="gradient"
                loading={firing}
                disabled={leadCount === 0}
                onClick={() => setConfirmFireOpen(true)}
              >
                {firing
                  ? "Scheduling…"
                  : selectedIds.size > 0
                    ? `Fire ${STEP_LABELS[fireStep]} to ${selectedIds.size} selected`
                    : `Fire ${STEP_LABELS[fireStep]} to all eligible`}
              </Button>
              <span className="font-body-md text-[13px] text-on-surface-variant">
                or
              </span>
              {authLoading ? null : canScheduler ? (
                <>
                  <input
                    type="datetime-local"
                    value={scheduledAtInput}
                    min={minScheduleTime}
                    onChange={(e) => setScheduledAtInput(e.target.value)}
                    className="rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="border-primary text-primary hover:bg-primary/5 hover:text-primary"
                    loading={scheduling}
                    disabled={leadCount === 0 || !scheduledAtInput}
                    onClick={handleScheduleFire}
                  >
                    {scheduling ? "Scheduling…" : "Schedule fire"}
                  </Button>
                </>
              ) : (
                <Link
                  href="/billing"
                  title="Scheduled sends are a Scale plan feature — upgrade to unlock"
                  className="flex items-center gap-1.5 rounded-lg border border-primary px-4 py-2.5 font-label-md text-[12px] text-primary transition-colors hover:bg-primary/5"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    lock
                  </span>
                  Scheduled sends are a Scale plan feature — upgrade to unlock
                </Link>
              )}
              </div>
            </>
          )}
          {/* Per-step schedule rollup — makes cascaded Day 3/Day 7 visible
              with their fire windows the moment they're created. */}
          {stepSummary.length > 0 && (
            <div className="mt-5 grid gap-2 border-t border-border-low-alpha pt-4 sm:grid-cols-3">
              {stepSummary.map((s) => {
                const label = STEP_LABELS[s.stepIndex] ?? `Step ${s.stepIndex + 1}`;
                const pending = s.scheduled > 0;
                const done = s.sent + s.failed + s.skipped;
                return (
                  <div
                    key={s.stepIndex}
                    className="rounded-lg border border-border-low-alpha bg-bg-cream/30 px-4 py-3"
                  >
                    <p className="flex items-center gap-1.5 font-label-md text-[12px] text-on-surface">
                      <span
                        className={`material-symbols-outlined text-[16px] ${pending ? "text-secondary" : "text-tertiary"}`}
                      >
                        {pending ? "schedule_send" : "check_circle"}
                      </span>
                      {label}
                      {s.stepIndex > 0 && (
                        <span className="rounded bg-secondary-container/30 px-1.5 py-0.5 font-label-md text-[10px] uppercase tracking-wide text-secondary">
                          same thread
                        </span>
                      )}
                    </p>
                    <p className="mt-1 font-body-md text-[12px] text-on-surface-variant">
                      {pending
                        ? `${s.scheduled} scheduled · fires ${
                            s.firstScheduledAt
                              ? new Date(s.firstScheduledAt).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "—"
                          }`
                        : `${done} processed`}
                      {s.sent > 0 && pending ? ` · ${s.sent} sent` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <LeadEmailsModal
        campaignId={id}
        lead={leads.find((l) => l.id === emailsLeadId) ?? null}
        onClose={() => setEmailsLeadId(null)}
        onSaved={() => loadLeads(leadsPage)}
      />

      <ConfirmDialog
        open={confirmFireOpen}
        onClose={() => setConfirmFireOpen(false)}
        onConfirm={handleFire}
        title={`Fire ${STEP_LABELS[fireStep]}?`}
        description={
          selectedIds.size > 0
            ? `This sends real ${campaign?.channel === "whatsapp" ? "WhatsApp messages" : "emails"} to the ${selectedIds.size} selected lead${selectedIds.size === 1 ? "" : "s"} right now. This can't be undone.`
            : `This sends real ${campaign?.channel === "whatsapp" ? "WhatsApp messages" : "emails"} to every eligible lead in this campaign right now — up to ${leadCount} lead${leadCount === 1 ? "" : "s"}. This can't be undone.`
        }
        confirmLabel={firing ? "Sending…" : "Fire"}
      />

      <Modal
        open={newTemplateOpen}
        onClose={() => setNewTemplateOpen(false)}
        title="Submit a WhatsApp template"
      >
        <form onSubmit={handleSubmitTemplate} className="space-y-3">
          <div>
            <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
              WhatsApp sender
            </label>
            <select
              required
              value={newTemplate.senderAccountId}
              onChange={(e) =>
                setNewTemplate((f) => ({
                  ...f,
                  senderAccountId: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select a sender…</option>
              {senders
                .filter((s) => s.type === "whatsapp")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
              Template name
            </label>
            <input
              required
              value={newTemplate.metaTemplateName}
              onChange={(e) =>
                setNewTemplate((f) => ({
                  ...f,
                  metaTemplateName: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, "_"),
                }))
              }
              placeholder="follow_up_intro"
              className="w-full rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 font-label-md text-[10px] text-text-muted">
              Lowercase letters, numbers, and underscores only.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                Category
              </label>
              <select
                value={newTemplate.category}
                onChange={(e) =>
                  setNewTemplate((f) => ({
                    ...f,
                    category: e.target.value as WhatsAppTemplate["category"],
                  }))
                }
                className="w-full rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="utility">Utility</option>
                <option value="marketing">Marketing</option>
                <option value="authentication">Authentication</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                Language
              </label>
              <input
                value={newTemplate.language}
                onChange={(e) =>
                  setNewTemplate((f) => ({ ...f, language: e.target.value }))
                }
                placeholder="en_US"
                className="w-full rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
              Body text
            </label>
            <textarea
              required
              rows={4}
              value={newTemplate.bodyText}
              onChange={(e) =>
                setNewTemplate((f) => ({ ...f, bodyText: e.target.value }))
              }
              placeholder={"Hi {{1}}, thanks for your interest in {{2}}..."}
              className="w-full resize-none rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 font-label-md text-[10px] text-text-muted">
              Use <span className="font-data-mono">{"{{1}}"}</span>,{" "}
              <span className="font-data-mono">{"{{2}}"}</span>, etc. for
              placeholders, in order.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setNewTemplateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="gradient" size="sm" loading={submittingTemplate}>
              {submittingTemplate ? "Submitting…" : "Submit for approval"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
