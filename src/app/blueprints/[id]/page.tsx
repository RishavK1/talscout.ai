"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { SpotlightCard } from "@/components/marketing/spotlight-card";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";

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

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <SpotlightCard>
      <Card className="border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 font-sans font-semibold text-[16px] text-primary">
            <span className="flex items-center justify-center rounded-lg bg-primary-container/10 p-1.5 text-primary-container">
              <span className="material-symbols-outlined text-[18px]">{icon}</span>
            </span>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </SpotlightCard>
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
    if (!confirm("Delete this blueprint? This can't be undone.")) return;
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
        <div className="min-h-screen flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-primary text-[32px]">sync</span>
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
              <span className="material-symbols-outlined text-sm">chevron_right</span>
              <span className="text-on-surface font-medium truncate max-w-[200px]">
                {blueprint.name}
              </span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1000px] mx-auto w-full">
          <Card className="mb-8 border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
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
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="text-primary"
                >
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px]",
                      regenerating && "animate-spin",
                    )}
                  >
                    sync
                  </span>
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleToggleArchive}
                  disabled={archiving}
                >
                  {blueprint.status === "archived" ? "Restore" : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          {!s ? (
            <Card className="border border-border-low-alpha bg-surface-white text-center [--card-spacing:--spacing(8)]">
              <CardContent>
                <span className="material-symbols-outlined text-outline text-[32px]">description</span>
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Section title="Who we are" icon="badge">
                <p className="font-body-md text-body-md text-on-surface">{s.whoWeAre}</p>
              </Section>
              <Section title="What we offer" icon="sell">
                <p className="font-body-md text-body-md text-on-surface">{s.whatWeOffer}</p>
              </Section>
              <Section title="Who it's for" icon="group">
                <p className="font-body-md text-body-md text-on-surface">{s.whoItsFor}</p>
              </Section>
              <Section title="Differentiator" icon="star">
                <p className="font-body-md text-body-md text-on-surface">{s.differentiator}</p>
              </Section>
              {s.statusQuo && (
                <Section title="Status quo" icon="history">
                  <p className="font-body-md text-body-md text-on-surface">{s.statusQuo}</p>
                </Section>
              )}
              <Section title="Pain we solve" icon="healing">
                <p className="font-body-md text-body-md text-on-surface">{s.painWeSolve}</p>
              </Section>
              <Section title="Voice" icon="record_voice_over">
                <p className="font-body-md text-body-md text-on-surface">{s.voice}</p>
              </Section>
              <Section title="Proof points" icon="verified">
                <ul className="space-y-1">
                  {s.proof.map((p, i) => (
                    <li key={i} className="font-body-md text-body-md text-on-surface flex gap-2">
                      <span className="material-symbols-outlined text-tertiary-container text-[16px] mt-0.5">
                        check_circle
                      </span>
                      <span>
                        {p.label}
                        {p.detail && <span className="text-text-muted"> — {p.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Personas" icon="person_search">
                <ul className="space-y-1">
                  {s.personas.map((p, i) => (
                    <li key={i} className="font-body-md text-body-md text-on-surface">
                      <span className="font-semibold">{p.name}</span>
                      {p.description && <span className="text-text-muted"> — {p.description}</span>}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Objections to preempt" icon="quiz">
                <ul className="list-disc list-inside space-y-1">
                  {s.objections.map((o, i) => (
                    <li key={i} className="font-body-md text-body-md text-on-surface">
                      {o}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Rules for outreach copy" icon="gavel">
                <ul className="list-disc list-inside space-y-1">
                  {s.rules.map((r, i) => (
                    <li key={i} className="font-body-md text-body-md text-on-surface">
                      {r}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Lead qualification" icon="fact_check">
                <p className="font-body-md text-body-md text-on-surface">
                  {WEBSITE_REQUIREMENT_LABEL[s.leadQualification?.websiteRequirement ?? "any"]}
                </p>
                {!!s.leadQualification?.criteria.length && (
                  <ul className="mt-2 list-disc list-inside space-y-1">
                    {s.leadQualification.criteria.map((c, i) => (
                      <li key={i} className="font-body-md text-body-md text-on-surface">
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 font-label-md text-label-md text-on-surface-variant">
                  Campaigns using this blueprint skip leads that don&apos;t match this profile — see a
                  disqualified lead&apos;s reason on its campaign&apos;s lead list.
                </p>
              </Section>
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
