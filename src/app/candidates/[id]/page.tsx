"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Search,
  ChevronRight,
  BadgeCheck,
  PenLine,
  MapPin,
  Briefcase,
  Mail,
  Sparkles,
  Trash2,
  Award,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TopAppBar } from "@/components/app/top-app-bar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardBodySkeleton } from "@/components/ui/skeletons";
import { Reveal } from "@/components/motion/reveal";

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
  hasResume?: boolean;
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

  // Parsing runs in a background job (Inngest), so a candidate opened right
  // after upload can still be "processing". Poll until it lands on a terminal
  // status instead of leaving the page stuck on a stale snapshot forever.
  useEffect(() => {
    if (!id || candidate?.status !== "processing") return;
    const interval = setInterval(async () => {
      try {
        const data = await api.get<CandidateDetails>(`/api/candidates/${id}`);
        setCandidate(data);
      } catch {
        // transient poll failure — next tick retries
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [id, candidate?.status]);

  const handleDelete = async () => {
    try {
      await api.delete(`/api/candidates/${id}`);
      toast.success("Candidate deleted successfully");
      router.push("/candidates");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete candidate");
      setDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="bg-bg-cream flex flex-1 flex-col min-h-screen">
          <TopAppBar
            leftContent={
              <div className="flex items-center text-on-surface-variant w-full">
                <Link className="p-2 rounded-full text-on-surface-variant flex items-center justify-center" href="/candidates">
                  <ArrowLeft className="size-[20px]" />
                </Link>
              </div>
            }
          />
          <div className="relative flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-6">
              <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                <CardContent className="flex flex-col md:flex-row gap-8 items-start">
                  <Skeleton className="h-32 w-32 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-36" />
                    <div className="flex gap-4">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="[--card-spacing:--spacing(6)]">
                <CardContent>
                  <CardBodySkeleton lines={4} />
                </CardContent>
              </Card>
              <Card className="[--card-spacing:--spacing(6)]">
                <CardContent>
                  <CardBodySkeleton lines={3} />
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-4 space-y-6">
              <Card className="[--card-spacing:--spacing(6)]">
                <CardContent>
                  <CardBodySkeleton lines={3} />
                </CardContent>
              </Card>
              <Card className="[--card-spacing:--spacing(6)]">
                <CardContent>
                  <CardBodySkeleton lines={2} />
                </CardContent>
              </Card>
            </div>
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
                <ArrowLeft className="size-[20px]" />
              </Link>
              <div className="h-4 w-px bg-border-low-alpha mx-4"></div>
              <form
                className="relative flex items-center flex-1 sm:flex-none"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = new FormData(e.currentTarget).get("q");
                  if (typeof q === "string" && q.trim()) {
                    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
                  }
                }}
              >
                <Search className="absolute left-3 size-[18px] text-on-surface-variant" />
                <input
                  name="q"
                  className="pl-10 pr-4 py-2 rounded-full bg-surface-white border border-border-low-alpha focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-64 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 shadow-sm transition-all sm:focus:w-80"
                  placeholder="Search profiles..."
                  type="text"
                />
              </form>
            </div>
          }
          rightContent={
            <Button asChild variant="gradient" className="whitespace-nowrap">
              <Link href="/upload">+ Upload résumés</Link>
            </Button>
          }
        />

        {/* Breadcrumb */}
        <div className="px-4 sm:px-6 lg:px-12 pt-6 max-w-[1440px] mx-auto w-full">
          <nav className="flex items-center space-x-2 font-label-md text-label-md text-on-surface-variant">
            <Link className="hover:text-primary transition-colors" href="/candidates">Candidates</Link>
            <ChevronRight className="size-[18px] text-outline" />
            <span className="text-primary font-semibold truncate max-w-[160px]">{name}</span>
          </nav>
        </div>

        {/* Profile Canvas */}
        <div className="relative flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Main Profile (8 cols) */}
          <Reveal className="lg:col-span-8 space-y-6">
            {/* Header Card */}
            <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
              <CardContent className="flex flex-col md:flex-row gap-8 items-start">
                <div className="w-32 h-32 rounded-full flex items-center justify-center border-4 border-surface-white shrink-0 bg-primary-container text-on-primary font-headline-lg text-headline-lg">
                  {initials}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h2 className="font-headline-lg text-headline-lg text-primary">{name}</h2>
                    {candidate.hasResume && candidate.status === "ready" ? (
                      <StatusBadge tone="brass" dot={false} className="gap-1">
                        <BadgeCheck className="size-[14px]" /> AI Scanned
                      </StatusBadge>
                    ) : !candidate.hasResume ? (
                      <StatusBadge tone="neutral" dot={false} className="gap-1">
                        <PenLine className="size-[14px]" /> Manual Entry
                      </StatusBadge>
                    ) : null}
                  </div>
                  <p className="font-body-lg text-body-lg text-on-surface-variant mb-4">
                    {candidate.currentTitle || "Title not parsed"}
                  </p>
                  <div className="flex flex-wrap gap-4 font-label-md text-label-md text-outline">
                    <div className="flex items-center">
                      <MapPin className="size-[18px] mr-1.5" />
                      {candidate.location || "Unknown Location"}
                    </div>
                    <div className="flex items-center">
                      <Briefcase className="size-[18px] mr-1.5" />
                      {candidate.yearsExperience ? `${Math.round(parseFloat(candidate.yearsExperience))} Yrs Experience` : "Exp not parsed"}
                    </div>
                    {candidate.emails && candidate.emails.length > 0 && (
                      <div className="flex items-center">
                        <Mail className="size-[18px] mr-1.5" />
                        {candidate.emails[0]}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Summary */}
            <Card className="[--card-spacing:--spacing(6)]">
              <CardHeader>
                <CardTitle className="font-body-md font-semibold text-headline-md text-primary flex items-center">
                  <Sparkles className="size-[18px] mr-2 text-tertiary-fixed-dim" />
                  Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                  {candidate.summary || "No profile summary generated yet. The AI is still analyzing this candidate's background."}
                </p>
              </CardContent>
            </Card>

            {/* Experience Timeline */}
            <Card className="[--card-spacing:--spacing(6)]">
              <CardHeader>
                <CardTitle className="font-body-md font-semibold text-headline-md text-primary">Experience</CardTitle>
              </CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <p className="font-body-md text-on-surface-variant">No work history parsed for this candidate.</p>
                ) : (
                  <div className="space-y-8 relative">
                    {jobs.map((job, idx) => (
                      <div key={idx} className="timeline-item relative pl-8">
                        <div className="timeline-line absolute left-0 top-0 h-full w-6 flex justify-center">
                          <div className={`w-2.5 h-2.5 rounded-full mt-2 border-2 border-surface-white z-10 ${idx === 0 ? "bg-primary ring-2 ring-primary-fixed" : "bg-surface-tint"}`}></div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-2">
                          <div>
                            <h4 className="font-label-md text-[16px] text-on-surface font-semibold">{job.title || "Job Title"}</h4>
                            <p className="font-body-md text-[14px] text-outline">{job.company || "Company"}</p>
                          </div>
                          <span className="font-data-mono text-data-mono text-outline whitespace-nowrap">
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
              </CardContent>
            </Card>

            {/* Education */}
            {education.length > 0 && (
              <Card className="[--card-spacing:--spacing(6)]">
                <CardHeader>
                  <CardTitle className="font-body-md font-semibold text-headline-md text-primary">Education</CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            )}

            {/* Projects */}
            {projects.length > 0 && (
              <Card className="[--card-spacing:--spacing(6)]">
                <CardHeader>
                  <CardTitle className="font-body-md font-semibold text-headline-md text-primary">Projects</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {projects.map((p, i) => (
                      <div key={i}>
                        <h4 className="font-label-md text-[16px] text-on-surface font-semibold">{p.name || "Project"}</h4>
                        {p.description && <p className="font-body-md text-[14px] text-on-surface-variant mt-1 leading-relaxed">{p.description}</p>}
                        {p.technologies && p.technologies.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {p.technologies.map((t, ti) => (
                              <Badge key={ti} variant="outline" className="rounded-full bg-surface-container-high text-on-surface-variant font-data-mono text-[11px]">{t}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </Reveal>

          {/* Right Column: Sidebar Actions (4 cols) */}
          <Reveal delay={0.05} className="lg:col-span-4 space-y-6">
            {/* Primary Actions */}
            <Card className="[--card-spacing:--spacing(6)]">
              <CardContent className="flex flex-col gap-3">
                <AddToShortlistButton candidateId={candidate.id} name={name} />

                <MessageCandidate candidateId={candidate.id} name={name} email={candidate.emails?.[0] || ""} />

                <div className="flex gap-3 pt-2">
                  {candidate.hasResume && <DownloadPdfButton candidateId={candidate.id} />}
                  <EditProfile candidate={candidate} onUpdate={handleCandidateUpdate} />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteModalOpen(true)}
                  className="w-full mt-2 justify-center py-3"
                >
                  <Trash2 className="size-[16px]" />
                  Delete Candidate
                </Button>
              </CardContent>
            </Card>

            {/* Status & Details */}
            <Card className="[--card-spacing:--spacing(6)]">
              <CardHeader>
                <CardTitle className="font-label-md text-label-md text-outline uppercase tracking-wider text-[12px]">Profile Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <span className="block font-label-md text-[12px] text-outline mb-1">Current Status</span>
                    {candidate.status === "ready" ? (
                      <StatusBadge tone="active">Parsed</StatusBadge>
                    ) : candidate.status === "processing" ? (
                      <StatusBadge tone="invited">Processing</StatusBadge>
                    ) : (
                      <StatusBadge tone="error">Error</StatusBadge>
                    )}
                  </div>
                  <div className="h-px w-full bg-border-low-alpha"></div>
                  <div>
                    <span className="block font-label-md text-[12px] text-outline mb-1">Source</span>
                    <span className="font-body-md text-[14px] text-on-surface">
                      {candidate.hasResume ? "Résumé upload" : "Manual entry"}
                    </span>
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
              </CardContent>
            </Card>

            {/* Skills */}
            <Card className="[--card-spacing:--spacing(6)]">
              <CardHeader>
                <CardTitle className="font-label-md text-label-md text-outline uppercase tracking-wider text-[12px]">Top Skills</CardTitle>
              </CardHeader>
              <CardContent>
                {candidate.skills && candidate.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {candidate.skills.map((skill, sIdx) => (
                      <Badge
                        key={sIdx}
                        variant="outline"
                        className={`rounded-full text-[13px] ${
                          sIdx % 3 === 0
                            ? "bg-tertiary-fixed/20 text-on-tertiary-fixed border-tertiary-fixed/30"
                            : "bg-surface-container-high text-on-surface-variant"
                        }`}
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="font-body-md text-on-surface-variant text-sm">No skills listed.</p>
                )}
              </CardContent>
            </Card>

            {/* Certifications */}
            {certifications.length > 0 && (
              <Card className="[--card-spacing:--spacing(6)]">
                <CardHeader>
                  <CardTitle className="font-label-md text-label-md text-outline uppercase tracking-wider text-[12px]">Certifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {certifications.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 font-body-md text-[14px] text-on-surface">
                        <Award className="size-[16px] text-tertiary-fixed-dim mt-0.5" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Languages */}
            {languages.length > 0 && (
              <Card className="[--card-spacing:--spacing(6)]">
                <CardHeader>
                  <CardTitle className="font-label-md text-label-md text-outline uppercase tracking-wider text-[12px]">Languages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {languages.map((l, i) => (
                      <Badge key={i} variant="outline" className="rounded-full bg-surface-container-high text-on-surface-variant text-[13px]">{l}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </Reveal>
        </div>

        <ConfirmDialog
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Delete candidate"
          description={`Are you sure you want to delete ${name}? This action cannot be undone.`}
          confirmLabel="Delete permanently"
          destructive
        />
      </main>
    </AppShell>
  );
}
