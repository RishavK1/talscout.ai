"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SuggestedField {
  field: string;
  question: string;
  options: string[];
  multi: boolean;
}

interface Suggestions {
  businessName?: string;
  fields: SuggestedField[];
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

  // Step 3
  const [generating, setGenerating] = useState(false);

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
      const created = await api.post<{ id: string }>("/api/blueprints", {
        name: name.trim(),
        websiteUrl: websiteUrl.trim(),
      });
      await api.post(`/api/blueprints/${created.id}/generate`, {
        intakeAnswers: {
          businessName: suggestions?.businessName || name.trim(),
          websiteUrl: websiteUrl.trim(),
          answers,
        },
      });
      toast.success("Blueprint generated");
      setStep(2);
      router.push(`/blueprints/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate blueprint");
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
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[900px] mx-auto w-full">
          {/* Step indicator: completed steps get a check, the connector line
              fills as you progress; labels collapse on small screens. */}
          <div className="mb-10 flex items-center">
            {STEPS.map((label, i) => (
              <div key={label} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-label-md text-label-md transition-colors",
                      i < step
                        ? "bg-tertiary-fixed text-on-tertiary-fixed"
                        : i === step
                          ? "bg-primary text-white shadow-sm"
                          : "bg-surface-container text-on-surface-variant",
                    )}
                  >
                    {i < step ? (
                      <span className="material-symbols-outlined text-[18px]">check</span>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      "font-label-md text-label-md whitespace-nowrap",
                      i === step ? "text-on-surface font-semibold" : "hidden text-text-muted sm:inline",
                    )}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-3 h-px flex-1 rounded-full sm:mx-4",
                      i < step ? "bg-tertiary-container/40" : "bg-border-low-alpha",
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="bg-white rounded-[20px] p-6 sm:p-8 ambient-shadow border border-border-low-alpha">
              <div className="mb-2 flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  <span className="material-symbols-outlined">storefront</span>
                </div>
                <h2 className="font-headline-md text-headline-md text-primary">
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
                  <button
                    type="submit"
                    disabled={researching || !name.trim() || !websiteUrl.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:opacity-50 sm:w-auto"
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
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 1 && suggestions && (
            <div className="space-y-6">
              <div className="bg-white rounded-[20px] p-6 ambient-shadow border border-border-low-alpha">
                <p className="font-body-md text-body-md text-text-muted">
                  Here&apos;s what we found for{" "}
                  <span className="text-on-surface font-semibold">
                    {suggestions.businessName || name}
                  </span>
                  . Pick the options that fit best, or add your own.
                </p>
              </div>

              {suggestions.fields.map((field) => (
                <div
                  key={field.field}
                  className="bg-white rounded-[20px] p-6 ambient-shadow border border-border-low-alpha"
                >
                  <h3 className="font-headline-md text-[16px] text-on-surface mb-4">
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
                          "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 font-label-md text-label-md transition-all",
                          isSelected(field, option)
                            ? "border-primary bg-primary text-white shadow-sm"
                            : "border-border-low-alpha bg-surface-container-low text-on-surface-variant hover:border-primary/40 hover:bg-white",
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
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary px-4 py-2 font-label-md text-label-md text-white shadow-sm"
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
                    <button
                      type="button"
                      onClick={() => addCustomOption(field)}
                      className="rounded-lg border border-border-low-alpha px-3 py-2 font-label-md text-label-md text-primary hover:bg-surface-container-low transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="rounded-xl border border-outline px-5 py-2.5 font-label-md text-label-md text-primary hover:bg-surface-container-low transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAnswers}
                  disabled={generating}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:opacity-50"
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
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="bg-white rounded-[20px] p-8 ambient-shadow border border-border-low-alpha text-center">
              <span className="material-symbols-outlined text-primary text-[40px] animate-spin">sync</span>
              <p className="mt-4 font-body-md text-body-md text-text-muted">
                Taking you to your new blueprint...
              </p>
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
