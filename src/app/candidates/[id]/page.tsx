"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { TopAppBar } from "@/components/app/top-app-bar";

import { AddToShortlistButton } from "@/components/candidate/add-to-shortlist-button";
import { MessageCandidate } from "@/components/candidate/message-candidate";
import { DownloadPdfButton } from "@/components/candidate/download-pdf-button";
import { EditProfile } from "@/components/candidate/edit-profile";

interface Job {
  company?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  responsibilities?: string[];
  highlights?: string[];
  description?: string;
}

interface Edu {
  institution?: string;
  degree?: string;
  field?: string;
  startYear?: string;
  endYear?: string;
}

interface Project {
  name?: string;
  description?: string;
  technologies?: string[];
}

interface CandidateDetails {
  id: string;
  fullName: string | null;
  emails: string[] | null;
  phones: string[] | null;
  location: string | null;
  currentTitle: string | null;
  yearsExperience: string | null;
  skills: string[] | null;
  languages: string[] | null;
  certifications: string[] | null;
  summary: string | null;
  workHistory: Job[] | any;
  education: Edu[] | any;
  projects: Project[] | any;
  status: "ready" | "processing" | "error";
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function CandidateProfilePage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [candidate, setCandidate] = useState<CandidateDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchCandidate = async () => {
      try {
        const data = await api.get<CandidateDetails>(`/api/candidates/${id}`);
        setCandidate(data);
      } catch (err: any) {
        toast.error(err.message || "Failed to load candidate details");
        router.push("/candidates");
      } finally {
        setLoading(false);
      }
    };
    fetchCandidate();
  }, [id, router]);

  const handleCandidateUpdate = (updated: CandidateDetails) => {
    setCandidate(updated);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/candidates/${id}`);
      toast.success("Candidate deleted successfully");
      router.push("/candidates");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete candidate");
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center bg-bg-cream">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined animate-spin text-primary text-3xl">sync</span>
            <p className="font-body-md text-on-surface-variant">Loading profile details...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!candidate) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center bg-bg-cream">
          <p className="font-body-md text-on-surface-variant">Candidate not found.</p>
        </div>
      </AppShell>
    );
  }

  const name = candidate.fullName || "Unnamed Draft";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "C";

  // Parse rich profile sections (stored as JSON/arrays)
  const jobs = asArray<Job>(candidate.workHistory);
  const education = asArray<Edu>(candidate.education);
  const projects = asArray<Project>(candidate.projects);
  const certifications = candidate.certifications ?? [];
  const languages = candidate.languages ?? [];

  return (
    <AppShell>
      <main className="font-body-md text-body-md bg-bg-cream flex flex-1 flex-col min-h-screen selection:bg-tertiary-fixed selection:text-on-tertiary-fixed">
        <TopAppBar
          leftContent={
            <div className="flex items-center text-on-surface-variant w-full">
              <Link className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-on-surface-variant flex items-center justify-center" href="/candidates">
                <span className="material-symbols-outlined" data-icon="arrow_back">arrow_back</span>
              </Link>
              <div className="h-4 w-px bg-border-low-alpha mx-4"></div>
              <div className="relative flex items-center flex-1 sm:flex-none">
                <span className="material-symbols-outlined absolute left-3 text-on-surface-variant">search</span>
                <input className="pl-10 pr-4 py-2 rounded-full bg-surface-white border border-border-low-alpha focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-64 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 shadow-sm transition-all sm:focus:w-80" placeholder="Search profiles..." type="text" />
              </div>
            </div>
          }
          rightContent={
            <Link href="/upload" className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-[0.98] whitespace-nowrap">
              + Upload résumés
            </Link>
          }
        />

        {/* Breadcrumb */}
        <div className="px-4 sm:px-6 lg:px-12 pt-6 max-w-[1440px] mx-auto w-full">
          <nav className="flex items-center space-x-2 font-label-md text-label-md text-on-surface-variant">
            <Link className="hover:text-primary transition-colors" href="/candidates">Candidates</Link>
            <span className="material-symbols-outlined text-[18px] text-outline">chevron_right</span>
            <span className="text-primary font-semibold truncate max-w-[160px]">{name}</span>
          </nav>
        </div>

        {/* Profile Canvas */}
        <div className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Main Profile (8 cols) */}
          <div className="lg:col-span-8 space-y-8">
            {/* Header Card */}
            <div className="glass-card rounded-xl p-8 flex flex-col md:flex-row gap-8 items-start relative overflow-hidden bg-white border border-border-low-alpha shadow-sm">
              <div className="absolute top-0 right-0 w-64 h-64 bg-tertiary-fixed/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              <div className="w-32 h-32 rounded-full flex items-center justify-center border-4 border-surface-white ambient-shadow z-10 shrink-0 bg-surface-container-high text-primary font-headline-lg text-headline-lg">
                {initials}
              </div>
              <div className="flex-1 z-10">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h2 className="font-headline-lg text-headline-lg text-primary">{name}</h2>
                  <span className="px-2 py-1 bg-tertiary-fixed/30 text-on-tertiary-fixed-variant rounded-md font-label-md text-[12px] flex items-center shadow-sm">
                    <span className="material-symbols-outlined text-[14px] mr-1" data-icon="verified">verified</span> AI Scanned
                  </span>
                </div>
                <p className="font-body-lg text-body-lg text-on-surface-variant mb-4">
                  {candidate.currentTitle || "Title not parsed"}
                </p>
                <div className="flex flex-wrap gap-4 font-label-md text-label-md text-outline">
                  <div className="flex items-center">
                    <span className="material-symbols-outlined text-[18px] mr-1.5" data-icon="location_on">location_on</span>
                    {candidate.location || "Unknown Location"}
                  </div>
                  <div className="flex items-center">
                    <span className="material-symbols-outlined text-[18px] mr-1.5" data-icon="work">work</span>
                    {candidate.yearsExperience ? `${Math.round(parseFloat(candidate.yearsExperience))} Yrs Experience` : "Exp not parsed"}
                  </div>
                  {candidate.emails && candidate.emails.length > 0 && (
                    <div className="flex items-center">
                      <span className="material-symbols-outlined text-[18px] mr-1.5" data-icon="mail">mail</span>
                      {candidate.emails[0]}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="glass-card rounded-xl p-8 bg-white border border-border-low-alpha shadow-sm">
              <h3 className="font-headline-md text-headline-md text-primary mb-4 flex items-center">
                <span className="material-symbols-outlined mr-2 text-tertiary-fixed-dim" data-icon="auto_awesome">auto_awesome</span>
                Executive Summary
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                {candidate.summary || "No profile summary generated yet. The AI is still analyzing this candidate's background."}
              </p>
            </div>

            {/* Experience Timeline */}
            <div className="glass-card rounded-xl p-8 bg-white border border-border-low-alpha shadow-sm">
              <h3 className="font-headline-md text-headline-md text-primary mb-6">Experience</h3>
              {jobs.length === 0 ? (
                <p className="font-body-md text-on-surface-variant">No work history parsed for this candidate.</p>
              ) : (
                <div className="space-y-8 relative">
                  {jobs.map((job, idx) => (
                    <div key={idx} className="timeline-item relative pl-8">
                      <div className="timeline-line absolute left-0 top-0 h-full w-6 flex justify-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-2 border-2 border-surface-white z-10 ${idx === 0 ? "bg-primary ring-2 ring-primary-fixed" : "bg-surface-tint"}`}></div>
                      </div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-label-md text-[16px] text-on-surface font-semibold">{job.title || "Job Title"}</h4>
                          <p className="font-body-md text-[14px] text-outline">{job.company || "Company"}</p>
                        </div>
                        <span className="font-data-mono text-data-mono text-outline">
                          {job.startDate || "?"} - {job.endDate || "Present"}
                        </span>
                      </div>
                      {(() => {
                        const bullets = job.highlights?.length
                          ? job.highlights
                          : job.responsibilities?.length
                            ? job.responsibilities
                            : null;
                        if (bullets) {
                          return (
                            <ul className="list-disc list-inside font-body-md text-[14px] text-on-surface-variant space-y-1.5 ml-1 marker:text-outline-variant">
                              {bullets.map((b, rIdx) => (
                                <li key={rIdx}>{b}</li>
                              ))}
                            </ul>
                          );
                        }
                        if (job.description) {
                          return (
                            <p className="font-body-md text-[14px] text-on-surface-variant">{job.description}</p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Education */}
            {education.length > 0 && (
              <div className="glass-card rounded-xl p-8 bg-white border border-border-low-alpha shadow-sm">
                <h3 className="font-headline-md text-headline-md text-primary mb-6">Education</h3>
                <div className="space-y-5">
                  {education.map((e, i) => (
                    <div key={i} className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="font-label-md text-[16px] text-on-surface font-semibold">{e.degree || e.field || "Qualification"}</h4>
                        <p className="font-body-md text-[14px] text-outline">{[e.institution, e.degree && e.field ? e.field : null].filter(Boolean).join(" · ")}</p>
                      </div>
                      {(e.startYear || e.endYear) && (
                        <span className="font-data-mono text-data-mono text-outline whitespace-nowrap">{[e.startYear, e.endYear].filter(Boolean).join(" - ")}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Projects */}
            {projects.length > 0 && (
              <div className="glass-card rounded-xl p-8 bg-white border border-border-low-alpha shadow-sm">
                <h3 className="font-headline-md text-headline-md text-primary mb-6">Projects</h3>
                <div className="space-y-6">
                  {projects.map((p, i) => (
                    <div key={i}>
                      <h4 className="font-label-md text-[16px] text-on-surface font-semibold">{p.name || "Project"}</h4>
                      {p.description && <p className="font-body-md text-[14px] text-on-surface-variant mt-1 leading-relaxed">{p.description}</p>}
                      {p.technologies && p.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {p.technologies.map((t, ti) => (
                            <span key={ti} className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-data-mono text-[11px]">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Sidebar Actions (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Primary Actions */}
            <div className="glass-card rounded-xl p-6 flex flex-col gap-3 bg-white border border-border-low-alpha shadow-sm">
              <AddToShortlistButton candidateId={candidate.id} name={name} />
              
              <MessageCandidate name={name} email={candidate.emails?.[0] || ""} />
              
              <div className="flex gap-3 pt-2">
                <DownloadPdfButton />
                <EditProfile candidate={candidate} onUpdate={handleCandidateUpdate} />
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 bg-error text-white rounded-lg font-label-md text-label-md hover:bg-error/90 transition-colors shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                Delete Candidate
              </button>
            </div>

            {/* Status & Details */}
            <div className="glass-card rounded-xl p-6 bg-white border border-border-low-alpha shadow-sm">
              <h4 className="font-label-md text-label-md text-outline mb-4 uppercase tracking-wider text-[12px]">Profile Details</h4>
              <div className="space-y-4">
                <div>
                  <span className="block font-label-md text-[12px] text-outline mb-1">Current Status</span>
                  {candidate.status === "ready" ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-tertiary-fixed/30 text-on-tertiary-fixed-variant font-label-md text-[13px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-tertiary mr-2"></div>
                      Parsed
                    </span>
                  ) : candidate.status === "processing" ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-container-high text-on-surface-variant font-label-md text-[13px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-outline-variant mr-2 animate-pulse"></div>
                      Processing
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-error/10 text-error font-label-md text-[13px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-error mr-2"></div>
                      Error
                    </span>
                  )}
                </div>
                <div className="h-px w-full bg-border-low-alpha"></div>
                <div>
                  <span className="block font-label-md text-[12px] text-outline mb-1">Source</span>
                  <span className="font-body-md text-[14px] text-on-surface">PDF Resume Upload</span>
                </div>
                {candidate.phones && candidate.phones.length > 0 && (
                  <>
                    <div className="h-px w-full bg-border-low-alpha"></div>
                    <div>
                      <span className="block font-label-md text-[12px] text-outline mb-1">Phone</span>
                      <span className="font-body-md text-[14px] text-on-surface">{candidate.phones[0]}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Skills */}
            <div className="glass-card rounded-xl p-6 bg-white border border-border-low-alpha shadow-sm">
              <h4 className="font-label-md text-label-md text-outline mb-4 uppercase tracking-wider text-[12px]">Top Skills</h4>
              {candidate.skills && candidate.skills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((skill, sIdx) => (
                    <span
                      key={sIdx}
                      className={`px-3 py-1 rounded-full font-label-md text-[13px] border border-border-low-alpha ${
                        sIdx % 3 === 0
                          ? "bg-tertiary-fixed/20 text-on-tertiary-fixed border-tertiary-fixed/30"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="font-body-md text-on-surface-variant text-sm">No skills listed.</p>
              )}
            </div>

            {/* Certifications */}
            {certifications.length > 0 && (
              <div className="glass-card rounded-xl p-6 bg-white border border-border-low-alpha shadow-sm">
                <h4 className="font-label-md text-label-md text-outline mb-4 uppercase tracking-wider text-[12px]">Certifications</h4>
                <ul className="space-y-2">
                  {certifications.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 font-body-md text-[14px] text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-tertiary-fixed-dim mt-0.5">workspace_premium</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Languages */}
            {languages.length > 0 && (
              <div className="glass-card rounded-xl p-6 bg-white border border-border-low-alpha shadow-sm">
                <h4 className="font-label-md text-label-md text-outline mb-4 uppercase tracking-wider text-[12px]">Languages</h4>
                <div className="flex flex-wrap gap-2">
                  {languages.map((l, i) => (
                    <span key={i} className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-[13px] border border-border-low-alpha">{l}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <Modal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Delete Candidate"
          subtitle={`Are you sure you want to delete ${name}? This action cannot be undone.`}
        >
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary hover:bg-surface-container-low transition-colors cursor-pointer"
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg bg-error text-white px-5 py-2.5 font-label-md transition-colors hover:bg-error/90 active:scale-[0.98] cursor-pointer"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Permanently"}
            </button>
          </div>
        </Modal>
      </main>
    </AppShell>
  );
}
