"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/components/ui/modal";
import { TopAppBar } from "@/components/app/top-app-bar";

const TABS = ["General", "Security", "Data & privacy", "Developer"] as const;
type Tab = (typeof TABS)[number];

const slug = (t: string) => t.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-[20px] p-6 sm:p-8 premium-shadow border border-border-low-alpha">
      <div className="mb-8">
        <h3 className="font-headline-md text-headline-md text-primary serif-text mb-1">
          {title}
        </h3>
        <p className="text-on-surface-variant font-body-md">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function WorkspaceCard({ workspaceName, tenantId }: { workspaceName: string; tenantId: string }) {
  const { profile, refreshProfile } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(profile?.logo || null);
  const [name, setName] = useState(workspaceName);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoUrl(profile?.logo || null);
  }, [profile?.logo]);

  const handleLogoClick = () => {
    logoInputRef.current?.click();
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo file must be smaller than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setLogoUrl(base64);
      try {
        await api.patch("/api/settings", { logo: base64 });
        await refreshProfile(true);
        toast.success("Logo uploaded successfully");
      } catch (err: any) {
        toast.error("Failed to upload logo: " + err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      await api.patch("/api/settings", { workspaceName: name });
      await refreshProfile(true);
      toast.success("Workspace name updated successfully");
    } catch (err: any) {
      toast.error("Failed to update workspace name: " + err.message);
    }
  };

  return (
    <Card title="Workspace" subtitle="Configure your agency's public presence and domain.">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 md:gap-12">
        <div className="space-y-6">
          <div>
            <label className="block font-label-md text-primary mb-2">Agency Name</label>
            <input
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <label className="block font-label-md text-primary mb-4 w-full text-center">
            Agency Logo
          </label>
          <div className="relative group cursor-pointer" onClick={handleLogoClick}>
            <input
              type="file"
              ref={logoInputRef}
              onChange={handleLogoChange}
              accept="image/*"
              className="hidden"
            />
            <div className="w-32 h-32 rounded-full bg-bg-cream/40 border-2 border-dashed border-outline-variant flex items-center justify-center overflow-hidden relative transition-all group-hover:border-primary group-hover:shadow-md">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Agency Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-outline text-[40px]">image</span>
              )}
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200">
                <span className="material-symbols-outlined text-[24px]">upload</span>
                <span className="text-[10px] font-label-md uppercase tracking-wider mt-1">Upload</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-10 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="bg-primary text-white px-8 py-3 rounded-xl font-label-md hover:shadow-lg transition-all active:scale-[0.98]"
        >
          Save changes
        </button>
      </div>
    </Card>
  );
}

function ProfileCard({ email, userId }: { email: string; userId: string }) {
  const { profile, refreshProfile, signOut } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar || null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAvatarUrl(profile?.avatar || null);
  }, [profile?.avatar]);

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Profile picture must be smaller than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setAvatarUrl(base64);
      try {
        await api.patch("/api/settings", { avatar: base64 });
        await refreshProfile(true);
        toast.success("Profile picture updated successfully");
      } catch (err: any) {
        toast.error("Failed to update profile picture: " + err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const display = email ? email.split("@")[0] : "";
  const name = display
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "User";
  const initials = display
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2) || "U";

  return (
    <Card title="Personal profile" subtitle="Manage your account details and profile picture.">
      <div className="flex flex-col sm:flex-row gap-8 sm:gap-12">
        <div className="shrink-0">
          <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
            <input
              type="file"
              ref={avatarInputRef}
              onChange={handleAvatarChange}
              accept="image/*"
              className="hidden"
            />
            <div className="w-24 h-24 rounded-full bg-surface-container overflow-hidden border-2 border-white shadow-md flex items-center justify-center text-primary font-headline-md serif-text relative transition-all group-hover:shadow-lg">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Profile Picture" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200">
                <span className="material-symbols-outlined text-[20px]">add_a_photo</span>
                <span className="text-[9px] font-label-md uppercase tracking-wider mt-1">Change</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block font-label-md text-primary mb-2">Full name</label>
            <input
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md"
              type="text"
              disabled
              value={name}
            />
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">Work email</label>
            <input
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md"
              type="email"
              disabled
              value={email}
            />
          </div>
        </div>
      </div>
      <div className="mt-10 flex justify-between items-center">
        <button
          type="button"
          onClick={signOut}
          className="text-error border border-error/20 px-6 py-3 rounded-xl font-label-md hover:bg-error/5 transition-all active:scale-[0.98]"
        >
          Log out
        </button>
      </div>
    </Card>
  );
}

function SecurityCard() {
  const { profile } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setChanging(true);
    try {
      // Real password update against the authenticated Supabase session.
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully");
      setPwOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update password";
      toast.error(msg);
    } finally {
      setChanging(false);
    }
  };

  return (
    <>
      <Card title="Security" subtitle="Protect your account with modern security standards.">
        <div className="space-y-8">
          <div className="flex flex-wrap gap-4 items-center justify-between py-4 border-b border-border-low-alpha/50">
            <div>
              <p className="font-label-md text-primary">Password</p>
              <p className="text-on-surface-variant text-[13px]">
                Set a strong, unique password for {profile?.email || "your account"}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPwOpen(true)}
              className="px-5 py-2 border border-outline rounded-lg text-primary font-label-md hover:bg-surface-container-low transition-colors"
            >
              Change password
            </button>
          </div>
          <div className="flex flex-wrap gap-4 items-center justify-between py-4 border-b border-border-low-alpha/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-label-md text-primary">Two-factor authentication</p>
                <span className="bg-surface-container-high text-on-surface-variant text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Coming soon
                </span>
              </div>
              <p className="text-on-surface-variant text-[13px]">
                TOTP-based 2FA is on our roadmap and will appear here when it ships.
              </p>
            </div>
          </div>
          <div>
            <p className="font-label-md text-primary mb-4">Current session</p>
            <div className="bg-bg-cream/40 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-outline">devices</span>
                  <div>
                    <p className="text-label-md text-on-surface">
                      This device — signed in as {profile?.email || "you"}
                    </p>
                    <p className="text-[11px] text-tertiary font-medium">Active now</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-on-surface-variant">
              Signing out ends this session. Cross-device session management is coming soon.
            </p>
          </div>
        </div>
      </Card>

      <Modal
        open={pwOpen}
        onClose={() => !changing && setPwOpen(false)}
        title="Change password"
        subtitle="Choose a new password of at least 8 characters."
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block font-label-md text-primary mb-2">New password</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">Confirm new password</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPwOpen(false)}
              disabled={changing}
              className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={changing}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:opacity-50"
            >
              {changing ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function DataPanel({ profile, signOut }: { profile: any; signOut: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const handleExportData = async () => {
    try {
      setExporting(true);
      toast.loading("Compiling candidate records & audit logs...", { id: "export-data" });

      // Fetch candidates
      const res = await api.get<{ candidates: any[] }>("/api/candidates?limit=200");
      const list = res.candidates || [];

      if (list.length === 0) {
        toast.error("No candidate records found in workspace to export.", { id: "export-data" });
        setExporting(false);
        return;
      }

      // SEC-009: Sanitize cell values to prevent spreadsheet formula injection.
      // If a cell begins with standard formula triggers (=, +, -, @) or tabs/returns, prefix it with a single quote.
      const sanitizeCsvCell = (val: string): string => {
        if (/^[=+\-@\t\r]/.test(val)) {
          return `'${val}`;
        }
        return val;
      };

      // Convert candidates list to CSV
      const headers = ["Full Name", "Emails", "Phones", "Location", "Current Title", "Years of Experience", "Skills", "Summary"];
      const rows = list.map((c) => [
        `"${sanitizeCsvCell(c.fullName || "").replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell((c.emails || []).join("; ")).replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell((c.phones || []).join("; ")).replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell(c.location || "").replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell(c.currentTitle || "").replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell(String(c.yearsExperience || 0)).replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell((c.skills || []).join(", ")).replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell(c.summary || "").replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `talscout_candidates_export_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Successfully exported ${list.length} candidate records as CSV!`, { id: "export-data" });
    } catch (err: any) {
      toast.error(err.message || "Failed to export data", { id: "export-data" });
    } finally {
      setExporting(false);
    }
  };

  const executeDeleteWorkspace = async () => {
    if (deleteConfirmText !== "DELETE") {
      toast.error("Confirmation text did not match. Workspace deletion aborted.");
      return;
    }

    setDeleting(true);
    setIsDeleteModalOpen(false);
    toast.loading("De-provisioning databases and deleting assets...", { id: "delete-ws" });

    try {
      await api.delete("/api/workspace", { confirm: "DELETE" });
      toast.success("Workspace successfully de-provisioned", { id: "delete-ws" });
      await signOut();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete workspace";
      toast.error(msg, { id: "delete-ws" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card title="Data & privacy" subtitle="Export, review, or delete your workspace data.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 items-center justify-between py-4 border-b border-border-low-alpha/50">
            <div>
              <p className="font-label-md text-primary">Export workspace data</p>
              <p className="text-on-surface-variant text-[13px]">Download all candidates and activity as CSV.</p>
            </div>
            <button
              type="button"
              onClick={handleExportData}
              disabled={exporting}
              className="px-5 py-2 border border-outline rounded-lg text-primary font-label-md hover:bg-surface-container-low transition-colors disabled:opacity-50"
            >
              {exporting ? "Exporting..." : "Export data"}
            </button>
          </div>
          <div className="flex flex-wrap gap-4 items-center justify-between py-4 border-b border-border-low-alpha/50">
            <div>
              <p className="font-label-md text-primary">Activity log</p>
              <p className="text-on-surface-variant text-[13px]">Review every sensitive action in your workspace.</p>
            </div>
            <Link
              href="/audit"
              className="px-5 py-2 border border-outline rounded-lg text-primary font-label-md hover:bg-surface-container-low transition-colors"
            >
              View audit log
            </Link>
          </div>
          <div className="flex flex-wrap gap-4 items-center justify-between py-4">
            <div>
              <p className="font-label-md text-error">Delete workspace</p>
              <p className="text-on-surface-variant text-[13px]">Permanently remove this workspace and all data.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmText("");
                setIsDeleteModalOpen(true);
              }}
              disabled={deleting}
              className="px-5 py-2 border border-error/40 text-error rounded-lg font-label-md hover:bg-error/5 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Card>

      <Modal
        open={isDeleteModalOpen}
        onClose={() => {
          if (!deleting) setIsDeleteModalOpen(false);
        }}
        title="Delete workspace"
        subtitle="This action is permanent and cannot be undone."
      >
        <div className="space-y-6">
          <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex gap-3">
            <span className="material-symbols-outlined text-error shrink-0 mt-0.5">warning</span>
            <div className="text-body-md text-[14px] leading-relaxed text-error">
              <span className="font-semibold">WARNING:</span> Are you absolutely sure you want to permanently delete this workspace? This will remove all candidates, resumes, team members, and billing details.
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-label-md text-primary font-medium">
              To confirm deletion, please type <span className="font-bold text-error">DELETE</span> below:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-error focus:border-error"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-border-low-alpha">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleting}
              className="px-5 py-2.5 border border-outline rounded-xl font-label-md hover:bg-surface-container-low transition-colors text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeDeleteWorkspace}
              disabled={deleteConfirmText !== "DELETE" || deleting}
              className="px-5 py-2.5 bg-error text-white hover:opacity-90 disabled:opacity-50 rounded-xl font-label-md transition-all active:scale-[0.98]"
            >
              {deleting ? "Deleting..." : "Delete permanently"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function DeveloperCard({ plan }: { plan: string }) {
  if (plan !== "scale") {
    return (
      <section className="relative overflow-hidden bg-white rounded-[20px] p-8 sm:p-12 premium-shadow border border-border-low-alpha text-center">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-secondary/5 blur-3xl" />

        <div className="max-w-md mx-auto py-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto mb-6 border border-amber-500/20 shadow-sm">
            <span className="material-symbols-outlined text-[32px] animate-pulse">lock</span>
          </div>

          <span className="inline-block bg-primary/10 text-primary text-[11px] px-3 py-1 rounded-full font-bold uppercase tracking-wider mb-3">
            Scale Plan Exclusive
          </span>

          <h3 className="font-headline-md text-2xl text-primary serif-text mb-4">
            Custom API &amp; Webhooks
          </h3>

          <p className="text-on-surface-variant font-body-md leading-relaxed mb-8">
            Unlock programmatic resume ingestion, real-time sync capabilities, and outbound webhooks to route extraction payloads back to your custom ATS.
          </p>

          <Link
            href="/billing"
            className="inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-3.5 rounded-xl font-label-md hover:shadow-lg hover:opacity-95 transition-all active:scale-[0.98]"
          >
            Upgrade subscription to Scale
            <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
          </Link>
        </div>
      </section>
    );
  }

  // Scale plan: API access & webhooks are part of the plan but the backend
  // (key issuance/auth + outbound delivery) hasn't shipped yet. Say so plainly
  // instead of showing a fake console that generates client-side keys.
  return (
    <Card
      title="Custom API & Webhooks"
      subtitle="Programmatic access for your Scale workspace."
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 shrink-0 rounded-xl bg-secondary-container/20 text-secondary flex items-center justify-center border border-secondary/20">
          <span className="material-symbols-outlined text-[24px]">construction</span>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="font-label-md text-primary font-semibold">In development</p>
            <span className="bg-secondary-container/30 text-secondary text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Included in Scale
            </span>
          </div>
          <p className="text-on-surface-variant font-body-md leading-relaxed mb-4">
            Workspace API keys for programmatic résumé ingestion and outbound webhooks
            (candidate.ready, candidate.failed, shortlist.created) are being finalized.
            They&apos;ll appear here — at no extra cost — the moment they ship.
          </p>
          <a
            href="mailto:support@talscout.ai?subject=API%20access%20early%20interest"
            className="inline-flex items-center gap-2 font-label-md text-label-md text-secondary font-semibold hover:underline"
          >
            Get notified when it&apos;s live
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </a>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { profile, workspaceName, signOut, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("General");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoadingPlan(false);
      return;
    }
    const loadPlan = async () => {
      try {
        const res = await api.get<{ plan: string }>("/api/billing");
        setCurrentPlan(res.plan);
      } catch (e) {
        console.error("Failed to load plan", e);
      } finally {
        setLoadingPlan(false);
      }
    };
    loadPlan();
  }, [profile, authLoading]);

  // Deep-link support: initialise from URL hash (e.g. /settings#data-privacy).
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    const found = TABS.find((t) => slug(t) === h);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: read URL hash on mount (window not available at SSR)
    if (found) setTab(() => found);
  }, []);

  const selectTab = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `#${slug(t)}`);
  };

  if (authLoading) {
    return (
      <AppShell>
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <p className="font-label-md text-text-muted">Loading settings...</p>
          </div>
        </main>
      </AppShell>
    );
  }

  const userEmail = profile?.email || "";
  const nameOfWorkspace = workspaceName || "Workspace";

  return (
    <AppShell>
      <main className="min-h-dvh flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
              <nav className="flex text-on-surface-variant font-label-md gap-2 items-center">
                <span className="text-on-surface-variant">Settings</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                <span className="text-primary font-semibold">{tab}</span>
              </nav>
              <div className="sm:ml-12 relative flex-1 sm:flex-none">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                  search
                </span>
                <input
                  className="pl-10 pr-4 py-2 bg-surface-white border border-border-low-alpha rounded-full w-full sm:w-64 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="Search settings..."
                  type="text"
                />
              </div>
            </div>
          }
          rightContent={
            <Link
              href="/upload"
              className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-[0.98] whitespace-nowrap"
            >
              + Upload résumés
            </Link>
          }
        />

        {/* Content Canvas */}
        <div className="flex-1 p-4 sm:p-6 lg:p-12 max-w-6xl mx-auto w-full">
          <h1 className="font-headline-lg text-3xl sm:text-display-lg text-primary mb-8 lg:mb-12 serif-text">
            Settings
          </h1>
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Sub-nav column */}
            <aside className="w-full lg:w-56 lg:shrink-0">
              <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                {TABS.map((t) => {
                  const active = t === tab;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => selectTab(t)}
                      className={
                        "flex items-center whitespace-nowrap px-4 py-3 rounded-lg transition-all text-left " +
                        (active
                           ? "bg-primary/5 text-primary font-semibold lg:border-l-4 lg:border-primary"
                          : "text-on-surface-variant hover:bg-surface-container-low")
                      }
                    >
                      {t}
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Content Column */}
            <div className="flex-1 space-y-8 pb-20 min-w-0">
              {tab === "General" && (
                <>
                  <WorkspaceCard
                    workspaceName={nameOfWorkspace}
                    tenantId={profile?.tenantId || ""}
                  />
                  <ProfileCard
                    email={userEmail}
                    userId={profile?.userId || ""}
                  />
                </>
              )}
              {tab === "Security" && <SecurityCard />}
              {tab === "Data & privacy" && <DataPanel profile={profile} signOut={signOut} />}
              {tab === "Developer" && (
                loadingPlan ? (
                  <Card title="Custom API & Webhooks" subtitle="Loading integration details...">
                    <div className="flex flex-col items-center gap-4 py-8">
                      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                      <p className="text-label-md text-text-muted">Loading plan configuration...</p>
                    </div>
                  </Card>
                ) : (
                  <DeveloperCard plan={currentPlan || "starter"} />
                )
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-bg-cream w-full py-12 px-4 sm:px-6 lg:px-12 border-t border-border-low-alpha mt-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-[1440px] mx-auto">
            <div className="col-span-1">
              <span className="text-headline-md font-headline-md text-primary block mb-4">TalScout</span>
              <p className="text-on-surface-variant text-label-md leading-relaxed">
                Intelligence-driven recruitment for the modern age.
              </p>
            </div>
            <div className="flex flex-col space-y-3">
              <p className="font-label-md text-primary uppercase text-[10px] tracking-widest mb-2">Platform</p>
              <Link href="/#features" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Features</Link>
              <Link href="/pricing" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Pricing</Link>
            </div>
            <div className="flex flex-col space-y-3">
              <p className="font-label-md text-primary uppercase text-[10px] tracking-widest mb-2">Legal</p>
              <Link href="/privacy" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Privacy</Link>
              <Link href="/terms" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Terms</Link>
              <Link href="/cookies" className="text-on-surface-variant font-body-md hover:text-secondary transition-colors">Cookie Policy</Link>
            </div>
            <div className="flex flex-col items-start md:items-end justify-between">
              <p className="text-on-surface-variant text-label-md opacity-60 mt-4 md:mt-0">© {new Date().getFullYear()} TalScout AI. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}
