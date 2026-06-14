"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { InviteMemberButton } from "@/components/team/invite-member-button";

type Member = {
  id: number;
  name: string;
  email: string;
  initials: string;
  role: "Admin" | "Recruiter" | "Viewer";
  status: "Active" | "Invited";
  lastActive: string;
  lastActiveNever: boolean;
};

const MEMBERS: Member[] = [
  { id: 1, name: "Sarah Jenkins", email: "sarah.j@acmecorp.com", initials: "SJ", role: "Admin", status: "Active", lastActive: "24 Oct 2024 · 09:12", lastActiveNever: false },
  { id: 2, name: "Michael Chen", email: "m.chen@acmecorp.com", initials: "MC", role: "Recruiter", status: "Active", lastActive: "23 Oct 2024 · 16:45", lastActiveNever: false },
  { id: 3, name: "Elena Rodriguez", email: "elena.rod@acmecorp.com", initials: "ER", role: "Recruiter", status: "Invited", lastActive: "Never", lastActiveNever: true },
  { id: 4, name: "David Park", email: "dpark@acmecorp.com", initials: "DP", role: "Viewer", status: "Active", lastActive: "22 Oct 2024 · 11:20", lastActiveNever: false },
  { id: 5, name: "Sophie Miller", email: "s.miller@acmecorp.com", initials: "SM", role: "Recruiter", status: "Active", lastActive: "21 Oct 2024 · 14:02", lastActiveNever: false },
  { id: 6, name: "Jameson Thorne", email: "j.thorne@acmecorp.com", initials: "JT", role: "Viewer", status: "Invited", lastActive: "Never", lastActiveNever: true },
];

export default function TeamSeatsPage() {
  const [q, setQ] = useState("");

  const filtered = MEMBERS.filter((m) => {
    const query = q.trim().toLowerCase();
    return query === "" || `${m.name} ${m.email}`.toLowerCase().includes(query);
  });

  return (
    <AppShell>
      {/* Content Area */}
      <main className="min-h-screen">
        {/* TopAppBar Component */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md flex flex-wrap gap-3 justify-between items-center px-4 sm:px-6 lg:px-12 py-4 border-b border-border-low-alpha">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="font-label-md text-label-md cursor-pointer hover:text-primary transition-colors">Settings</span>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="font-label-md text-label-md text-primary font-semibold">Team &amp; seats</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <button type="button" className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-all">
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button type="button" className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-all">
                <span className="material-symbols-outlined">history</span>
              </button>
            </div>
            <div className="h-8 w-[1px] bg-border-low-alpha"></div>
            <Link href="/upload" className="px-4 py-2 bg-primary text-white rounded-lg font-label-md text-label-md flex items-center gap-2 hover:opacity-90 transition-all active:scale-95">
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              + Upload résumés
            </Link>
          </div>
        </header>

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
                  <span className="font-headline-md text-headline-md text-primary">7 of 10 seats used</span>
                  <p className="text-on-surface-variant font-label-md">You have 3 seats remaining in your current Professional plan.</p>
                </div>
                <span className="font-data-mono text-data-mono text-primary font-semibold">70%</span>
              </div>
              <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-1000 ease-out" style={{ width: "70%" }}></div>
              </div>
            </div>
            <div className="mt-6 md:mt-0">
              <InviteMemberButton />
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
                <button type="button" className="p-2 border border-border-low-alpha rounded-lg hover:bg-bg-secondary transition-colors">
                  <span className="material-symbols-outlined">filter_list</span>
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="bg-bg-secondary/50">
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Member</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Role</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Status</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Last active</th>
                    <th className="px-8 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-low-alpha">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-16">
                        <div className="flex flex-col items-center justify-center text-center">
                          <span className="material-symbols-outlined text-on-surface-variant text-[40px] mb-3">person_search</span>
                          <p className="font-body-md text-on-surface-variant">No members match your search.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((m) => (
                      <tr key={m.id} className="hover:bg-bg-secondary/30 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-surface-container-highest overflow-hidden flex items-center justify-center text-primary font-headline-md text-[14px]">{m.initials}</div>
                            <div>
                              <p className="font-body-md text-primary font-semibold">{m.name}</p>
                              <p className="font-label-md text-text-muted">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <select defaultValue={m.role} className="bg-transparent border-none font-label-md text-label-md text-on-surface-variant focus:ring-0 cursor-pointer hover:text-primary transition-colors p-0">
                            <option>Admin</option>
                            <option>Recruiter</option>
                            <option>Viewer</option>
                          </select>
                        </td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-full text-[12px] font-semibold ${m.status === "Active" ? "status-pill-active" : "status-pill-invited"} uppercase tracking-tight`}>{m.status}</span>
                        </td>
                        <td className="px-8 py-5">
                          {m.lastActiveNever ? (
                            <span className="font-data-mono text-data-mono text-text-muted italic">{m.lastActive}</span>
                          ) : (
                            <span className="font-data-mono text-data-mono text-on-surface-variant">{m.lastActive}</span>
                          )}
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button type="button" className="text-on-surface-variant hover:text-primary transition-colors">
                            <span className="material-symbols-outlined">more_horiz</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-8 py-6 bg-surface-container/30 flex justify-between items-center border-t border-border-low-alpha">
              <p className="font-label-md text-label-md text-on-surface-variant">Showing {filtered.length} of 7 total members</p>
              <div className="flex items-center gap-2">
                <button type="button" className="p-2 border border-border-low-alpha rounded-lg hover:bg-bg-secondary disabled:opacity-30" disabled>
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <button type="button" className="px-3 py-1 bg-primary text-white rounded-lg font-label-md text-label-md">1</button>
                <button type="button" className="p-2 border border-border-low-alpha rounded-lg hover:bg-bg-secondary transition-colors">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
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
              <p className="font-label-md text-label-md text-outline">© 2024 TalScout AI. All rights reserved.</p>
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
