"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { stagger, item as itemVariants } from "@/lib/motion";
import { useAuth } from "@/components/app/auth-provider";
import { outreachLimits } from "@/lib/plans";
import { PageSpinner } from "@/components/ui/page-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderCard } from "@/components/app/page-header-card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeletons";

interface Campaign {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  status:
    | "draft"
    | "importing"
    | "ready"
    | "running"
    | "paused"
    | "completed"
    | "error";
  createdAt: string;
  scheduledFireAt: string | null;
}

interface Sender {
  id: string;
  type: "gmail" | "smtp" | "whatsapp";
  label: string;
  email: string;
  isActive: boolean;
  dailyLimit: number;
  whatsappDisplayName?: string | null;
  /** False for Gmail mailboxes connected before reply-detection shipped —
   *  they keep sending fine, but follow-ups can't auto-skip replied leads
   *  until the mailbox is reconnected. */
  gmailHasReadScope?: boolean;
}

interface DnsRecordCheck {
  status: "present" | "missing" | "unknown";
  record?: string;
}
interface DkimCheck extends DnsRecordCheck {
  selector?: string;
}
interface DeliverabilityReport {
  domain: string;
  isConsumerProvider: boolean;
  spf?: DnsRecordCheck;
  dmarc?: DnsRecordCheck;
  dkim?: DkimCheck;
}

const SENDER_ICON: Record<Sender["type"], string> = {
  gmail: "mail",
  smtp: "dns",
  whatsapp: "chat",
};

/** Campaign status → shared StatusBadge tone. Replaces a hand-rolled map of
 *  one-off pill classes so these read identically to every other status pill
 *  in the app (and stay theme-aware in dark mode). */
const STATUS_TONE: Record<Campaign["status"], StatusBadgeProps["tone"]> = {
  draft: "draft",
  importing: "brass",
  ready: "invited",
  running: "active",
  paused: "draft",
  completed: "active",
  error: "error",
};

const RECORD_META: Record<
  DnsRecordCheck["status"],
  { icon: string; className: string }
> = {
  present: { icon: "check_circle", className: "text-tertiary" },
  missing: { icon: "cancel", className: "text-error" },
  unknown: { icon: "help", className: "text-on-surface-variant" },
};

function DnsCheckRow({ label, check }: { label: string; check?: DnsRecordCheck }) {
  if (!check) return null;
  const meta = RECORD_META[check.status];
  const detail =
    check.status === "present"
      ? "record found"
      : check.status === "missing"
        ? "not found"
        : "couldn't check right now";
  return (
    <div className="flex items-start gap-2">
      <span className={`material-symbols-outlined text-[16px] ${meta.className}`}>{meta.icon}</span>
      <div className="min-w-0">
        <span className="font-label-md text-[12px] font-semibold text-on-surface">{label}</span>
        <span className="ml-1.5 font-body-md text-[12px] text-on-surface-variant">{detail}</span>
      </div>
    </div>
  );
}

/** On-demand SPF/DKIM/DMARC diagnostic for one sender card — a plain button
 *  that expands into a small results panel in place, no modal. Nothing here
 *  is fetched until the user clicks it (see checkDeliverability). */
function DeliverabilityCheck({
  result,
  onCheck,
}: {
  result: DeliverabilityReport | "loading" | "error" | undefined;
  onCheck: () => void;
}) {
  if (!result) {
    return (
      <button
        type="button"
        onClick={onCheck}
        className="flex items-center gap-1.5 self-start font-label-md text-[12px] text-primary hover:underline"
      >
        <span className="material-symbols-outlined text-[14px]">dns</span>
        Check deliverability (SPF/DKIM/DMARC)
      </button>
    );
  }
  if (result === "loading") {
    return (
      <p className="flex items-center gap-1.5 font-label-md text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
        Checking DNS records...
      </p>
    );
  }
  if (result === "error") {
    return (
      <button
        type="button"
        onClick={onCheck}
        className="flex items-center gap-1.5 self-start font-label-md text-[12px] text-error hover:underline"
      >
        <span className="material-symbols-outlined text-[14px]">refresh</span>
        Check failed — try again
      </button>
    );
  }
  if (result.isConsumerProvider) {
    return (
      <p className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1.5 font-body-md text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[14px]">info</span>
        {result.domain} is a consumer email provider — SPF/DKIM/DMARC are managed by them, not something you configure.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-low-alpha bg-surface-container-low px-3 py-2.5">
      <p className="font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
        {result.domain}
      </p>
      <DnsCheckRow label="SPF" check={result.spf} />
      <DnsCheckRow label="DKIM" check={result.dkim} />
      <DnsCheckRow label="DMARC" check={result.dmarc} />
      <button
        type="button"
        onClick={onCheck}
        className="mt-1 self-start font-label-md text-[11px] text-primary hover:underline"
      >
        Re-check
      </button>
    </div>
  );
}

export default function BulkFirePage() {
  const router = useRouter();
  const { can, profile, loading: authLoading } = useAuth();
  const canOutreach = can("outreach_bulk_fire");
  const canWhatsApp = can("whatsapp_channel");
  const { maxSenderAccounts } = outreachLimits(profile?.plan || "starter");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignChannel, setNewCampaignChannel] = useState<
    "email" | "whatsapp"
  >("email");
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState(false);

  const [smtpOpen, setSmtpOpen] = useState(false);
  const [smtp, setSmtp] = useState({
    label: "",
    email: "",
    fromName: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUsername: "",
    smtpPassword: "",
  });
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [senderBusyId, setSenderBusyId] = useState<string | null>(null);
  /** On-demand SPF/DKIM/DMARC diagnostic per sender — fetched only when a
   *  user clicks "Check deliverability" for that specific card, never
   *  eagerly for every connected sender on page load. */
  const [deliverability, setDeliverability] = useState<
    Record<string, DeliverabilityReport | "loading" | "error">
  >({});

  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsapp, setWhatsapp] = useState({
    label: "",
    phoneNumber: "",
    whatsappPhoneNumberId: "",
    whatsappWabaId: "",
    whatsappAccessToken: "",
    whatsappDisplayName: "",
  });
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [campaignsRes, sendersRes] = await Promise.all([
        api.get<{ campaigns: Campaign[] }>("/api/outreach/campaigns"),
        api.get<{ senders: Sender[] }>("/api/outreach/senders"),
      ]);
      setCampaigns(campaignsRes.campaigns);
      setSenders(sendersRes.senders);
    } catch (err: any) {
      toast.error(err.message || "Failed to load Bulk Fire");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // The Gmail OAuth callback redirects the browser back here with ?gmail=...
  // (see api/outreach/senders/gmail/oauth/callback) since it's a plain
  // navigation, not a fetch this page controls.
  useEffect(() => {
    const url = new URL(window.location.href);
    const gmail = url.searchParams.get("gmail");
    if (!gmail) return;
    if (gmail === "connected") {
      toast.success(
        `Connected ${url.searchParams.get("email") || "Gmail account"}`,
      );
    } else if (gmail === "error") {
      toast.error(
        url.searchParams.get("message") || "Failed to connect Gmail account",
      );
    }
    url.searchParams.delete("gmail");
    url.searchParams.delete("email");
    url.searchParams.delete("message");
    router.replace(
      url.pathname +
        (url.searchParams.toString() ? `?${url.searchParams}` : ""),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    setCreatingCampaign(true);
    try {
      const campaign = await api.post<Campaign>("/api/outreach/campaigns", {
        name: newCampaignName.trim(),
        channel: newCampaignChannel,
      });
      toast.success("Campaign created");
      setNewCampaignOpen(false);
      setNewCampaignName("");
      setNewCampaignChannel("email");
      router.push(`/outreach/bulk-fire/${campaign.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create campaign");
    } finally {
      setCreatingCampaign(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!deleteTarget) return;
    setDeletingCampaign(true);
    try {
      await api.delete(`/api/outreach/campaigns/${deleteTarget.id}`);
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete campaign");
    } finally {
      setDeletingCampaign(false);
    }
  };

  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    try {
      const { url } = await api.get<{ url: string }>(
        "/api/outreach/senders/gmail/oauth/start",
      );
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || "Failed to start Gmail connect");
      setConnectingGmail(false);
    }
  };

  const handleAddSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    try {
      await api.post("/api/outreach/senders", {
        label: smtp.label.trim(),
        email: smtp.email.trim(),
        fromName: smtp.fromName.trim() || undefined,
        smtpHost: smtp.smtpHost.trim(),
        smtpPort: Number(smtp.smtpPort),
        smtpSecure: smtp.smtpSecure,
        smtpUsername: smtp.smtpUsername.trim(),
        smtpPassword: smtp.smtpPassword,
      });
      toast.success("SMTP sender connected");
      setSmtpOpen(false);
      setSmtp({
        label: "",
        email: "",
        fromName: "",
        smtpHost: "",
        smtpPort: "587",
        smtpSecure: false,
        smtpUsername: "",
        smtpPassword: "",
      });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to connect SMTP sender");
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleAddWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWhatsapp(true);
    try {
      await api.post("/api/outreach/senders/whatsapp", {
        label: whatsapp.label.trim(),
        phoneNumber: whatsapp.phoneNumber.trim(),
        whatsappPhoneNumberId: whatsapp.whatsappPhoneNumberId.trim(),
        whatsappWabaId: whatsapp.whatsappWabaId.trim(),
        whatsappAccessToken: whatsapp.whatsappAccessToken,
        whatsappDisplayName: whatsapp.whatsappDisplayName.trim() || undefined,
      });
      toast.success("WhatsApp number connected");
      setWhatsappOpen(false);
      setWhatsapp({
        label: "",
        phoneNumber: "",
        whatsappPhoneNumberId: "",
        whatsappWabaId: "",
        whatsappAccessToken: "",
        whatsappDisplayName: "",
      });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to connect WhatsApp number");
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const toggleSenderActive = async (sender: Sender) => {
    // Optimistic: flip the toggle immediately, reconcile on failure. This is a
    // pure on/off that almost never fails, so the user shouldn't wait on the
    // round-trip.
    const next = !sender.isActive;
    setSenders((prev) =>
      prev.map((s) => (s.id === sender.id ? { ...s, isActive: next } : s)),
    );
    try {
      await api.patch(`/api/outreach/senders/${sender.id}`, {
        isActive: next,
      });
    } catch (err: any) {
      // Roll back the optimistic flip.
      setSenders((prev) =>
        prev.map((s) =>
          s.id === sender.id ? { ...s, isActive: sender.isActive } : s,
        ),
      );
      toast.error(err.message || "Failed to update sender");
    }
  };

  const removeSender = async (sender: Sender) => {
    setSenderBusyId(sender.id);
    try {
      await api.delete(`/api/outreach/senders/${sender.id}`);
      setSenders((prev) => prev.filter((s) => s.id !== sender.id));
      toast.success(`Disconnected ${sender.label}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect sender");
    } finally {
      setSenderBusyId(null);
    }
  };

  const checkDeliverability = async (sender: Sender) => {
    setDeliverability((prev) => ({ ...prev, [sender.id]: "loading" }));
    try {
      const report = await api.get<DeliverabilityReport>(
        `/api/outreach/senders/${sender.id}/dns-health`,
      );
      setDeliverability((prev) => ({ ...prev, [sender.id]: report }));
    } catch (err: any) {
      setDeliverability((prev) => ({ ...prev, [sender.id]: "error" }));
      toast.error(err.message || "Failed to check deliverability");
    }
  };

  if (authLoading) {
    return (
      <AppShell>
        <PageSpinner label="Loading outreach settings..." />
      </AppShell>
    );
  }

  const campaignColumns: DataTableColumn<Campaign>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
            <span className="material-symbols-outlined text-[18px]">
              {c.channel === "whatsapp" ? "chat" : "mail"}
            </span>
          </div>
          <span className="font-body-md text-[14px] font-medium text-on-surface">{c.name}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={STATUS_TONE[c.status]} className="capitalize">
            {c.status}
          </StatusBadge>
          {c.scheduledFireAt && (
            <StatusBadge
              tone="brass"
              title={new Date(c.scheduledFireAt).toLocaleString()}
            >
              Scheduled{" "}
              {new Date(c.scheduledFireAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (c) => (
        <span className="font-data-mono text-[12px] text-on-surface-variant">
          {new Date(c.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (c) => (
        <button
          type="button"
          onClick={(e) => {
            // The row itself navigates — keep the click from bubbling into it.
            e.preventDefault();
            e.stopPropagation();
            setDeleteTarget(c);
          }}
          aria-label={`Delete ${c.name}`}
          title="Delete campaign"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 transition-colors hover:bg-error/10 hover:text-error"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      ),
    },
  ];

  return (
    <AppShell>
      <TopAppBar
        leftContent={
          <div className="flex items-center gap-2 text-text-muted font-label-md">
            <span>Outreach</span>
            <span className="material-symbols-outlined text-sm">
              chevron_right
            </span>
            <span className="text-on-surface font-medium">Bulk Fire</span>
          </div>
        }
        rightContent={
          canOutreach ? (
            <Button type="button" variant="gradient" onClick={() => setNewCampaignOpen(true)} className="whitespace-nowrap">
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              New campaign
            </Button>
          ) : (
            <Link
              href="/billing"
              title="Upgrade to Growth to unlock Bulk Fire outreach"
              className="flex items-center gap-2 rounded-xl border border-primary px-5 py-2.5 font-label-md text-label-md text-primary transition-colors hover:bg-primary/5 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px]">
                lock
              </span>
              Upgrade to unlock
            </Link>
          )
        }
      />
      <main className="mx-auto max-w-[1440px] w-full p-4 sm:p-6 lg:p-12 min-h-screen">
        <PageHeaderCard
          icon="send"
          title="Bulk Fire"
          description="Bring your own list. Import leads, build a sequence once, and send it across rotating mailboxes at a pace that keeps you out of spam folders."
          action={
            canOutreach ? (
              <Button
                type="button"
                variant="gradient"
                size="lg"
                onClick={() => setNewCampaignOpen(true)}
                className="w-full justify-center sm:w-auto"
              >
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
                New campaign
              </Button>
            ) : undefined
          }
        />

        {!canOutreach ? (
          <section className="rounded-xl border border-dashed border-border-low-alpha p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-cream text-on-surface-variant/50">
              <span className="material-symbols-outlined text-[28px]">
                lock
              </span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface mb-2">
              Bulk-fire outreach is a Growth &amp; Scale feature
            </h2>
            <p className="mx-auto mb-6 max-w-md font-body-md text-body-md text-text-muted">
              Upgrade your plan to connect sender accounts and run paced,
              multi-account cold-email campaigns straight from your candidate
              search.
            </p>
            <Link
              href="/billing"
              className="inline-flex items-center gap-2 rounded-lg border border-primary px-6 py-2.5 font-label-md text-label-md text-primary transition-colors hover:bg-primary/5"
            >
              <span className="material-symbols-outlined text-[16px]">
                lock
              </span>
              Upgrade to unlock
            </Link>
          </section>
        ) : (
          <>
        {/* Sender accounts */}
        <section className="mb-12">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Sender accounts
              </h2>
              <p className="mt-1 font-label-md text-[12px] text-on-surface-variant">
                {senders.length} of {maxSenderAccounts} sender
                {maxSenderAccounts === 1 ? "" : "s"} used on your plan
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
              {senders.length >= maxSenderAccounts ? (
                <Link
                  href="/billing"
                  title="Upgrade to connect more sender accounts"
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-primary px-4 py-2 text-center font-label-md text-label-md text-primary transition-colors hover:bg-primary/5 sm:flex-initial"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    lock
                  </span>
                  Sender limit reached — upgrade
                </Link>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleConnectGmail}
                    disabled={connectingGmail}
                    className="min-h-10 w-full justify-center sm:w-auto sm:flex-initial"
                  >
                    {connectingGmail ? "Redirecting…" : "Connect Gmail"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSmtpOpen(true)}
                    className="min-h-10 w-full justify-center sm:w-auto sm:flex-initial"
                  >
                    Add SMTP
                  </Button>
                  {canWhatsApp ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setWhatsappOpen(true)}
                      className="min-h-10 w-full justify-center sm:w-auto sm:flex-initial"
                    >
                      Connect WhatsApp
                    </Button>
                  ) : (
                    <Link
                      href="/billing"
                      title="WhatsApp outreach is a Scale plan feature — upgrade to unlock"
                      className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border-low-alpha bg-white px-4 py-2 text-center font-label-md text-label-md text-on-surface-variant/70 transition-colors hover:bg-surface-container-low sm:flex-initial"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        lock
                      </span>
                      + Connect WhatsApp
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-xl border border-border-low-alpha bg-surface-white p-5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          ) : senders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-low-alpha p-8 text-center font-body-md text-on-surface-variant">
              No sender accounts connected yet. Connect at least one Gmail or
              SMTP account before firing a campaign.
            </div>
          ) : (
            <motion.div
              variants={stagger()}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {senders.map((s) => (
                <motion.div
                  key={s.id}
                  variants={itemVariants}
                  className="flex flex-col gap-3 rounded-xl border border-border-low-alpha bg-surface-white p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">
                        {SENDER_ICON[s.type]}
                      </span>
                      <div>
                        <div className="font-label-md text-label-md font-semibold text-on-surface">
                          {s.label}
                        </div>
                        <div className="font-body-md text-[13px] text-on-surface-variant">
                          {s.type === "whatsapp" && s.whatsappDisplayName
                            ? `${s.whatsappDisplayName} · ${s.email}`
                            : s.email}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-label-md text-[11px] ${
                        s.isActive
                          ? "bg-tertiary/10 text-tertiary"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {s.isActive ? "Active" : "Paused"}
                    </span>
                  </div>
                  {/* The per-mailbox `dailyLimit` used to be surfaced here as
                      "Daily limit: N/day". It is not editable anywhere in the
                      product, so every user saw an arbitrary number they never
                      chose (the schema default, 40) and could not change —
                      pure noise next to the plan's real, visible send caps. The
                      value still exists and is still enforced server-side when
                      a fire is scheduled (see outreach.service.ts's
                      per-sender budget); it's a deliverability guardrail that
                      protects the customer's own mailbox reputation, so it is
                      deliberately kept as an internal safety net rather than a
                      user-facing knob. */}
                  {s.type === "gmail" && !s.gmailHasReadScope && (
                    <p
                      title="Follow-ups can't auto-skip leads who already replied until this mailbox is reconnected with read access. Sending is unaffected."
                      className="flex items-center gap-1.5 rounded-lg bg-secondary-container/20 px-2.5 py-1.5 font-body-md text-[12px] text-secondary"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        info
                      </span>
                      Reconnect to enable reply detection for follow-ups
                    </p>
                  )}
                  {s.type !== "whatsapp" && (
                    <DeliverabilityCheck
                      result={deliverability[s.id]}
                      onCheck={() => checkDeliverability(s)}
                    />
                  )}
                  <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={senderBusyId === s.id}
                      onClick={() => toggleSenderActive(s)}
                      className="min-h-10 w-full justify-center sm:min-h-7"
                    >
                      {s.isActive ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={senderBusyId === s.id}
                      onClick={() => removeSender(s)}
                      className="min-h-10 w-full justify-center border-error/25 text-error hover:bg-error/5 sm:min-h-7"
                    >
                      Disconnect
                    </Button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Campaigns */}
        <section>
          <h2 className="mb-4 font-headline-md text-headline-md text-on-surface">
            Campaigns
          </h2>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={4} columns={3} withAvatar />
              ) : (
                <DataTable
                  columns={campaignColumns}
                  rows={campaigns}
                  getRowKey={(c) => c.id}
                  onRowClick={(c) => router.push(`/outreach/bulk-fire/${c.id}`)}
                  emptyState={
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-outline text-[32px]">send</span>
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        No campaigns yet. Create one, import your leads, and build the sequence.
                      </p>
                      <Button type="button" variant="gradient" onClick={() => setNewCampaignOpen(true)}>
                        New campaign
                      </Button>
                    </div>
                  }
                />
              )}
            </CardContent>
          </Card>
        </section>
          </>
        )}
      </main>

      <Modal
        open={newCampaignOpen}
        onClose={() => !creatingCampaign && setNewCampaignOpen(false)}
        title="New Bulk Fire campaign"
        subtitle="Name it after the segment you're targeting — you'll import leads next."
      >
        <form onSubmit={handleCreateCampaign} className="space-y-6">
          <div>
            <label
              htmlFor="campaignName"
              className="block font-label-md text-primary mb-2"
            >
              Campaign name
            </label>
            <input
              id="campaignName"
              type="text"
              required
              autoFocus
              disabled={creatingCampaign}
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              placeholder="e.g. Q3 Roofing Contractors — East Coast"
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/60"
            />
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">
              Channel
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNewCampaignChannel("email")}
                disabled={creatingCampaign}
                className={`rounded-xl border px-4 py-3 text-left font-body-md text-[13px] transition-colors ${
                  newCampaignChannel === "email"
                    ? "border-primary bg-primary/5 text-on-surface"
                    : "border-border-low-alpha text-on-surface-variant"
                }`}
              >
                <span className="material-symbols-outlined mr-1.5 align-middle text-[16px]">
                  mail
                </span>
                Email
              </button>
              <button
                type="button"
                onClick={() => canWhatsApp && setNewCampaignChannel("whatsapp")}
                disabled={creatingCampaign || !canWhatsApp}
                title={
                  canWhatsApp
                    ? undefined
                    : "WhatsApp outreach is a Scale plan feature"
                }
                className={`rounded-xl border px-4 py-3 text-left font-body-md text-[13px] transition-colors disabled:opacity-50 ${
                  newCampaignChannel === "whatsapp"
                    ? "border-primary bg-primary/5 text-on-surface"
                    : "border-border-low-alpha text-on-surface-variant"
                }`}
              >
                <span className="material-symbols-outlined mr-1.5 align-middle text-[16px]">
                  {canWhatsApp ? "chat" : "lock"}
                </span>
                WhatsApp
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setNewCampaignOpen(false)}
              disabled={creatingCampaign}
              className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingCampaign || !newCampaignName.trim()}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {creatingCampaign ? "Creating…" : "Create campaign"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={smtpOpen}
        onClose={() => !savingSmtp && setSmtpOpen(false)}
        title="Connect an SMTP sender"
        subtitle="Credentials are encrypted at rest and never shown again after saving."
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleAddSmtp} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-label-md text-primary mb-2">
                Label
              </label>
              <input
                required
                value={smtp.label}
                onChange={(e) => setSmtp({ ...smtp, label: e.target.value })}
                placeholder="Sales inbox #1"
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
            <div>
              <label className="block font-label-md text-primary mb-2">
                From name
              </label>
              <input
                value={smtp.fromName}
                onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })}
                placeholder="Optional"
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">
              Email address
            </label>
            <input
              required
              type="email"
              value={smtp.email}
              onChange={(e) => setSmtp({ ...smtp, email: e.target.value })}
              placeholder="you@yourdomain.com"
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-label-md text-primary mb-2">
                SMTP host
              </label>
              <input
                required
                value={smtp.smtpHost}
                onChange={(e) => setSmtp({ ...smtp, smtpHost: e.target.value })}
                placeholder="smtp.yourdomain.com"
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
            <div>
              <label className="block font-label-md text-primary mb-2">
                Port
              </label>
              <input
                required
                type="number"
                value={smtp.smtpPort}
                onChange={(e) => setSmtp({ ...smtp, smtpPort: e.target.value })}
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-label-md text-primary mb-2">
                Username
              </label>
              <input
                required
                value={smtp.smtpUsername}
                onChange={(e) =>
                  setSmtp({ ...smtp, smtpUsername: e.target.value })
                }
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
            <div>
              <label className="block font-label-md text-primary mb-2">
                Password
              </label>
              <input
                required
                type="password"
                value={smtp.smtpPassword}
                onChange={(e) =>
                  setSmtp({ ...smtp, smtpPassword: e.target.value })
                }
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 font-label-md text-[13px] text-on-surface-variant">
            <input
              type="checkbox"
              checked={smtp.smtpSecure}
              onChange={(e) =>
                setSmtp({ ...smtp, smtpSecure: e.target.checked })
              }
              className="rounded"
            />
            Use TLS (usually on for port 465)
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSmtpOpen(false)}
              disabled={savingSmtp}
              className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingSmtp}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {savingSmtp ? "Connecting…" : "Connect sender"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={whatsappOpen}
        onClose={() => !savingWhatsapp && setWhatsappOpen(false)}
        title="Connect a WhatsApp Business number"
        subtitle="Direct Meta Cloud API credentials — the access token is encrypted at rest and never shown again after saving."
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleAddWhatsapp} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-label-md text-primary mb-2">
                Label
              </label>
              <input
                required
                value={whatsapp.label}
                onChange={(e) =>
                  setWhatsapp({ ...whatsapp, label: e.target.value })
                }
                placeholder="Recruiting line #1"
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
            <div>
              <label className="block font-label-md text-primary mb-2">
                Display name
              </label>
              <input
                value={whatsapp.whatsappDisplayName}
                onChange={(e) =>
                  setWhatsapp({
                    ...whatsapp,
                    whatsappDisplayName: e.target.value,
                  })
                }
                placeholder="Optional"
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">
              Phone number (E.164)
            </label>
            <input
              required
              value={whatsapp.phoneNumber}
              onChange={(e) =>
                setWhatsapp({ ...whatsapp, phoneNumber: e.target.value })
              }
              placeholder="+14155552671"
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-label-md text-primary mb-2">
                Phone number ID
              </label>
              <input
                required
                value={whatsapp.whatsappPhoneNumberId}
                onChange={(e) =>
                  setWhatsapp({
                    ...whatsapp,
                    whatsappPhoneNumberId: e.target.value,
                  })
                }
                placeholder="From the Meta App Dashboard"
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
            <div>
              <label className="block font-label-md text-primary mb-2">
                WABA ID
              </label>
              <input
                required
                value={whatsapp.whatsappWabaId}
                onChange={(e) =>
                  setWhatsapp({ ...whatsapp, whatsappWabaId: e.target.value })
                }
                placeholder="WhatsApp Business Account ID"
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
              />
            </div>
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">
              Permanent access token
            </label>
            <input
              required
              type="password"
              value={whatsapp.whatsappAccessToken}
              onChange={(e) =>
                setWhatsapp({
                  ...whatsapp,
                  whatsappAccessToken: e.target.value,
                })
              }
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-2.5 font-body-md"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setWhatsappOpen(false)}
              disabled={savingWhatsapp}
              className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingWhatsapp}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {savingWhatsapp ? "Connecting…" : "Connect number"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deletingCampaign && setDeleteTarget(null)}
        title="Delete campaign"
        subtitle={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This permanently removes its leads, sequence, and send history — including any sends still in flight. This action cannot be undone.`
            : undefined
        }
      >
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={deletingCampaign}
            className="w-full rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low disabled:opacity-50 sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteCampaign}
            disabled={deletingCampaign}
            className="w-full rounded-lg bg-error px-5 py-2.5 font-label-md text-white transition-colors hover:bg-error/90 active:scale-[0.98] disabled:opacity-50 sm:w-auto"
          >
            {deletingCampaign ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </Modal>
    </AppShell>
  );
}
