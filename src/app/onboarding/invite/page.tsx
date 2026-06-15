"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function InviteTeamOnboardingPage() {
  const router = useRouter();
  const [invites, setInvites] = useState<{ email: string; role: string }[]>([
    { email: "", role: "recruiter" },
  ]);
  const [seats, setSeats] = useState({ total: 10, used: 1, plan: "growth" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadBilling = async () => {
      try {
        const res = await api.get<{ plan: string; seats: number; seatsUsed: number }>("/api/billing");
        setSeats({ total: res.seats, used: res.seatsUsed, plan: res.plan });
      } catch (err) {
        console.error("Failed to load billing", err);
      }
    };
    loadBilling();
  }, []);

  const handleAddRow = () => {
    if (seats.used + invites.length >= seats.total) {
      toast.error("No more seats available on your current plan.");
      return;
    }
    setInvites([...invites, { email: "", role: "recruiter" }]);
  };

  const handleUpdateInvite = (index: number, field: string, value: string) => {
    const newInvites = [...invites];
    newInvites[index] = { ...newInvites[index], [field]: value };
    setInvites(newInvites);
  };

  const handleSubmit = async () => {
    const validInvites = invites.filter(inv => inv.email.trim() !== "");
    if (validInvites.length === 0) {
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    try {
      await Promise.all(
        validInvites.map(inv => 
          api.post("/api/team", { email: inv.email, role: inv.role.toLowerCase() })
        )
      );
      toast.success("Invites sent successfully!");
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to send invites");
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen flex flex-col font-body-md text-body-md overflow-x-hidden">
      {/* Top Logo Section */}
      <header className="w-full flex justify-center pt-12 pb-8">
        <Link
          href="/"
          className="font-headline-lg text-headline-md text-primary tracking-tight"
        >
          TalScout
        </Link>
      </header>

      <main className="flex-grow flex flex-col items-center px-4 sm:px-6 pb-12 sm:pb-16 lg:pb-24">
        {/* Progress Indicator (Step 3 of 3) */}
        <div className="flex items-center gap-2 mb-12 w-full max-w-[400px]">
          <div className="h-1 flex-1 bg-primary/20 rounded-full"></div>
          <div className="h-1 flex-1 bg-primary/20 rounded-full"></div>
          <div className="h-1.5 flex-1 bg-primary rounded-full"></div>
        </div>

        {/* Central Card Container */}
        <div className="bg-surface-white w-full max-w-[640px] rounded-[16px] shadow-soft p-4 sm:p-6 lg:p-12 flex flex-col items-center text-center">
          {/* Headline & Subtext */}
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">
            Invite your recruiters
          </h1>
          <p className="font-body-md text-body-md text-text-muted mb-10">
            You can always add more later.
          </p>

          {/* Invite Rows */}
          <div className="w-full space-y-4 mb-8">
            {invites.map((inv, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <div className="flex-grow text-left">
                  {idx === 0 && (
                    <label className="font-label-md text-label-md text-on-surface-variant block mb-1.5">
                      Email address
                    </label>
                  )}
                  <input
                    className="w-full px-4 py-3 bg-bg-cream border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none font-body-md"
                    placeholder="name@company.com"
                    type="email"
                    value={inv.email}
                    onChange={(e) => handleUpdateInvite(idx, "email", e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="w-full sm:w-40 text-left">
                  {idx === 0 && (
                    <label className="font-label-md text-label-md text-on-surface-variant block mb-1.5">
                      Role
                    </label>
                  )}
                  <select
                    className="w-full px-4 py-3 bg-bg-cream border border-border-low-alpha rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none font-body-md cursor-pointer"
                    value={inv.role}
                    onChange={(e) => handleUpdateInvite(idx, "role", e.target.value)}
                    disabled={loading}
                  >
                    <option value="admin">Admin</option>
                    <option value="recruiter">Recruiter</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Add Another Button */}
          <button
            type="button"
            onClick={handleAddRow}
            disabled={loading}
            className="flex items-center gap-2 text-primary font-label-md text-label-md hover:opacity-80 transition-opacity mb-8 group disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>Add another</span>
          </button>

          {/* Usage Note */}
          <div className="bg-bg-cream/50 px-4 py-2 rounded-full mb-12">
            <p className="font-label-md text-label-md text-secondary">
              You have{" "}
              <span className="font-data-mono text-secondary-container bg-primary px-1.5 py-0.5 rounded text-white">
                {Math.max(0, seats.total - seats.used - invites.filter(i => i.email).length)} of {seats.total}
              </span>{" "}
              seats remaining on your {seats.plan} plan.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-wrap items-center justify-between gap-3 pt-8 border-t border-border-low-alpha">
            <Link
              href="/dashboard"
              className="px-6 py-3 font-label-md text-label-md text-text-muted hover:text-primary transition-colors"
            >
              Skip for now
            </Link>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-3 bg-primary text-white font-label-md text-label-md rounded-lg hover:shadow-lg active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send invites & finish"}
            </button>
          </div>
        </div>

        {/* Decorative Background Elements (Subtle Brass Gradient) */}
        <div className="fixed -bottom-64 -right-64 w-[600px] h-[600px] bg-secondary-fixed/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="fixed -top-64 -left-64 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
      </main>

      {/* Simple Footer Copyright */}
      <footer className="w-full text-center pb-8">
        <p className="font-label-md text-label-md text-text-muted/60">
          © 2024 TalScout AI. Premium intelligence for human-centric hiring.
        </p>
      </footer>
    </div>
  );
}
