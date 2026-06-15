"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/app/app-shell";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";

interface Shortlist {
  id: string;
  name: string;
  createdAt: string;
  candidateCount: number;
  lastUpdated: string | null;
}

export default function ShortlistsPage() {
  const { user, profile } = useAuth();
  const [shortlists, setShortlists] = useState<Shortlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newShortlistName, setNewShortlistName] = useState("");
  const [creating, setCreating] = useState(false);

  const avatarUrl = profile?.avatar;

  const userInitials = user?.user_metadata?.full_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "JD";

  const loadShortlists = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ shortlists: Shortlist[] }>("/api/shortlists");
      setShortlists(res.shortlists);
    } catch (err: any) {
      toast.error(err.message || "Failed to load shortlists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShortlists();
  }, []);

  const handleOpenModal = () => {
    setNewShortlistName("");
    setIsModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortlistName.trim()) return;
    try {
      setCreating(true);
      await api.post("/api/shortlists", { name: newShortlistName.trim() });
      toast.success("Shortlist created successfully");
      setNewShortlistName("");
      setIsModalOpen(false);
      loadShortlists();
    } catch (err: any) {
      toast.error(err.message || "Failed to create shortlist");
    } finally {
      setCreating(false);
    }
  };

  const filtered = shortlists.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <AppShell>
      {/* Main Content Area */}
      <main className="min-h-screen flex flex-col">
        {/* TopAppBar Shell */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md flex flex-wrap justify-between items-center gap-3 px-4 sm:px-6 lg:px-12 py-4 border-b border-border-low-alpha">
          <div className="flex items-center gap-2 text-text-muted font-label-md">
            <span>Shortlists</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-on-surface font-medium">All Shortlists</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <div className="relative group w-full sm:w-auto">
              <input value={search} onChange={e => setSearch(e.target.value)} className="bg-surface-container-low border-none rounded-full px-10 py-2 w-full sm:w-64 text-label-md focus:ring-1 focus:ring-primary transition-all" placeholder="Search shortlists..." type="text" />
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline text-[20px]">search</span>
            </div>
            <Link href="/upload" className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-label-md hover:opacity-90 transition-all active:scale-95">
              <span className="material-symbols-outlined text-sm">upload</span>
              + Upload résumés
            </Link>
            <div className="flex items-center gap-3 pl-4 border-l border-border-low-alpha">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-border-low-alpha bg-surface-container-highest flex items-center justify-center text-primary font-headline-md">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  userInitials
                )}
              </div>
            </div>
          </div>
        </header>
        {/* Main Body */}
        <div className="p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full flex-1">
          {/* Page Header Section */}
          <section className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-12">
            <div className="space-y-2">
              <h2 className="font-headline-lg text-headline-lg text-on-surface">Shortlists</h2>
              <p className="text-text-muted font-body-md max-w-lg">Manage your curated candidate pools and AI-driven talent matches for ongoing hiring campaigns.</p>
            </div>
            <button type="button" onClick={handleOpenModal} className="bg-primary text-white px-6 py-3 rounded-xl font-label-md hover:shadow-lg transition-all duration-300 flex items-center gap-2">
              <span className="material-symbols-outlined">add_circle</span>
              + New shortlist
            </button>
          </section>
          {/* Bento/Grid Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Create New Shortlist Card */}
            <div onClick={handleOpenModal} className="group border-2 border-dashed border-border-low-alpha rounded-[20px] p-8 flex flex-col items-center justify-center text-center space-y-4 cursor-pointer hover:border-primary/30 hover:bg-white/50 transition-all duration-300 min-h-[280px]">
              <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined text-primary text-[32px]">add</span>
              </div>
              <div>
                <h4 className="font-headline-md text-[18px] text-on-surface">Create New Shortlist</h4>
                <p className="text-text-muted font-label-md mt-1">Start a fresh talent pool for a new role</p>
              </div>
            </div>
            
            {/* Dynamic Shortlist Cards */}
            {loading ? (
              <div className="flex items-center justify-center col-span-1 md:col-span-2 lg:col-span-3 min-h-[200px] text-text-muted font-body-md">
                Loading shortlists...
              </div>
            ) : filtered.map(s => (
              <Link key={s.id} href="/candidates" className="bg-white rounded-[20px] p-8 soft-shadow border border-border-low-alpha group hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="font-headline-md text-[20px] text-on-surface leading-snug">{s.name}</h3>
                    <span className="text-text-muted group-hover:text-on-surface transition-colors">
                      <span className="material-symbols-outlined">more_vert</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-8">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary-container/20 text-on-secondary-container">General</span>
                    <span className="text-text-muted font-label-md">• {s.candidateCount} candidates</span>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="flex justify-between items-center pt-4 border-t border-border-low-alpha">
                    <span className="font-data-mono text-[12px] text-text-muted">
                      Last updated: {s.lastUpdated ? new Date(s.lastUpdated).toLocaleDateString() : "Never"}
                    </span>
                    <span className="material-symbols-outlined text-primary text-[20px] opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
        {/* Footer Shell */}
        <footer className="w-full py-12 px-4 sm:px-6 lg:px-12 border-t border-border-low-alpha bg-bg-cream/50 mt-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-[1440px] mx-auto">
            <div className="col-span-1 space-y-4">
              <Link href="/" className="text-headline-md font-headline-md text-primary">TalScout</Link>
              <p className="text-text-muted font-body-md pr-8">Precision intelligence for the modern recruiter.</p>
            </div>
            <div className="flex flex-col space-y-3">
              <span className="font-label-md text-primary mb-2">Product</span>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors" href="/#features">Candidate Search</Link>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors" href="/#features">Semantic Matching</Link>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors" href="/#features">Team Collaboration</Link>
            </div>
            <div className="flex flex-col space-y-3">
              <span className="font-label-md text-primary mb-2">Support</span>
              <a className="text-on-surface-variant hover:text-secondary transition-colors" href="mailto:support@talscout.ai">Help Center</a>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors" href="/privacy">Privacy</Link>
              <Link className="text-on-surface-variant hover:text-secondary transition-colors" href="/terms">Terms</Link>
            </div>
            <div className="flex flex-col space-y-4">
              <span className="font-label-md text-primary mb-2">Stay Updated</span>
              <div className="flex gap-2">
                <input className="bg-white border border-border-low-alpha rounded-lg px-4 py-2 text-label-md w-full focus:ring-1 focus:ring-primary" placeholder="Your email" type="text" />
                <button type="button" className="bg-primary text-white p-2 px-4 rounded-lg">
                  <span className="material-symbols-outlined text-sm">send</span>
                </button>
              </div>
            </div>
          </div>
          <div className="max-w-[1440px] mx-auto pt-12 text-center text-text-muted font-label-md">
            © 2024 TalScout AI. All rights reserved.
          </div>
        </footer>
      </main>

      {/* Create Shortlist Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => !creating && setIsModalOpen(false)}
        title="Create New Shortlist"
        subtitle="Organize your candidates into dedicated pools for specific roles."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-6">
          <div>
            <label htmlFor="shortlistName" className="block font-label-md text-primary mb-2">Shortlist Name</label>
            <input
              id="shortlistName"
              type="text"
              required
              disabled={creating}
              autoFocus
              value={newShortlistName}
              onChange={(e) => setNewShortlistName(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer - Q3"
              className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={creating}
              className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !newShortlistName.trim()}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] flex items-center gap-2 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Shortlist"}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
