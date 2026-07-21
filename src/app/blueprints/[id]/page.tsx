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

interface BlueprintProofPoint {
  label: string;
  detail?: string;
}
interface BlueprintPersona {
  name: string;
  description?: string;
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
}

interface Blueprint {
  id: string;
  name: string;
  websiteUrl: string | null;
  status: "draft" | "active" | "archived";
  sections: BlueprintSections | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<Blueprint["status"], string> = {
  draft: "brass-badge",
  active: "status-pill-active",
  archived: "bg-error/10 text-error",
};

// Purely decorative icon-chip variety so the section grid reads with the
// same colorful mix as the landing page's feature bento — keyed by the
// existing `icon` prop, no new props introduced.
const SECTION_ICON_STYLES: Record<string, string> = {
  badge: "bg-gradient-to-br from-primary-container to-primary text-on-primary",
  sell: "bg-tertiary-fixed text-on-tertiary-fixed",
  group: "bg-secondary-fixed text-on-secondary-fixed",
  star: "bg-gradient-to-br from-primary-container to-primary text-on-primary",
  history: "bg-surface-container-high text-on-surface-variant",
  healing: "bg-tertiary-fixed text-on-tertiary-fixed",
  record_voice_over: "bg-secondary-fixed text-on-secondary-fixed",
  verified: "bg-gradient-to-br from-primary-container to-primary text-on-primary",
  person_search: "bg-tertiary-fixed text-on-tertiary-fixed",
  quiz: "bg-secondary-fixed text-on-secondary-fixed",
  gavel: "bg-gradient-to-br from-primary-container to-primary text-on-primary",
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
    <SpotlightCard className="glass-card rounded-[20px] p-6">
      <div className="mb-3 flex items-center gap-2.5">
        <div
          className={cn(
            "rounded-lg p-1.5 shadow-sm",
            SECTION_ICON_STYLES[icon] ?? "bg-primary/10 text-primary",
          )}
        >
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </div>
        <h3 className="font-headline-md text-[16px] text-primary">{title}</h3>
      </div>
      {children}
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
          <section className="relative flex flex-col gap-4 overflow-hidden rounded-[24px] bg-aurora-soft p-6 mb-8 sm:flex-row sm:items-start sm:justify-between sm:p-8">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-tertiary-fixed/15 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="font-headline-lg text-headline-lg text-primary">{blueprint.name}</h1>
                <span
                  className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-full font-label-md text-[12px] capitalize shadow-sm",
                    STATUS_STYLES[blueprint.status],
                  )}
                >
                  {blueprint.status}
                </span>
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
            <div className="relative flex flex-wrap items-center gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="rounded-lg border border-border-low-alpha bg-surface-white/70 px-4 py-2 font-label-md text-label-md text-primary backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0"
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
              </button>
              <button
                type="button"
                onClick={handleToggleArchive}
                disabled={archiving}
                className="rounded-lg border border-border-low-alpha bg-surface-white/70 px-4 py-2 font-label-md text-label-md text-on-surface-variant backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {blueprint.status === "archived" ? "Restore" : "Archive"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg border border-error/30 bg-surface-white/70 px-4 py-2 font-label-md text-label-md text-error backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-error/5"
              >
                Delete
              </button>
            </div>
          </section>

          {!s ? (
            <div className="glass-card rounded-[20px] p-8 text-center">
              <span className="material-symbols-outlined text-outline text-[32px]">description</span>
              <p className="mt-3 font-body-md text-body-md text-text-muted">
                No sections generated yet.
              </p>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="mt-4 rounded-lg bg-gradient-to-br from-primary-container to-primary px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-floating transition-all hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-50 disabled:hover:translate-y-0"
              >
                Generate now
              </button>
            </div>
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
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
