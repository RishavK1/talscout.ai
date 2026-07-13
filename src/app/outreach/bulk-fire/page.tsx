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

interface Campaign {
  id: string;
  name: string;
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
  type: "gmail" | "smtp";
  label: string;
  email: string;
  isActive: boolean;
  dailyLimit: number;
}

const STATUS_STYLE: Record<Campaign["status"], string> = {
  draft: "bg-surface-container-high text-on-surface-variant",
  importing: "bg-secondary-container/30 text-secondary",
  ready: "bg-tertiary-fixed/30 text-on-tertiary-fixed-variant",
  running: "bg-primary/10 text-primary",
  paused: "bg-surface-container-high text-on-surface-variant",
  completed: "bg-tertiary/10 text-tertiary",
  error: "bg-error/10 text-error",
};

export default function BulkFirePage() {
  const router = useRouter();
  const { can, profile, loading: authLoading } = useAuth();
  const canOutreach = can("outreach_bulk_fire");
  const { maxSenderAccounts } = outreachLimits(profile?.plan || "starter");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
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
      });
      toast.success("Campaign created");
      setNewCampaignOpen(false);
      setNewCampaignName("");
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

  const toggleSenderActive = async (sender: Sender) => {
    setSenderBusyId(sender.id);
    try {
      await api.patch(`/api/outreach/senders/${sender.id}`, {
        isActive: !sender.isActive,
      });
      setSenders((prev) =>
        prev.map((s) =>
          s.id === sender.id ? { ...s, isActive: !s.isActive } : s,
        ),
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update sender");
    } finally {
      setSenderBusyId(null);
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

  if (authLoading) {
    return (
      <AppShell>
        <PageSpinner label="Loading outreach settings..." />
      </AppShell>
    );
  }

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
            <button
              type="button"
              onClick={() => setNewCampaignOpen(true)}
              className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-[0.98] whitespace-nowrap"
            >
              + New campaign
            </button>
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
      <main className="mx-auto max-w-[1160px] p-4 sm:p-6 lg:p-12 min-h-screen">
        <section className="mb-10">
          <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
            Bulk Fire
          </h1>
          <p className="font-body-md text-body-md text-text-muted max-w-2xl">
            Import leads from a docx playbook, personalize with spintax, and
            send a paced, multi-account cold-email sequence — durable
            server-side sends that keep going even after you close this tab.
          </p>
        </section>

        {!canOutreach ? (
          <section className="rounded-[20px] border-2 border-dashed border-border-low-alpha p-10 text-center">
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
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {senders.length >= maxSenderAccounts ? (
                <Link
                  href="/billing"
                  title="Upgrade to connect more sender accounts"
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg border border-primary px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary/5 text-center"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    lock
                  </span>
                  Sender limit reached — upgrade
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleConnectGmail}
                    disabled={connectingGmail}
                    className="flex-1 sm:flex-initial rounded-lg border border-border-low-alpha bg-white px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50 text-center"
                  >
                    {connectingGmail ? "Redirecting…" : "+ Connect Gmail"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmtpOpen(true)}
                    className="flex-1 sm:flex-initial rounded-lg border border-border-low-alpha bg-white px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low text-center"
                  >
                    + Add SMTP
                  </button>
                </>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-[20px] border border-border-low-alpha bg-white py-12 font-body-md text-on-surface-variant">
              <span className="material-symbols-outlined mr-2 animate-spin">
                sync
              </span>{" "}
              Loading senders…
            </div>
          ) : senders.length === 0 ? (
            <div className="rounded-[20px] border-2 border-dashed border-border-low-alpha p-8 text-center font-body-md text-on-surface-variant">
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
                  className="flex flex-col gap-3 rounded-[20px] border border-border-low-alpha bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">
                        {s.type === "gmail" ? "mail" : "dns"}
                      </span>
                      <div>
                        <div className="font-label-md text-label-md font-semibold text-on-surface">
                          {s.label}
                        </div>
                        <div className="font-body-md text-[13px] text-on-surface-variant">
                          {s.email}
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
                  <div className="font-data-mono text-[12px] text-text-muted">
                    Daily limit: {s.dailyLimit}/day
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={senderBusyId === s.id}
                      onClick={() => toggleSenderActive(s)}
                      className="flex-1 rounded-lg border border-border-low-alpha px-3 py-1.5 font-label-md text-[12px] text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
                    >
                      {s.isActive ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      disabled={senderBusyId === s.id}
                      onClick={() => removeSender(s)}
                      className="rounded-lg border border-error/20 px-3 py-1.5 font-label-md text-[12px] text-error transition-colors hover:bg-error/5 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
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
          {loading ? (
            <div className="flex items-center justify-center rounded-[20px] border border-border-low-alpha bg-white py-12 font-body-md text-on-surface-variant">
              <span className="material-symbols-outlined mr-2 animate-spin">
                sync
              </span>{" "}
              Loading campaigns…
            </div>
          ) : (
            <motion.div
              variants={stagger()}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
            >
              <motion.div
                variants={itemVariants}
                onClick={() => setNewCampaignOpen(true)}
                className="group flex min-h-[180px] cursor-pointer flex-col items-center justify-center space-y-3 rounded-[20px] border-2 border-dashed border-border-low-alpha p-8 text-center transition-all duration-300 hover:border-primary/30 hover:bg-white/50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low transition-colors group-hover:bg-primary/10">
                  <span className="material-symbols-outlined text-primary text-[28px]">
                    add
                  </span>
                </div>
                <h4 className="font-headline-md text-[16px] text-on-surface">
                  New campaign
                </h4>
              </motion.div>

              {campaigns.map((c) => (
                <motion.div key={c.id} variants={itemVariants}>
                  <Link
                    href={`/outreach/bulk-fire/${c.id}`}
                    className="flex min-h-[180px] flex-col justify-between rounded-[20px] border border-border-low-alpha bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  >
                    <div>
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <h3 className="font-headline-md text-[18px] text-on-surface leading-snug">
                          {c.name}
                        </h3>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-label-md text-[11px] capitalize ${STATUS_STYLE[c.status]}`}
                          >
                            {c.status}
                          </span>
                          {c.scheduledFireAt && (
                            <span
                              title={new Date(c.scheduledFireAt).toLocaleString()}
                              className="rounded-full bg-secondary-container/30 px-2.5 py-0.5 font-label-md text-[11px] text-secondary"
                            >
                              Scheduled{" "}
                              {new Date(c.scheduledFireAt).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteTarget(c);
                            }}
                            aria-label={`Delete ${c.name}`}
                            title="Delete campaign"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-error/10 hover:text-error active:scale-[0.94]"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border-low-alpha pt-3">
                      <span className="font-data-mono text-[12px] text-text-muted">
                        Created {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                      <span className="material-symbols-outlined text-[18px] text-primary">
                        arrow_forward
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
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
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:opacity-50"
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
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
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
          <div className="grid grid-cols-2 gap-4">
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
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:opacity-50"
            >
              {savingSmtp ? "Connecting…" : "Connect sender"}
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
