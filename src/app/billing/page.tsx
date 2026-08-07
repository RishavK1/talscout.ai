"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  CreditCard,
  BadgeCheck,
  Calendar,
  ReceiptText,
  UsersRound,
  History,
  Headset,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { TopAppBar } from "@/components/app/top-app-bar";
import { AdminGate } from "@/components/app/admin-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton, CardBodySkeleton, DataTableCardSkeleton } from "@/components/ui/skeletons";
import { Reveal } from "@/components/motion/reveal";
import { BorderBeam } from "@/components/ui/border-beam";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { NumberTicker } from "@/components/ui/number-ticker";


interface BillingInfo {
  plan: string;
  pricePerSeat: number;
  status: string;
  seats: number;
  seatsUsed: number;
  renewsAt: string | null;
  invoices?: { id: string; date: string; amount: string; status: string; plan?: string; seats?: number }[];
}

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: string;
  plan?: string;
  seats?: number;
}

export default function BillingPage() {
  const { profile, loading: authLoading, refreshProfile } = useAuth();
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<{ id: string; date: string; amount: string; status: string; plan?: string; seats?: number }[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [selectedSeats, setSelectedSeats] = useState(1);
  const [updating, setUpdating] = useState(false);

  const PLAN_RANK: Record<string, number> = { starter: 0, growth: 1, scale: 2 };
  const planRank = (p?: string) => (p ? PLAN_RANK[p.toLowerCase()] ?? 0 : 0);

  // The modal seeds selectedPlan/selectedSeats to the CURRENT plan/seats when
  // it opens, so isUpgrade() is false before the user has touched anything —
  // don't show the "must be an upgrade" error until they've actually changed
  // something away from those seeded values.
  const isDirty = billingInfo
    ? selectedPlan !== billingInfo.plan || selectedSeats !== billingInfo.seats
    : false;

  const isUpgrade = () => {
    if (!billingInfo) return false;
    const currentRank = planRank(billingInfo.plan);
    const selectedRank = planRank(selectedPlan);
    if (selectedRank < currentRank) return false;
    if (selectedRank === currentRank) {
      return selectedSeats > billingInfo.seats;
    }
    return true;
  };

  const loadBilling = async () => {
    try {
      setLoading(true);
      const search = typeof window !== "undefined" ? window.location.search : "";
      const res = await api.get<BillingInfo>(`/api/billing${search}`);
      setBillingInfo(res);
      setInvoices(res.invoices || []);

      if (search.includes("session_id=")) {
        await refreshProfile(true);
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load billing details";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role === "admin") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadBilling();
    } else if (profile) {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role]);

  useEffect(() => {
    if (billingInfo && showModal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlan(billingInfo.plan);
      setSelectedSeats(billingInfo.seats);
    }
  }, [billingInfo, showModal]);

  // Invoice list is loaded directly from API in loadBilling effect

  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUpdating(true);
      const res = await api.post<{ url: string }>("/api/billing/checkout", {
        plan: selectedPlan,
        seats: selectedSeats,
      });
      if (res.url) {
        window.location.href = res.url;
      } else {
        toast.error("Checkout session could not be created.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create checkout session";
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  };

  if (authLoading || (loading && profile?.role === "admin")) {
    return (
      <AppShell>
        <main className="pt-8 sm:pt-12 lg:pt-24 px-4 sm:px-6 lg:px-12 pb-12 sm:pb-16 lg:pb-24 max-w-[1440px] mx-auto w-full">
          <PageHeaderSkeleton />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-8 h-full border-2 border-border-low-alpha [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
              <CardContent>
                <CardBodySkeleton lines={3} />
                <Skeleton className="mt-6 h-11 w-40 rounded-lg" />
              </CardContent>
            </Card>
            <Card className="lg:col-span-4 h-full [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
              <CardContent>
                <CardBodySkeleton lines={2} />
              </CardContent>
            </Card>
            <div className="lg:col-span-12 mt-4">
              <DataTableCardSkeleton rows={3} columns={2} withAvatar={false} />
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  if (profile && profile.role !== "admin") {
    return (
      <AdminGate description="Only workspace administrators can view billing information and manage subscription plans." />
    );
  }

  const planDisplayName = billingInfo
    ? billingInfo.plan.charAt(0).toUpperCase() + billingInfo.plan.slice(1)
    : "Starter";

  const totalMonthlyPrice = billingInfo
    ? billingInfo.pricePerSeat * billingInfo.seats
    : 0;

  const formatRenewalDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const filteredInvoices = (() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) =>
      [inv.id, inv.status, inv.plan, inv.date, inv.amount].some((field) =>
        field?.toLowerCase().includes(q),
      ),
    );
  })();

  const invoiceColumns: DataTableColumn<Invoice>[] = [
    {
      key: "date",
      header: "Date",
      render: (inv) => (
        <span className="font-data-mono text-data-mono text-on-surface">{inv.date}</span>
      ),
    },
    {
      key: "id",
      header: "Invoice ID",
      render: (inv) => (
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-label-md text-label-md text-on-surface-variant">{inv.id}</span>
          {inv.plan && (
            <Badge variant="outline" className="rounded-md font-data-mono text-[10px] uppercase bg-surface-container-low text-on-surface-variant border-border-low-alpha">
              {inv.plan} • {inv.seats} {inv.seats === 1 ? "seat" : "seats"}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (inv) => (
        <span className="font-data-mono text-data-mono text-on-surface">{inv.amount}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (inv) => <StatusBadge tone="active">{inv.status}</StatusBadge>,
    },
  ];

  return (
    <AppShell>
      <TopAppBar
        leftContent={
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-on-surface-variant" />
            <input
              className="w-full pl-10 pr-4 py-2 bg-surface-white border border-border-low-alpha rounded-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="Search invoices by ID, status, plan..."
              type="text"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
            />
          </div>
        }
        rightContent={
          <Button asChild variant="gradient" className="whitespace-nowrap">
            <Link href="/upload">+ Upload résumés</Link>
          </Button>
        }
      />

      {/* Main Content Area */}
      <main className="pt-8 sm:pt-12 lg:pt-24 px-4 sm:px-6 lg:px-12 pb-12 sm:pb-16 lg:pb-24 max-w-[1440px] mx-auto w-full">
        {/* Header */}
        <Reveal>
        <header className="mb-10 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary">
            <CreditCard className="size-[24px]" />
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary mb-1">Billing</h1>
            <p className="font-body-md text-body-md text-text-muted">Manage your workspace subscription, payment methods, and billing history.</p>
          </div>
        </header>
        </Reveal>

        {billingInfo && (
          <Reveal delay={0.05} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Section 1: Current Plan */}
            <section className="lg:col-span-8 relative">
              <span className="absolute -top-3 left-8 z-10 inline-flex items-center gap-1.5 rounded-full bg-tertiary-fixed px-3 py-1 font-data-mono text-[11px] font-semibold text-on-tertiary-fixed shadow-sm">
                <BadgeCheck className="size-[14px]" />
                Current plan
              </span>
              <Card className="relative h-full border-2 border-primary-container [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                <BorderBeam size={100} duration={12} />
                <CardContent>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-4">Current Plan</h2>
                      <p className="font-headline-md text-headline-md text-primary mb-1">
                        {planDisplayName} — ${billingInfo.pricePerSeat}/seat/mo
                      </p>
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        <NumberTicker value={billingInfo.seats} /> {billingInfo.seats === 1 ? "seat" : "seats"} · $
                        <NumberTicker value={totalMonthlyPrice} />/mo
                      </p>
                      <p className="font-body-sm text-[12px] text-outline mt-1">
                        <NumberTicker value={billingInfo.seatsUsed} /> {billingInfo.seatsUsed === 1 ? "seat" : "seats"} currently active.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="brass-badge font-label-md text-label-md px-3 py-1 rounded-full uppercase tracking-wider text-[11px] font-semibold">
                        {billingInfo.status}
                      </span>
                    </div>
                  </div>
                  {billingInfo.renewsAt && (
                    <div className="flex items-center gap-2 mb-8 text-on-surface-variant">
                      <Calendar className="size-[20px]" />
                      <span className="font-body-md text-body-md">Next renewal date:</span>
                      <span className="font-data-mono text-data-mono font-medium">
                        {formatRenewalDate(billingInfo.renewsAt)}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <Button type="button" variant="gradient" size="lg" onClick={() => setShowModal(true)}>
                      Manage plan &amp; seats
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 2: Payment Method */}
            <section className="lg:col-span-4">
              <Card className="h-full flex flex-col [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                <CardContent className="flex-1 flex flex-col">
                  <h2 className="font-label-md text-label-md uppercase tracking-wider text-text-muted mb-6">Payment Method</h2>
                  <div className="flex items-center gap-4 mb-auto">
                    <div className="w-14 h-10 bg-secondary-fixed rounded border border-border-low-alpha flex items-center justify-center p-2">
                      <span className="font-label-md text-[12px] font-semibold text-on-secondary-fixed tracking-wide">CARD</span>
                    </div>
                    <div>
                      <p className="font-label-md text-label-md text-on-surface">Stripe Billing Enabled</p>
                      <p className="font-data-mono text-[12px] text-text-muted">Automatic renewal</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 3: Invoices */}
            <section className="lg:col-span-12 mt-4">
              <Card className="overflow-hidden">
                <div className="px-6 py-6 border-b border-border-low-alpha flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
                      <ReceiptText className="size-[18px]" />
                    </div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Invoice History</h2>
                  </div>
                </div>
                <CardContent className="p-0">
                  <DataTable
                    columns={invoiceColumns}
                    rows={filteredInvoices}
                    getRowKey={(inv) => inv.id}
                    emptyState={
                      <span className="font-body-md text-body-md text-text-muted">
                        {invoiceSearch.trim()
                          ? `No invoices match "${invoiceSearch.trim()}".`
                          : "No invoices found. Billed history is generated after checkout."}
                      </span>
                    }
                  />
                </CardContent>
              </Card>
            </section>
          </Reveal>
        )}

        {/* Additional Help/Links — same footer pattern as Team & seats, so
            this page reads as a full destination rather than a sparse
            2-card row sitting alone in a wide canvas. */}
        <Reveal delay={0.1} className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <SpotlightCard className="rounded-xl border border-border-low-alpha bg-surface-white p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10 text-primary mb-4">
              <UsersRound className="size-[20px]" />
            </div>
            <h4 className="text-[18px] font-semibold text-primary mb-2">Team &amp; Seats</h4>
            <p className="font-body-md text-on-surface-variant text-[14px]">Invite recruiters and manage who&apos;s using a seat on your current plan.</p>
            <Link className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="/team">Manage team →</Link>
          </SpotlightCard>
          <SpotlightCard className="rounded-xl border border-border-low-alpha bg-surface-white p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10 text-primary mb-4">
              <History className="size-[20px]" />
            </div>
            <h4 className="text-[18px] font-semibold text-primary mb-2">Billing Activity</h4>
            <p className="font-body-md text-on-surface-variant text-[14px]">Every plan change and checkout is recorded in your workspace&apos;s audit log.</p>
            <Link className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="/audit">View audit log →</Link>
          </SpotlightCard>
          <SpotlightCard className="rounded-xl border border-border-low-alpha bg-surface-white p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10 text-primary mb-4">
              <Headset className="size-[20px]" />
            </div>
            <h4 className="text-[18px] font-semibold text-primary mb-2">Questions about your plan?</h4>
            <p className="font-body-md text-on-surface-variant text-[14px]">Reach out and we&apos;ll help you find the right plan or seat count.</p>
            <a className="mt-4 inline-block font-label-md text-label-md text-secondary font-semibold hover:underline" href="mailto:support@talscout.ai">Contact support →</a>
          </SpotlightCard>
        </Reveal>
      </main>

      {/* Manage Seats / Plan Dialog */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Manage Subscription"
        subtitle="Change your plan or adjust seat counts."
      >
        <form onSubmit={handleUpdateSubscription} className="space-y-6">
          <div>
            <label className="block font-label-md text-primary mb-2">Plan</label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="starter" disabled={planRank("starter") < planRank(billingInfo?.plan)}>
                Starter — $99/seat/mo {planRank("starter") < planRank(billingInfo?.plan) ? "(Downgrade Unavailable)" : ""}
              </option>
              <option value="growth" disabled={planRank("growth") < planRank(billingInfo?.plan)}>
                Growth — $199/seat/mo {planRank("growth") < planRank(billingInfo?.plan) ? "(Downgrade Unavailable)" : ""}
              </option>
              <option value="scale" disabled={planRank("scale") < planRank(billingInfo?.plan)}>
                Scale — $399/seat/mo {planRank("scale") < planRank(billingInfo?.plan) ? "(Downgrade Unavailable)" : ""}
              </option>
            </select>
          </div>
          <div>
            <label className="block font-label-md text-primary mb-2">Number of Seats</label>
            <input
              type="number"
              min={billingInfo?.seatsUsed || 1}
              max={100}
              value={selectedSeats}
              onChange={(e) => setSelectedSeats(parseInt(e.target.value) || 1)}
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-2 text-on-surface-variant font-label-md text-[13px]">
              Must be at least {billingInfo?.seatsUsed || 1} seats (currently active). Current plan has {billingInfo?.seats || 1} seats.
            </p>
          </div>

          {isDirty && !isUpgrade() && (
            <div className="p-3 bg-error/10 text-error rounded-lg font-label-md text-[13px] border border-error/20">
              Selected plan/seat count must be an upgrade from your current {billingInfo?.plan.toUpperCase()} plan ({billingInfo?.seats} seats).
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={updating}>
              Cancel
            </Button>
            <Button type="submit" variant="gradient" disabled={updating || !isUpgrade()}>
              {updating ? "Redirecting..." : "Checkout & Update"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
