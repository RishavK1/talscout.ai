"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { InviteMemberButton } from "@/components/team/invite-member-button";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { TopAppBar } from "@/components/app/top-app-bar";
import { AdminGate } from "@/components/app/admin-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton, DataTableCardSkeleton } from "@/components/ui/skeletons";


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
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

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

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await api.delete(`/api/team/${removeTarget.id}`);
      toast.success("Member removed successfully");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      toast.error(msg);
    } finally {
      setRemoveTarget(null);
    }
  };

  if (authLoading || (loading && profile?.role === "admin")) {
    return (
      <AppShell>
        <main className="min-h-screen">
          <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 py-12">
            <PageHeaderSkeleton />
            <Card className="flex flex-col md:flex-row items-center justify-between mb-8">
              <CardContent className="flex w-full flex-col md:flex-row items-center justify-between">
                <div className="w-full md:w-2/3 space-y-3">
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                <Skeleton className="mt-6 md:mt-0 h-11 w-40 rounded-lg" />
              </CardContent>
            </Card>
            <DataTableCardSkeleton rows={4} columns={2} />
          </section>
        </main>
      </AppShell>
    );
  }

  if (profile && profile.role !== "admin") {
    return (
      <AdminGate description="Only workspace administrators can manage team members, access level roles, and billing seats." />
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

  const memberColumns: DataTableColumn<Member>[] = [
    {
      key: "member",
      header: "Member",
      render: (m) => {
        const display = getMemberDisplay(m.email);
        return (
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-surface-container-highest overflow-hidden flex items-center justify-center text-primary font-headline-md text-[14px]">
              {display.initials}
            </div>
            <div>
              <p className="font-body-md text-primary font-semibold">{display.name}</p>
              <p className="font-label-md text-text-muted">{m.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "role",
      header: "Role",
      render: (m) => (
        <StatusBadge tone="brass" dot={false} className="uppercase tracking-tight">
          {m.role}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (m) => (
        <StatusBadge tone={m.status === "active" ? "active" : "invited"} className="uppercase tracking-tight">
          {m.status}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (m) =>
        profile?.userId !== m.id ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setRemoveTarget(m)}
            className="text-on-surface-variant hover:text-error hover:bg-error/5"
            title="Remove member"
          >
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </Button>
        ) : null,
    },
  ];

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
            <Button asChild variant="gradient" className="whitespace-nowrap">
              <Link href="/upload">+ Upload résumés</Link>
            </Button>
          }
        />

        {/* Main Content */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 py-12">
          {/* Page Heading — same Card-wrapped header pattern as Blueprints/
              Candidates/Billing, instead of a bare unwrapped div. */}
          <Card className="mb-8 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
            <CardContent className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container">
                <span className="material-symbols-outlined text-[24px]">groups</span>
              </div>
              <div>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-1">Team &amp; seats</h1>
                <p className="font-body-lg text-body-lg text-text-muted max-w-2xl">Manage your organizational structure, invite recruitment partners, and control access levels across the TalScout platform.</p>
              </div>
            </CardContent>
          </Card>

          {/* Seats Usage Card */}
          <Card className="flex flex-col md:flex-row items-center justify-between mb-8">
            <CardContent className="flex w-full flex-col md:flex-row items-center justify-between">
              <div className="w-full md:w-2/3">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <span className="font-headline-md text-headline-md text-primary">{seats.used} of {seats.total} seats used</span>
                    <p className="text-on-surface-variant font-label-md">You have {remainingSeats} {remainingSeats === 1 ? "seat" : "seats"} remaining in your current {seats.plan.toUpperCase()} plan.</p>
                  </div>
                  <span className="font-data-mono text-data-mono text-primary font-semibold">{usagePercentage}%</span>
                </div>
                <Progress
                  value={usagePercentage}
                  className="h-2"
                  indicatorClassName="bg-primary-container"
                />
              </div>
              <div className="mt-6 md:mt-0">
                <InviteMemberButton
                  remainingSeats={remainingSeats}
                  plan={seats.plan}
                  onSuccess={loadData}
                />
              </div>
            </CardContent>
          </Card>

          {/* Members Table Card */}
          <Card className="overflow-hidden">
            <div className="px-6 py-6 border-b border-border-low-alpha flex flex-wrap gap-3 justify-between items-center">
              <h3 className="font-headline-md text-[20px] text-primary">Active Members</h3>
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                  <input value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 pr-4 py-2 bg-bg-secondary border-none rounded-lg text-body-md focus:ring-2 focus:ring-primary/20 w-full sm:w-64 transition-all" placeholder="Search members..." type="text" />
                </div>
              </div>
            </div>
            <CardContent className="p-0">
              <DataTable
                columns={memberColumns}
                rows={filtered}
                getRowKey={(m) => m.id}
                emptyState={
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed mb-3">
                      <span className="material-symbols-outlined text-[28px]">person_search</span>
                    </div>
                    <p className="font-body-md text-on-surface-variant">No members match your search.</p>
                  </div>
                }
              />
            </CardContent>
            <div className="px-6 py-6 bg-surface-container/30 flex justify-between items-center border-t border-border-low-alpha">
              <p className="font-label-md text-label-md text-on-surface-variant">Showing {filtered.length} of {members.filter(m => m.status !== "removed").length} total members</p>
            </div>
          </Card>

          {/* Additional Help/Links */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-border-low-alpha bg-surface-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container mb-4">
                <span className="material-symbols-outlined text-[20px]">security</span>
              </div>
              <h4 className="text-[18px] font-semibold text-primary mb-2">Role Permissions</h4>
              <p className="font-body-md text-on-surface-variant text-[14px]">Understand the different access levels for Admin, Recruiter, and Viewer roles.</p>
              <Link className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="/settings">Read documentation →</Link>
            </div>
            <div className="rounded-xl border border-border-low-alpha bg-surface-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container mb-4">
                <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
              </div>
              <h4 className="text-[18px] font-semibold text-primary mb-2">Billing &amp; Seats</h4>
              <p className="font-body-md text-on-surface-variant text-[14px]">Upgrade your plan or add more seats to your current subscription cycle.</p>
              <Link className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="/billing">Manage billing →</Link>
            </div>
            <div className="rounded-xl border border-border-low-alpha bg-surface-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container mb-4">
                <span className="material-symbols-outlined text-[20px]">history_edu</span>
              </div>
              <h4 className="text-[18px] font-semibold text-primary mb-2">Activity Audit Log</h4>
              <p className="font-body-md text-on-surface-variant text-[14px]">View a detailed record of all member actions and invitation history.</p>
              <Link className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="/audit">View logs →</Link>
            </div>
          </div>
        </section>
      </main>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove member"
        description={removeTarget ? `Are you sure you want to remove ${removeTarget.email} from the workspace?` : undefined}
        confirmLabel="Remove"
        destructive
      />
    </AppShell>
  );
}
