"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  ChevronRight,
  RefreshCw,
  CircleCheck,
  Target,
  Mic,
  Gavel,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/motion/reveal";

interface BlueprintProofPoint {
  label: string;
  detail?: string;
}
interface BlueprintPersona {
  name: string;
  description?: string;
}
interface BlueprintLeadQualification {
  websiteRequirement: "any" | "no_or_weak_site" | "has_site";
  criteria: string[];
}
interface BlueprintSections {
  whoWeAre: string;
  whatWeOffer: string;
  whoItsFor: string;
  statusQuo?: string;
  differentiator: string;
  painWeSolve: string;
  proof: BlueprintProofPoint[];
  personas: BlueprintPersona[];
  voice: string;
  objections: string[];
  rules: string[];
  leadQualification?: BlueprintLeadQualification;
}

const WEBSITE_REQUIREMENT_LABEL: Record<BlueprintLeadQualification["websiteRequirement"], string> = {
  any: "No restriction — any business matching category/location qualifies",
  no_or_weak_site: "Only businesses WITHOUT a good website qualify",
  has_site: "Only businesses that already HAVE a website qualify",
};

interface Blueprint {
  id: string;
  name: string;
  websiteUrl: string | null;
  status: "draft" | "active" | "archived";
  sections: BlueprintSections | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_TONE: Record<Blueprint["status"], NonNullable<StatusBadgeProps["tone"]>> = {
  draft: "draft",
  active: "active",
  archived: "error",
};

/** One flowing document instead of a grid of separate boxes — the earlier
 *  layout put each topic in its own bordered card, which at four cards read
 *  as a scattered wall of boxes rather than one coherent business profile.
 *  Sections are now visually distinguished by an icon + heading and a
 *  divider, not a box each — a single continuous read, closer to a Notion/
 *  Linear-style profile document than a stats dashboard. */
const TOC: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "positioning", label: "Positioning", icon: Target },
  { id: "voice", label: "Voice & proof", icon: Mic },
  { id: "objections", label: "Objections & rules", icon: Gavel },
  { id: "qualification", label: "Lead qualification", icon: ClipboardCheck },
];

function SectionBlock({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
          <Icon className="size-[16px]" />
        </span>
        <h2 className="font-sans text-[16px] font-semibold text-on-surface">{title}</h2>
      </div>
      <div className="space-y-5 pl-[42px]">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-label-md text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
      <div className="font-body-md text-body-md leading-relaxed text-on-surface">{children}</div>
    </div>
  );
}

export default function BlueprintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get<Blueprint>(`/api/blueprints/${id}`);
      setBlueprint(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load blueprint");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await api.post<Blueprint>(`/api/blueprints/${id}/generate`);
      setBlueprint(res);
      toast.success("Blueprint regenerated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!blueprint) return;
    setArchiving(true);
    try {
      const nextStatus = blueprint.status === "archived" ? "active" : "archived";
      const res = await api.patch<Blueprint>(`/api/blueprints/${id}`, { status: nextStatus });
      setBlueprint(res);
      toast.success(nextStatus === "archived" ? "Blueprint archived" : "Blueprint restored");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/blueprints/${id}`);
      toast.success("Blueprint deleted");
      router.push("/blueprints");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete blueprint");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-screen flex flex-col">
          <TopAppBar
            leftContent={
              <div className="flex items-center gap-2 text-text-muted font-label-md">
                <Link href="/blueprints" className="hover:text-primary transition-colors">
                  Blueprints
                </Link>
              </div>
            }
          />
          <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1000px] mx-auto w-full">
            <Card className="mb-10 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-7 w-56" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-11 w-28 rounded-lg" />
                  <Skeleton className="h-11 w-24 rounded-lg" />
                  <Skeleton className="h-11 w-20 rounded-lg" />
                </div>
              </CardContent>
            </Card>
            <div className="lg:grid lg:grid-cols-[180px_1fr] lg:gap-12">
              <div className="hidden lg:block space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-7 w-full rounded-lg" />
                ))}
              </div>
              <div className="max-w-2xl space-y-10">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i}>
                    <div className="mb-5 flex items-center gap-2.5">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-5 w-40" />
                    </div>
                    <div className="space-y-3 pl-[42px]">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3.5 w-5/6" />
                      <Skeleton className="h-3.5 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </AppShell>
    );
  }

  if (!blueprint) {
    return (
      <AppShell>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <p className="font-body-md text-text-muted">Blueprint not found.</p>
          <Link href="/blueprints" className="text-primary font-label-md hover:underline">
            Back to Blueprints
          </Link>
        </div>
      </AppShell>
    );
  }

  const s = blueprint.sections;

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <Link href="/blueprints" className="hover:text-primary transition-colors">
                Blueprints
              </Link>
              <ChevronRight className="size-[14px]" />
              <span className="text-on-surface font-medium truncate max-w-[200px]">
                {blueprint.name}
              </span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1000px] mx-auto w-full">
          <Reveal>
          <Card className="mb-10 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="font-headline-lg text-headline-lg text-primary">{blueprint.name}</h1>
                  <StatusBadge tone={STATUS_TONE[blueprint.status]} className="capitalize">
                    {blueprint.status}
                  </StatusBadge>
                </div>
                {blueprint.websiteUrl && (
                  <a
                    href={blueprint.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-body-md text-body-md text-primary hover:underline"
                  >
                    {blueprint.websiteUrl}
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="text-primary"
                >
                  <RefreshCw className={cn("size-[18px]", regenerating && "animate-spin")} />
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleToggleArchive}
                  disabled={archiving}
                >
                  {blueprint.status === "archived" ? "Restore" : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
          </Reveal>

          {!s ? (
            <Reveal delay={0.05}>
            <Card className="border border-border-low-alpha bg-surface-white text-center [--card-spacing:--spacing(8)]">
              <CardContent>
                <FileText className="mx-auto size-[32px] text-outline" />
                <p className="mt-3 font-body-md text-body-md text-text-muted">
                  No sections generated yet.
                </p>
                <Button
                  type="button"
                  variant="gradient"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="mt-4 justify-center"
                >
                  Generate now
                </Button>
              </CardContent>
            </Card>
            </Reveal>
          ) : (
            <Reveal delay={0.05} className="lg:grid lg:grid-cols-[180px_1fr] lg:gap-12">
              {/* In-page nav — desktop only. Plain anchor links (no scroll-spy
                  JS) into `scroll-smooth` sections below; keeps four topics
                  reachable at a glance instead of scrolling past walls of text. */}
              <nav className="hidden lg:block">
                <div className="sticky top-24 space-y-0.5">
                  <p className="mb-2 font-label-md text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    On this page
                  </p>
                  {TOC.map((t) => (
                    <a
                      key={t.id}
                      href={`#${t.id}`}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-body-md text-[13px] text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                    >
                      <t.icon className="size-[14px] shrink-0" />
                      {t.label}
                    </a>
                  ))}
                </div>
              </nav>

              <div className="min-w-0 max-w-2xl space-y-10">
                <SectionBlock id="positioning" title="Positioning" icon={Target}>
                  <Field label="Who we are">{s.whoWeAre}</Field>
                  <Field label="What we offer">{s.whatWeOffer}</Field>
                  <Field label="Who it's for">{s.whoItsFor}</Field>
                  <Field label="Differentiator">{s.differentiator}</Field>
                  {s.statusQuo && <Field label="Status quo">{s.statusQuo}</Field>}
                  <Field label="Pain we solve">{s.painWeSolve}</Field>
                </SectionBlock>

                <div className="border-t border-border-low-alpha" />

                <SectionBlock id="voice" title="Voice & proof" icon={Mic}>
                  <Field label="Voice">{s.voice}</Field>
                  <Field label="Proof points">
                    <ul className="space-y-1">
                      {s.proof.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <CircleCheck className="mt-0.5 size-[16px] shrink-0 text-tertiary" />
                          <span>
                            {p.label}
                            {p.detail && <span className="text-text-muted"> — {p.detail}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Field>
                  <Field label="Personas">
                    <ul className="space-y-1">
                      {s.personas.map((p, i) => (
                        <li key={i}>
                          <span className="font-semibold">{p.name}</span>
                          {p.description && <span className="text-text-muted"> — {p.description}</span>}
                        </li>
                      ))}
                    </ul>
                  </Field>
                </SectionBlock>

                <div className="border-t border-border-low-alpha" />

                <SectionBlock id="objections" title="Objections & rules" icon={Gavel}>
                  <Field label="Objections to preempt">
                    <ul className="list-disc list-inside space-y-1">
                      {s.objections.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </Field>
                  <Field label="Rules for outreach copy">
                    <ul className="list-disc list-inside space-y-1">
                      {s.rules.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </Field>
                </SectionBlock>

                <div className="border-t border-border-low-alpha" />

                <SectionBlock id="qualification" title="Lead qualification" icon={ClipboardCheck}>
                  <p className="font-body-md text-body-md leading-relaxed text-on-surface">
                    {WEBSITE_REQUIREMENT_LABEL[s.leadQualification?.websiteRequirement ?? "any"]}
                  </p>
                  {!!s.leadQualification?.criteria.length && (
                    <ul className="mt-2 list-disc list-inside space-y-1 font-body-md text-body-md text-on-surface">
                      {s.leadQualification.criteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 font-label-md text-label-md text-on-surface-variant">
                    Campaigns using this blueprint skip leads that don&apos;t match this profile — see a
                    disqualified lead&apos;s reason on its campaign&apos;s lead list.
                  </p>
                </SectionBlock>
              </div>
            </Reveal>
          )}
        </main>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete blueprint"
        description="Delete this blueprint? This can't be undone."
        confirmLabel="Delete"
        destructive
      />
    </AppShell>
  );
}
