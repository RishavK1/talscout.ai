"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ApiCandidate {
  id: string;
  fullName: string | null;
  emails: string[] | null;
  currentTitle: string | null;
  location: string | null;
  yearsExperience: string | null;
  skills: string[] | null;
  status: "ready" | "processing" | "error";
  addedAt: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  title: string;
  location: string;
  expLabel: string;
  skills: string[];
  status: "Ready" | "Processing" | "Error";
  initials: string;
}

const SKILL_PLAIN =
  "px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-border-low-alpha font-label-md text-[12px]";
const SKILL_SECONDARY =
  "px-2 py-0.5 rounded bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30 font-label-md text-[12px]";
const SKILL_TERTIARY =
  "px-2 py-0.5 rounded bg-tertiary-fixed/40 text-on-tertiary-fixed-variant border border-tertiary-fixed font-label-md text-[12px]";

function getSkillBadgeClass(index: number) {
  if (index % 3 === 0) return SKILL_SECONDARY;
  if (index % 3 === 1) return SKILL_TERTIARY;
  return SKILL_PLAIN;
}

export default function ShortlistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [shortlistName, setShortlistName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ shortlist: { id: string; name: string }; candidates: ApiCandidate[] }>(
        `/api/shortlists/${id}/items`
      );
      setShortlistName(res.shortlist.name);
      setCandidates(
        res.candidates.map((item): Candidate => {
          const name = item.fullName || "Unnamed Candidate";
          const initials =
            name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "C";
          return {
            id: item.id,
            name,
            email: (item.emails && item.emails[0]) || "no-email@example.com",
            title: item.currentTitle || "Unnamed Role",
            location: item.location || "Unknown",
            expLabel: item.yearsExperience ? String(Math.round(parseFloat(item.yearsExperience))).padStart(2, "0") : "00",
            skills: item.skills || [],
            status: item.status === "ready" ? "Ready" : item.status === "processing" ? "Processing" : "Error",
            initials,
          };
        })
      );
    } catch (err: any) {
      if (err.status === 404) {
        setNotFound(true);
      } else {
        toast.error(err.message || "Failed to load shortlist");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleRemove = async (candidateId: string, name: string) => {
    setRemovingId(candidateId);
    try {
      await api.delete(`/api/shortlists/${id}/items?candidateId=${candidateId}`);
      toast.success(`Removed ${name} from shortlist`);
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    } catch (err: any) {
      toast.error(err.message || "Failed to remove candidate");
    } finally {
      setRemovingId(null);
    }
  };

  if (notFound) {
    return (
      <AppShell>
        <main className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-aurora-soft p-12 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-tertiary-fixed/15 blur-3xl" />
          <span className="material-symbols-outlined relative z-10 text-[48px] text-on-surface-variant">search_off</span>
          <h1 className="relative z-10 font-headline-lg text-headline-lg text-primary">Shortlist not found</h1>
          <p className="relative z-10 font-body-md text-on-surface-variant">It may have been deleted, or you may not have access to it.</p>
          <Link href="/shortlists" className="relative z-10 rounded-lg bg-gradient-to-br from-primary-container to-primary px-5 py-2.5 font-label-md text-on-primary shadow-floating transition-all hover:-translate-y-0.5 active:scale-[0.97]">
            Back to Shortlists
          </Link>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TopAppBar
        leftContent={
          <div className="flex items-center gap-2 text-text-muted font-label-md">
            <Link href="/shortlists" className="hover:text-primary transition-colors">Shortlists</Link>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-on-surface font-medium">{shortlistName || "..."}</span>
          </div>
        }
        rightContent={
          <Link href="/upload" className="bg-gradient-to-br from-primary-container to-primary text-on-primary px-5 py-2.5 rounded-lg font-label-md text-label-md shadow-floating transition-all hover:-translate-y-0.5 active:scale-[0.97] whitespace-nowrap">
            + Upload résumés
          </Link>
        }
      />
      <main className="mx-auto max-w-[1160px] p-4 sm:p-6 lg:p-12 min-h-screen">
        <div className="relative overflow-hidden rounded-2xl bg-aurora-soft mb-8 p-4 sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-tertiary-fixed/15 blur-3xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-container to-primary text-on-primary shadow-sm shrink-0">
                <span className="material-symbols-outlined text-[22px]">bookmark</span>
              </div>
              <div>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-1">{shortlistName || "Shortlist"}</h1>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {loading ? "Loading..." : `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} in this shortlist.`}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card overflow-hidden overflow-x-auto rounded-xl">
          {loading ? (
            <div className="flex items-center justify-center py-24 font-body-md text-on-surface-variant">
              <span className="material-symbols-outlined mr-2 animate-spin">sync</span> Loading shortlist...
            </div>
          ) : candidates.length === 0 ? (
            <div className="relative overflow-hidden flex flex-col items-center justify-center gap-3 py-24 text-center bg-aurora-soft">
              <div className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-tertiary-fixed/20 blur-3xl" />
              <span className="material-symbols-outlined relative z-10 text-[40px] text-on-surface-variant">group_off</span>
              <p className="relative z-10 font-body-md text-on-surface-variant">No candidates in this shortlist yet.</p>
              <Link href="/candidates" className="relative z-10 font-label-md text-primary hover:underline">
                Browse candidates to add some →
              </Link>
            </div>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-low-alpha bg-bg-cream/50">
                  <th className="py-4 pl-6 pr-3 font-label-md text-label-md text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Candidate</th>
                  <th className="py-4 px-3 font-label-md text-label-md text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Title</th>
                  <th className="py-4 px-3 font-label-md text-label-md text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Location</th>
                  <th className="py-4 px-3 font-label-md text-label-md text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Top Skills</th>
                  <th className="py-4 px-3 font-label-md text-label-md text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Status</th>
                  <th className="py-4 pl-3 pr-6 font-label-md text-label-md text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-low-alpha">
                {candidates.map((c) => (
                  <tr key={c.id} className="group cursor-pointer transition-colors hover:bg-bg-cream/30" onClick={() => router.push(`/candidates/${c.id}`)}>
                    <td className="py-4 pl-6 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-container to-primary font-headline-md text-on-primary shadow-sm">
                          {c.initials}
                        </div>
                        <div>
                          <div className="font-label-md text-label-md font-semibold text-primary transition-colors group-hover:text-tertiary-container">{c.name}</div>
                          <div className="font-body-md text-[13px] text-on-surface-variant">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-3 font-body-md text-[14px] text-on-surface">{c.title}</td>
                    <td className="py-4 px-3 font-body-md text-[14px] text-on-surface-variant">{c.location}</td>
                    <td className="py-4 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {c.skills.slice(0, 3).map((skill, i) => (
                          <span key={skill} className={getSkillBadgeClass(i)}>{skill}</span>
                        ))}
                        {c.skills.length > 3 && <span className={SKILL_PLAIN}>+{c.skills.length - 3}</span>}
                      </div>
                    </td>
                    <td className="py-4 px-3">
                      {c.status === "Ready" ? (
                        <span className="status-pill-active inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md text-[12px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-tertiary-fixed-dim" /> Ready
                        </span>
                      ) : c.status === "Processing" ? (
                        <span className="status-pill-invited inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md text-[12px]">
                          <span className="material-symbols-outlined animate-spin text-[14px]">sync</span> AI Processing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-error/10 px-2.5 py-1 font-label-md text-[12px] text-error">
                          <span className="h-1.5 w-1.5 rounded-full bg-error" /> Error
                        </span>
                      )}
                    </td>
                    <td className="py-4 pl-3 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={removingId === c.id}
                        onClick={() => handleRemove(c.id, c.name)}
                        className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                        aria-label={`Remove ${c.name} from shortlist`}
                        title="Remove from shortlist"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {removingId === c.id ? "sync" : "close"}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </AppShell>
  );
}
