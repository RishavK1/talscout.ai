"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { InviteMemberButton } from "@/components/team/invite-member-button";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { TopAppBar } from "@/components/app/top-app-bar";


type Member = {
  id: string;
  email: string;
  role: "admin" | "recruiter" | "viewer";
  status: "active" | "invited" | "removed";
  createdAt: string;
};

const getMemberDisplay = (email: string) => {
  const namePart = email.split("@")[0];
  const name = namePart
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const initials = namePart
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2) || "M";
  return { name, initials };
};

export default function TeamSeatsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [seats, setSeats] = useState<{ total: number; used: number; plan: string }>({
    total: 1,
    used: 1,
    plan: "starter",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [teamRes, billingRes] = await Promise.all([
        api.get<Member[]>("/api/team"),
        api.get<{ plan: string; status: string; seats: number; seatsUsed: number }>("/api/billing"),
      ]);
      setMembers(teamRes);
      setSeats({
        total: billingRes.seats,
        used: billingRes.seatsUsed,
        plan: billingRes.plan,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load team data";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role === "admin") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    } else if (profile) {
      setLoading(false);
    }
  }, [profile]);

  const handleRemove = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to remove ${email} from the workspace?`)) {
      return;
    }
    try {
      await api.delete(`/api/team/${userId}`);
      toast.success("Member removed successfully");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      toast.error(msg);
    }
  };

  if (authLoading || (loading && profile?.role === "admin")) {
    return (
      <AppShell>
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <p className="font-label-md text-text-muted">Loading team settings...</p>
          </div>
        </main>
      </AppShell>
    );
  }

  if (profile && profile.role !== "admin") {
    return (
      <AppShell>
        <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg-cream/30">
          <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl premium-shadow border border-border-low-alpha">
            <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-[36px]">shield_person</span>
            </div>
            <h2 className="font-headline-md text-[24px] text-primary serif-text mb-3">Admin Access Required</h2>
            <p className="font-body-md text-on-surface-variant mb-6 text-[14px]">
              Only workspace administrators can manage team members, access level roles, and billing seats.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg font-label-md hover:shadow-lg transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              Back to Dashboard
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  const filtered = members
    .filter((m) => m.status !== "removed")
    .filter((m) => {
      const query = q.trim().toLowerCase();
      return query === "" || m.email.toLowerCase().includes(query);
    });

  const remainingSeats = Math.max(0, seats.total - seats.used);
  const usagePercentage = Math.min(100, Math.round((seats.used / seats.total) * 100));

  return (
    <AppShell>
      {/* Content Area */}
      <main className="min-h-screen">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="font-label-md text-label-md cursor-pointer hover:text-primary transition-colors">Settings</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              <span className="font-label-md text-label-md text-primary font-semibold">Team &amp; seats</span>
            </div>
          }
          rightContent={
            <Link href="/upload" className="px-5 py-2.5 bg-primary text-white rounded-xl font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-[0.98]">
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              + Upload résumés
            </Link>
          }
        />

        {/* Main Content */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 py-12">
          {/* Page Heading */}
          <div className="mb-10">
            <h2 className="font-headline-lg text-headline-lg text-primary mb-2">Team &amp; seats</h2>
            <p className="text-on-surface-variant max-w-2xl">Manage your organizational structure, invite recruitment partners, and control access levels across the TalScout platform.</p>
          </div>

          {/* Seats Usage Card */}
          <div className="bg-white rounded-xl p-8 shadow-soft border border-border-low-alpha flex flex-col md:flex-row items-center justify-between mb-8">
            <div className="w-full md:w-2/3">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <span className="font-headline-md text-headline-md text-primary">{seats.used} of {seats.total} seats used</span>
                  <p className="text-on-surface-variant font-label-md">You have {remainingSeats} {remainingSeats === 1 ? "seat" : "seats"} remaining in your current {seats.plan.toUpperCase()} plan.</p>
                </div>
                <span className="font-data-mono text-data-mono text-primary font-semibold">{usagePercentage}%</span>
              </div>
              <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-1000 ease-out" style={{ width: `${usagePercentage}%` }}></div>
              </div>
            </div>
            <div className="mt-6 md:mt-0">
              <InviteMemberButton
                remainingSeats={remainingSeats}
                plan={seats.plan}
                onSuccess={loadData}
              />
            </div>
          </div>

          {/* Members Table Card */}
          <div className="bg-white rounded-xl shadow-soft border border-border-low-alpha overflow-hidden">
            <div className="px-8 py-6 border-b border-border-low-alpha flex flex-wrap gap-3 justify-between items-center bg-surface-white">
              <h3 className="font-headline-md text-[20px] text-primary">Active Members</h3>
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                  <input value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 pr-4 py-2 bg-bg-secondary border-none rounded-lg text-body-md focus:ring-2 focus:ring-primary/20 w-full sm:w-64 transition-all" placeholder="Search members..." type="text" />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="bg-bg-secondary/50">
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Member</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Role</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Status</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-low-alpha">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-16">
                        <div className="flex flex-col items-center justify-center text-center">
                          <span className="material-symbols-outlined text-on-surface-variant text-[40px] mb-3">person_search</span>
                          <p className="font-body-md text-on-surface-variant">No members match your search.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((m) => {
                      const display = getMemberDisplay(m.email);
                      return (
                        <tr key={m.id} className="hover:bg-bg-secondary/30 transition-colors group">
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-surface-container-highest overflow-hidden flex items-center justify-center text-primary font-headline-md text-[14px]">
                                {display.initials}
                              </div>
                              <div>
                                <p className="font-body-md text-primary font-semibold">{display.name}</p>
                                <p className="font-label-md text-text-muted">{m.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <span className="font-label-md text-label-md text-on-surface-variant">
                              {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                            </span>
                          </td>
                          <td className="px-8 py-5">
                            <span className={`px-3 py-1 rounded-full text-[12px] font-semibold ${m.status === "active" ? "status-pill-active" : "status-pill-invited"} uppercase tracking-tight`}>
                              {m.status}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            {profile?.userId !== m.id && (
                              <button
                                type="button"
                                onClick={() => handleRemove(m.id, m.email)}
                                className="text-on-surface-variant hover:text-error transition-all p-1.5 rounded-lg hover:bg-error/5 active:scale-95 duration-100"
                                title="Remove member"
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-8 py-6 bg-surface-container/30 flex justify-between items-center border-t border-border-low-alpha">
              <p className="font-label-md text-label-md text-on-surface-variant">Showing {filtered.length} of {members.filter(m => m.status !== "removed").length} total members</p>
            </div>
          </div>

          {/* Additional Help/Links */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 border border-border-low-alpha rounded-xl hover:bg-white hover:shadow-soft transition-all group">
              <span className="material-symbols-outlined text-secondary mb-4 group-hover:scale-110 transition-transform">security</span>
              <h4 className="font-headline-md text-[18px] text-primary mb-2">Role Permissions</h4>
              <p className="font-body-md text-on-surface-variant text-[14px]">Understand the different access levels for Admin, Recruiter, and Viewer roles.</p>
              <Link className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="/settings">Read documentation →</Link>
            </div>
            <div className="p-6 border border-border-low-alpha rounded-xl hover:bg-white hover:shadow-soft transition-all group">
              <span className="material-symbols-outlined text-secondary mb-4 group-hover:scale-110 transition-transform">account_balance_wallet</span>
              <h4 className="font-headline-md text-[18px] text-primary mb-2">Billing &amp; Seats</h4>
              <p className="font-body-md text-on-surface-variant text-[14px]">Upgrade your plan or add more seats to your current subscription cycle.</p>
              <Link className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="/billing">Manage billing →</Link>
            </div>
            <div className="p-6 border border-border-low-alpha rounded-xl hover:bg-white hover:shadow-soft transition-all group">
              <span className="material-symbols-outlined text-secondary mb-4 group-hover:scale-110 transition-transform">history_edu</span>
              <h4 className="font-headline-md text-[18px] text-primary mb-2">Activity Audit Log</h4>
              <p className="font-body-md text-on-surface-variant text-[14px]">View a detailed record of all member actions and invitation history.</p>
              <Link className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="/audit">View logs →</Link>
            </div>
          </div>
        </section>

        {/* Footer Component */}
        <footer className="w-full py-12 px-4 sm:px-6 lg:px-12 border-t border-border-low-alpha bg-bg-cream mt-12">
          <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="col-span-1 md:col-span-2">
              <h1 className="text-headline-md font-headline-md text-primary mb-4">TalScout</h1>
              <p className="text-on-surface-variant max-w-sm mb-6">Empowering global recruitment teams with precision intelligence and editorial-grade talent management.</p>
              <p className="font-label-md text-label-md text-outline">© 2026 TalScout AI. All rights reserved.</p>
            </div>
            <div className="flex flex-col space-y-3">
              <p className="font-headline-md text-[16px] text-primary font-semibold mb-2">Product</p>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors font-label-md" href="/privacy">Privacy</Link>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors font-label-md" href="/terms">Terms</Link>
            </div>
            <div className="flex flex-col space-y-3">
              <p className="font-headline-md text-[16px] text-primary font-semibold mb-2">Resources</p>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors font-label-md" href="/cookies">Cookie Policy</Link>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors font-label-md" href="/security">Security</Link>
            </div>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}

