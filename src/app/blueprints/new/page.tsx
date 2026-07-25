"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";

interface SuggestedField {
  field: string;
  question: string;
  options: string[];
  multi: boolean;
}

interface Suggestions {
  businessName?: string;
  fields: SuggestedField[];
  /** AI-drafted first-person description of the business, from the same
   *  research pass — seeds the freeform box so it never starts blank. */
  draftContext?: string;
}

type Answers = Record<string, string | string[]>;

const STEPS = ["Business", "Confirm details", "Review"] as const;

export default function NewBlueprintPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [researching, setResearching] = useState(false);

  // Step 2
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [additionalContext, setAdditionalContext] = useState("");
  /** True once research pre-filled the box, so the UI can say so and offer a reset. */
  const [contextWasDrafted, setContextWasDrafted] = useState(false);

  // Step 3
  const [generating, setGenerating] = useState(false);
  // Set once the draft row exists — reused on retry so a failed /generate
  // call never causes a second /api/blueprints POST with the same name
  // (which would 409 "already exists" and mask the real error).
  const [draftBlueprintId, setDraftBlueprintId] = useState<string | null>(null);

  const toggleOption = (field: SuggestedField, option: string) => {
    setAnswers((prev) => {
      if (field.multi) {
        const current = Array.isArray(prev[field.field]) ? (prev[field.field] as string[]) : [];
        const next = current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option];
        return { ...prev, [field.field]: next };
      }
      return { ...prev, [field.field]: option };
    });
  };

  const isSelected = (field: SuggestedField, option: string) => {
    const v = answers[field.field];
    return field.multi ? Array.isArray(v) && v.includes(option) : v === option;
  };

  const addCustomOption = (field: SuggestedField) => {
    const value = (customInputs[field.field] || "").trim();
    if (!value) return;
    setAnswers((prev) => {
      if (field.multi) {
        const current = Array.isArray(prev[field.field]) ? (prev[field.field] as string[]) : [];
        if (current.includes(value)) return prev;
        return { ...prev, [field.field]: [...current, value] };
      }
      return { ...prev, [field.field]: value };
    });
    setCustomInputs((prev) => ({ ...prev, [field.field]: "" }));
  };

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !websiteUrl.trim()) return;
    setResearching(true);
    try {
      const res = await api.post<Suggestions>("/api/blueprints/suggest", {
        name: name.trim(),
        websiteUrl: websiteUrl.trim(),
      });
      setSuggestions(res);
      // Pre-select the first option for single-select fields so the wizard
      // starts pre-filled — the user edits/overrides rather than starting blank.
      setAnswers(
        Object.fromEntries(
          res.fields.map((f) => [f.field, f.multi ? [] : f.options[0] ?? ""]),
        ),
      );
      // Seed the freeform box from the same research pass. Only when the user
      // hasn't already written something — re-running research must never wipe
      // their own words. `draftContext` is best-effort and absent when the site
      // was too thin to describe honestly, in which case the box stays empty.
      if (res.draftContext) {
        setAdditionalContext((prev) => (prev.trim() ? prev : res.draftContext!.slice(0, 2000)));
        setContextWasDrafted(true);
      }
      setStep(1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to research website");
    } finally {
      setResearching(false);
    }
  };

  const handleConfirmAnswers = async () => {
    setGenerating(true);
    try {
      const id =
        draftBlueprintId ??
        (
          await api.post<{ id: string }>("/api/blueprints", {
            name: name.trim(),
            websiteUrl: websiteUrl.trim(),
          })
        ).id;
      setDraftBlueprintId(id);
      await api.post(`/api/blueprints/${id}/generate`, {
        intakeAnswers: {
          businessName: suggestions?.businessName || name.trim(),
          websiteUrl: websiteUrl.trim(),
          answers: additionalContext.trim()
            ? { ...answers, additionalContext: additionalContext.trim() }
            : answers,
        },
      });
      toast.success("Blueprint generated");
      setStep(2);
      router.push(`/blueprints/${id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Blueprint generation failed — this is usually a brief hiccup with the AI provider. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <span>Blueprints</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
              <span className="text-on-surface font-medium">New</span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1100px] mx-auto w-full">
          <Stepper steps={STEPS} currentStep={step} />

          {step === 0 && (
            <Card className="border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
              <CardContent>
                <div className="mb-2 flex items-center gap-3">
                  <div className="rounded-xl bg-primary-container/10 p-2 text-primary-container">
                    <span className="material-symbols-outlined">storefront</span>
                  </div>
                  <h2 className="font-sans font-semibold text-headline-md text-primary">
                    Tell us about your business
                  </h2>
                </div>
                <p className="font-body-md text-body-md text-text-muted mb-8">
                  We&apos;ll read your website and suggest answers you can confirm or edit
                  — no blank page.
                </p>
                <form onSubmit={handleResearch} className="space-y-6">
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">
                      Business / offer name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoFocus
                      placeholder="e.g. Acme Scheduling"
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">
                      Website link
                    </label>
                    <input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      required
                      placeholder="https://yourcompany.com"
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      variant="gradient"
                      size="lg"
                      disabled={researching || !name.trim() || !websiteUrl.trim()}
                      className="w-full justify-center sm:w-auto"
                    >
                      {researching ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                          Researching your site...
                        </>
                      ) : (
                        <>
                          Continue
                          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {step === 1 && suggestions && (
            <div className="space-y-6">
              <Card className="border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)]">
                <CardContent>
                  <p className="font-body-md text-body-md text-text-muted">
                    Here&apos;s what we found for{" "}
                    <span className="text-on-surface font-semibold">
                      {suggestions.businessName || name}
                    </span>
                    . Pick the options that fit best, or add your own.
                  </p>
                </CardContent>
              </Card>

              {/* Freeform context — the single highest-leverage input in this
                  wizard: fed to the AI ahead of the multiple-choice answers
                  (see gemini.blueprint.ts's GENERATE_SYSTEM_PROMPT), so it
                  drives the blueprint's proof/objections/positioning AND,
                  critically, leadQualification.criteria — the gate that
                  decides which discovered businesses are worth emailing. */}
              <Card className="border-2 border-primary-container/30 bg-primary-container/[0.03] [--card-spacing:--spacing(6)]">
                <CardContent>
                  <div className="mb-3 flex items-center gap-2.5">
                    <div className="rounded-lg bg-primary-container/10 p-1.5 text-primary-container">
                      <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                    </div>
                    <h3 className="font-sans font-semibold text-[16px] text-on-surface">
                      Tell us everything about your business
                    </h3>
                  </div>
                  <p className="mb-3 font-body-md text-[13px] text-text-muted">
                    This is what your AI actually learns from — the more specific, the
                    better it gets at finding the right leads and writing emails that
                    sound like you. Mention exact industries/regions to target or avoid,
                    deal-breakers, pricing, real results, phrases you&apos;d never use —
                    anything a new salesperson would need to know on day one.
                  </p>
                  <textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value.slice(0, 2000))}
                    rows={6}
                    maxLength={2000}
                    placeholder="e.g. We only want independent local dentists, not chains or DSOs. Our best customers are 2-8 person practices that just moved offices. Never call us a 'marketing agency' — we're a 'growth partner'. We don't work with anyone under a 12-month commitment..."
                    className="w-full rounded-xl border border-border-low-alpha bg-white px-4 py-3 font-body-md text-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline resize-y"
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    {contextWasDrafted ? (
                      <p className="flex items-center gap-1.5 font-label-md text-[11px] text-primary">
                        <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                        Drafted from your website — edit or replace it so it sounds like you.
                      </p>
                    ) : (
                      <span />
                    )}
                    <p className="shrink-0 font-label-md text-[11px] text-text-muted">
                      {additionalContext.length}/2000
                    </p>
                  </div>
                </CardContent>
              </Card>

              {suggestions.fields.map((field) => (
                <Card key={field.field} className="border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)]">
                  <CardContent>
                    <h3 className="font-sans font-semibold text-[16px] text-on-surface mb-4">
                      {field.question}
                      {field.multi && (
                        <span className="ml-2 font-label-md text-[12px] text-text-muted">
                          (select any that apply)
                        </span>
                      )}
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {field.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleOption(field, option)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 font-label-md text-label-md transition-colors",
                            isSelected(field, option)
                              ? "border-transparent bg-primary-container text-on-primary"
                              : "brass-badge border-transparent",
                          )}
                        >
                          {isSelected(field, option) && (
                            <span className="material-symbols-outlined text-[16px]">check</span>
                          )}
                          {option}
                        </button>
                      ))}
                      {/* Custom values the user has added, if not already a suggested option */}
                      {(Array.isArray(answers[field.field])
                        ? (answers[field.field] as string[])
                        : answers[field.field]
                          ? [answers[field.field] as string]
                          : []
                      )
                        .filter((v) => !field.options.includes(v))
                        .map((custom) => (
                          <button
                            key={custom}
                            type="button"
                            onClick={() => toggleOption(field, custom)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-primary-container px-4 py-2 font-label-md text-label-md text-on-primary"
                          >
                            <span className="material-symbols-outlined text-[16px]">check</span>
                            {custom}
                          </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={customInputs[field.field] || ""}
                        onChange={(e) =>
                          setCustomInputs((prev) => ({ ...prev, [field.field]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomOption(field);
                          }
                        }}
                        placeholder="Write your own answer..."
                        className="flex-1 rounded-lg border border-border-low-alpha bg-bg-cream/30 px-3 py-2 font-body-md text-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addCustomOption(field)}
                        className="border-border-low-alpha text-primary"
                      >
                        Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setStep(0)}
                  className="text-primary"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="gradient"
                  size="lg"
                  onClick={handleConfirmAnswers}
                  disabled={generating}
                  className="w-full justify-center sm:w-auto"
                >
                  {generating ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                      Generating blueprint...
                    </>
                  ) : (
                    <>
                      Generate blueprint
                      <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <Card className="border border-border-low-alpha bg-surface-white text-center [--card-spacing:--spacing(8)]">
              <CardContent>
                <span className="material-symbols-outlined text-primary text-[40px] animate-spin">sync</span>
                <p className="mt-4 font-body-md text-body-md text-text-muted">
                  Taking you to your new blueprint...
                </p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </AppShell>
  );
}
