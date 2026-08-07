"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Loader2,
  FileText,
  Rocket,
  ArrowRight,
  Globe,
  ClipboardCheck,
  Sparkles,
  RefreshCw,
  Signature,
  MessageSquare,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { easeOut } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BUSINESS_CATEGORIES, LOCATION_OPTIONS } from "./discovery-options";

interface BlueprintOption {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
}
interface BlueprintLeadQualification {
  websiteRequirement: "any" | "no_or_weak_site" | "has_site";
  criteria: string[];
}
interface BlueprintDetail {
  id: string;
  sections: {
    whoWeAre?: string;
    whatWeOffer?: string;
    whoItsFor: string;
    voice?: string;
    leadQualification?: BlueprintLeadQualification;
  } | null;
}
const WEBSITE_REQUIREMENT_LABEL: Record<BlueprintLeadQualification["websiteRequirement"], string> = {
  any: "No restriction — any business matching category/location qualifies.",
  no_or_weak_site: "Only businesses WITHOUT a good website qualify — others are skipped automatically.",
  has_site: "Only businesses that already HAVE a website qualify — others are skipped automatically.",
};
interface SenderOption {
  id: string;
  type: "gmail" | "smtp" | "whatsapp";
  label: string;
  email: string;
  isActive: boolean;
  gmailHasReadScope: boolean;
}

const STEPS = ["Start", "Research", "Voice & signature", "Review & launch"] as const;

export default function NewAutomatedCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [blueprints, setBlueprints] = useState<BlueprintOption[]>([]);
  const [senders, setSenders] = useState<SenderOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [selectedBlueprint, setSelectedBlueprint] = useState<BlueprintDetail | null>(null);

  // Step 1 — Start
  const [name, setName] = useState("");
  const [blueprintId, setBlueprintId] = useState("");
  const [senderAccountId, setSenderAccountId] = useState("");

  // Step 2 — Research
  const [category, setCategory] = useState("");
  const [locationText, setLocationText] = useState("");
  const [maxLeadsPerRun, setMaxLeadsPerRun] = useState(25);
  const [researching, setResearching] = useState(false);
  const [marketResearch, setMarketResearch] = useState("");
  const [researchAttempted, setResearchAttempted] = useState(false);

  // Step 3 — Voice & signature
  const [signatureName, setSignatureName] = useState("");
  const [signatureTitle, setSignatureTitle] = useState("");
  const [signatureClosing, setSignatureClosing] = useState("Best regards");
  const [styleExamples, setStyleExamples] = useState<string[]>(["", ""]);

  // Step 4 — Review & launch
  const [replyPollingEnabled, setReplyPollingEnabled] = useState(true);
  const [aiDiscoveryEnabled, setAiDiscoveryEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Warn on tab close/refresh once the user has moved past the first step —
  // real unsaved work (targeting, voice/signature, sequence copy) that a
  // reload would silently discard.
  useEffect(() => {
    if (step === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  useEffect(() => {
    (async () => {
      try {
        const [bp, sd] = await Promise.all([
          api.get<{ blueprints: BlueprintOption[] }>("/api/blueprints"),
          api.get<{ senders: SenderOption[] }>("/api/outreach/senders"),
        ]);
        setBlueprints(bp.blueprints.filter((b) => b.status === "active"));
        setSenders(sd.senders.filter((s) => s.isActive));
      } catch (err: any) {
        toast.error(err.message || "Failed to load options");
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!blueprintId) {
      setSelectedBlueprint(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<BlueprintDetail>(`/api/blueprints/${blueprintId}`);
        if (!cancelled) setSelectedBlueprint(res);
      } catch {
        if (!cancelled) setSelectedBlueprint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blueprintId]);

  const selectedSender = senders.find((s) => s.id === senderAccountId);
  const senderQualifiesForReplyPolling =
    selectedSender?.type === "gmail" && selectedSender.gmailHasReadScope;

  useEffect(() => {
    if (!senderQualifiesForReplyPolling) setReplyPollingEnabled(false);
  }, [senderQualifiesForReplyPolling]);

  const canLeaveStart = !!name.trim() && !!blueprintId && !!senderAccountId;
  const canLeaveResearch = !!category.trim() && !!locationText.trim();
  const canLeaveVoice = !!signatureName.trim();

  const handleResearch = async () => {
    if (!blueprintId || !category.trim() || !locationText.trim()) return;
    setResearching(true);
    try {
      const res = await api.post<{ research: string | null }>("/api/automated-campaigns/research", {
        blueprintId,
        category: category.trim(),
        location: locationText.trim(),
      });
      setResearchAttempted(true);
      if (res.research) setMarketResearch(res.research);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to research this market");
    } finally {
      setResearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!canLeaveStart || !canLeaveResearch || !canLeaveVoice) return;

    setCreating(true);
    try {
      const created = await api.post<{ id: string }>("/api/automated-campaigns", {
        name: name.trim(),
        blueprintId,
        senderAccountId,
        discoveryQuery: { category: category.trim(), location: { text: locationText.trim() } },
        maxLeadsPerRun,
        signatureName: signatureName.trim(),
        signatureTitle: signatureTitle.trim() || undefined,
        signatureClosing: signatureClosing.trim() || undefined,
        styleExamples: styleExamples.map((s) => s.trim()).filter(Boolean),
        replyPollingEnabled,
        aiDiscoveryEnabled,
        marketResearch: marketResearch.trim() || undefined,
      });
      toast.success("Campaign created");
      router.push(`/automated-outreach/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline";
  const labelClass = "block font-label-md text-label-md text-primary mb-2";

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <Link
                href="/automated-outreach"
                className="hover:text-on-surface transition-colors"
                onClick={(e) => {
                  if (step > 0) {
                    e.preventDefault();
                    setShowLeaveConfirm(true);
                  }
                }}
              >
                Automated Outreach
              </Link>
              <ChevronRight className="size-[14px]" />
              <span className="text-on-surface font-medium">New campaign</span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1100px] mx-auto w-full">
          {loadingOptions ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <Loader2 className="size-[32px] animate-spin text-primary" />
            </div>
          ) : blueprints.length === 0 ? (
            <Card className="overflow-hidden text-center [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
              <CardContent>
                <FileText className="mx-auto size-[32px] text-outline" />
                <p className="mt-3 font-body-md text-body-md text-text-muted">
                  You need at least one generated Blueprint before creating an
                  automated campaign.
                </p>
                <Button asChild variant="gradient" size="lg" className="mt-4">
                  <Link href="/blueprints/new">Create a Blueprint</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Stepper steps={STEPS} currentStep={step} />

              <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step-0"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                >

                <Card className="border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-primary-container/10 p-2 text-primary">
                        <Rocket className="size-[20px]" />
                      </div>
                      <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                        Start a new campaign
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <p className="font-body-md text-body-md text-text-muted -mt-2">
                      Every campaign runs on top of a Blueprint — the company
                      profile it already knows. Pick one, pick who it sends
                      from, and name this effort.
                    </p>
                    <div>
                      <label className={labelClass}>Campaign name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        placeholder="e.g. Austin dentists — Q1"
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>Blueprint</label>
                        <select
                          value={blueprintId}
                          onChange={(e) => setBlueprintId(e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select a blueprint...</option>
                          {blueprints.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Sending account</label>
                        <select
                          value={senderAccountId}
                          onChange={(e) => setSenderAccountId(e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select a sender...</option>
                          {senders.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label} ({s.email})
                            </option>
                          ))}
                        </select>
                        {senders.length === 0 && (
                          <p className="mt-2 font-body-md text-[13px] text-text-muted">
                            Connect a sender account under Bulk Fire first.
                          </p>
                        )}
                      </div>
                    </div>

                    {selectedBlueprint?.sections && (
                      <div className="rounded-xl border border-border-low-alpha bg-bg-cream/30 p-4 space-y-2.5">
                        <p className="flex items-center gap-1.5 font-label-md text-label-md text-primary">
                          <FileText className="size-[16px]" />
                          What this campaign already knows
                        </p>
                        {selectedBlueprint.sections.whoWeAre && (
                          <p className="font-body-md text-[13px] text-on-surface">
                            <span className="font-semibold">Who we are — </span>
                            {selectedBlueprint.sections.whoWeAre}
                          </p>
                        )}
                        {selectedBlueprint.sections.whatWeOffer && (
                          <p className="font-body-md text-[13px] text-on-surface">
                            <span className="font-semibold">What we offer — </span>
                            {selectedBlueprint.sections.whatWeOffer}
                          </p>
                        )}
                        {selectedBlueprint.sections.voice && (
                          <p className="font-body-md text-[13px] text-text-muted">
                            <span className="font-semibold text-on-surface">Voice — </span>
                            {selectedBlueprint.sections.voice}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        variant="gradient"
                        size="lg"
                        disabled={!canLeaveStart}
                        onClick={() => setStep(1)}
                        className="group w-full justify-center sm:w-auto"
                      >
                        Continue
                        <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                >
                <div className="space-y-6">
                  <Card className="border border-border-low-alpha bg-surface-white [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-primary-container/10 p-2 text-primary">
                          <Globe className="size-[20px]" />
                        </div>
                        <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                          Who to find
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-6 md:grid-cols-2">
                        <div>
                          <label className={labelClass}>Business category</label>
                          <input
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            placeholder="e.g. restaurant, dentist, gym"
                            className={inputClass}
                            list="business-category-options"
                          />
                          <datalist id="business-category-options">
                            {BUSINESS_CATEGORIES.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                          <p className="mt-2 font-body-md text-[13px] text-text-muted">
                            Pick a suggestion for a guaranteed match, or type your own.
                          </p>
                        </div>
                        <div>
                          <label className={labelClass}>Location</label>
                          <input
                            value={locationText}
                            onChange={(e) => setLocationText(e.target.value)}
                            placeholder="e.g. Austin, TX or Mumbai"
                            className={inputClass}
                            list="location-options"
                          />
                          <datalist id="location-options">
                            {LOCATION_OPTIONS.map((l) => (
                              <option key={l} value={l} />
                            ))}
                          </datalist>
                          <p className="mt-2 font-body-md text-[13px] text-text-muted">
                            Use a city, not a country — discovery searches ~10km around
                            the location&apos;s center.
                          </p>
                        </div>
                      </div>
                      {selectedBlueprint?.sections && (
                        <div className="rounded-xl border border-border-low-alpha bg-bg-cream/30 p-4">
                          <p className="flex items-center gap-1.5 font-label-md text-label-md text-primary mb-1.5">
                            <ClipboardCheck className="size-[16px]" />
                            This campaign will target
                          </p>
                          <p className="font-body-md text-[13px] text-on-surface">
                            {
                              WEBSITE_REQUIREMENT_LABEL[
                                selectedBlueprint.sections.leadQualification?.websiteRequirement ?? "any"
                              ]
                            }
                          </p>
                          <p className="mt-1 font-body-md text-[13px] text-text-muted">
                            {selectedBlueprint.sections.whoItsFor}
                          </p>
                        </div>
                      )}
                      <div>
                        <label className={labelClass}>Target leads per run (with emails)</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={maxLeadsPerRun}
                          onChange={(e) => setMaxLeadsPerRun(Number(e.target.value))}
                          className={inputClass}
                        />
                        <p className="mt-2 font-body-md text-[13px] text-text-muted">
                          Sends are separately capped per day based on your plan.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* The "give our AI a button" feature: real-time research on
                      this specific category+location combo, grounded in the
                      selected blueprint's own positioning. Same visual
                      language as the blueprint wizard's AI-context card. */}
                  <Card className="border-2 border-primary-container/30 bg-primary-container/[0.03] [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                    <CardContent>
                      <div className="mb-3 flex items-center gap-2.5">
                        <div className="rounded-lg bg-primary-container/10 p-1.5 text-primary">
                          <Sparkles className="size-[18px]" />
                        </div>
                        <h3 className="font-sans font-semibold text-[16px] text-on-surface">
                          Research this market
                        </h3>
                      </div>
                      <p className="mb-4 font-body-md text-[13px] text-text-muted">
                        AI looks up how competitive this category is in this
                        location, whether these businesses typically have a
                        website, and any local context worth referencing —
                        then every generated email uses it alongside your
                        Blueprint.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleResearch}
                        disabled={researching || !category.trim() || !locationText.trim()}
                        className="border-primary-container/40 text-primary"
                      >
                        {researching ? (
                          <>
                            <Loader2 className="size-[18px] animate-spin" />
                            Researching {category || "this market"}...
                          </>
                        ) : marketResearch ? (
                          <>
                            <RefreshCw className="size-[18px]" />
                            Research again
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-[18px]" />
                            Research with AI
                          </>
                        )}
                      </Button>

                      {marketResearch ? (
                        <div className="mt-4">
                          <label className="flex items-center gap-1.5 font-label-md text-[11px] text-primary mb-1.5">
                            <Sparkles className="size-[14px]" />
                            Edit or replace anything below — this is sent to the AI as context, not copied verbatim.
                          </label>
                          <textarea
                            value={marketResearch}
                            onChange={(e) => setMarketResearch(e.target.value.slice(0, 4000))}
                            rows={6}
                            maxLength={4000}
                            className="w-full rounded-xl border border-border-low-alpha bg-white px-4 py-3 font-body-md text-body-md focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                          />
                        </div>
                      ) : (
                        researchAttempted &&
                        !researching && (
                          <p className="mt-3 font-body-md text-[13px] text-text-muted">
                            No additional research came back for this market —
                            that&apos;s fine, the campaign still works from
                            your Blueprint alone. You can continue, or try
                            again.
                          </p>
                        )
                      )}
                    </CardContent>
                  </Card>

                  <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                    <Button type="button" variant="outline" size="lg" onClick={() => setStep(0)} className="text-primary">
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="gradient"
                      size="lg"
                      disabled={!canLeaveResearch}
                      onClick={() => setStep(2)}
                      className="group w-full justify-center sm:w-auto"
                    >
                      Continue
                      <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </div>
                </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                >
                <div className="space-y-6">
                  <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-primary-container/10 p-2 text-primary">
                          <Signature className="size-[20px]" />
                        </div>
                        <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                          Signature &amp; voice
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {selectedBlueprint?.sections?.voice && (
                        <p className="font-body-md text-[13px] text-text-muted">
                          Your Blueprint&apos;s voice: &ldquo;{selectedBlueprint.sections.voice}&rdquo; — AI
                          matches this automatically. The examples below are optional extra guidance.
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={labelClass}>Your name</label>
                          <input
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            autoFocus
                            placeholder="Jane Doe"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Title (optional)</label>
                          <input
                            value={signatureTitle}
                            onChange={(e) => setSignatureTitle(e.target.value)}
                            placeholder="Founder"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Closing line</label>
                        <input
                          value={signatureClosing}
                          onChange={(e) => setSignatureClosing(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Example emails (optional, up to 2) — AI matches this tone
                        </label>
                        {styleExamples.map((ex, i) => (
                          <textarea
                            key={i}
                            value={ex}
                            onChange={(e) => {
                              const next = [...styleExamples];
                              next[i] = e.target.value;
                              setStyleExamples(next);
                            }}
                            rows={3}
                            placeholder={`Example email ${i + 1}...`}
                            className={cn(inputClass, "mb-2 resize-y")}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                    <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)} className="text-primary">
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="gradient"
                      size="lg"
                      disabled={!canLeaveVoice}
                      onClick={() => setStep(3)}
                      className="group w-full justify-center sm:w-auto"
                    >
                      Continue
                      <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </div>
                </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                >
                <div className="space-y-6">
                  <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-primary-container/10 p-2 text-primary">
                          <ClipboardCheck className="size-[20px]" />
                        </div>
                        <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                          Review
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <dl className="divide-y divide-border-low-alpha">
                        {[
                          ["Campaign", name],
                          ["Blueprint", blueprints.find((b) => b.id === blueprintId)?.name],
                          ["Sending account", selectedSender ? `${selectedSender.label} (${selectedSender.email})` : undefined],
                          ["Targeting", `${category} — ${locationText}`],
                          ["Leads per run", String(maxLeadsPerRun)],
                          ["Market research", marketResearch ? "Included" : "Not included"],
                          ["Signature", `${signatureName}${signatureTitle ? `, ${signatureTitle}` : ""}`],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                            <dt className="font-label-md text-label-md text-text-muted">{label}</dt>
                            <dd className="font-body-md text-body-md text-on-surface text-right">{value || "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    </CardContent>
                  </Card>

                  {/* One card, two toggle rows — these used to be two separate
                      cards holding one switch each, which just added box
                      count without adding meaning; both are automation
                      settings for this same campaign. */}
                  <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                    <CardHeader>
                      <CardTitle className="font-sans text-[15px] font-semibold text-on-surface">
                        Automation settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y divide-border-low-alpha">
                      <div className="flex items-start justify-between gap-4 pb-5 first:pt-0">
                        <div>
                          <div className="mb-1 flex items-center gap-2.5">
                            <div className="rounded-lg bg-primary-container/10 p-1.5 text-primary">
                              <MessageSquare className="size-[16px]" />
                            </div>
                            <h3 className="font-body-md text-[14px] font-semibold text-on-surface">
                              Reply polling
                            </h3>
                          </div>
                          <p className="font-body-md text-[13px] text-text-muted">
                            When a lead replies, AI drafts a response — you always
                            review and approve before anything sends.
                          </p>
                          {!senderQualifiesForReplyPolling && senderAccountId && (
                            <p className="mt-2 font-body-md text-[13px] text-error">
                              This sender doesn&apos;t have Gmail read access — reply
                              polling needs it. Connect Gmail with read access, or
                              leave this off.
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyPollingEnabled((v) => !v)}
                          disabled={!senderQualifiesForReplyPolling}
                          className={cn(
                            "shrink-0 w-12 h-7 rounded-full transition-colors relative disabled:opacity-40",
                            replyPollingEnabled ? "bg-tertiary-fixed" : "bg-surface-container-high",
                          )}
                        >
                          <span
                            className={cn(
                              // Explicit literal white, not `bg-white`: this is a switch
                              // knob, the one place that must stay light in dark mode
                              // (the global `.dark .bg-white` surface remap would sink
                              // it into the track). `left-1` is load-bearing, not
                              // decorative — an absolutely-positioned knob with no
                              // explicit `left` falls back to the browser's "static
                              // position" resolution, which is ambiguous once this
                              // button sits inside a flex row and rendered the knob
                              // pinned to the track's far edge instead of sliding
                              // between two 4px-inset resting positions.
                              "absolute left-1 top-1 h-5 w-5 rounded-full bg-[#ffffff] shadow-sm transition-transform",
                              replyPollingEnabled ? "translate-x-5" : "translate-x-0",
                            )}
                          />
                        </button>
                      </div>

                      <div className="flex items-start justify-between gap-4 pt-5 last:pb-0">
                        <div>
                          <div className="mb-1 flex items-center gap-2.5">
                            <div className="rounded-lg bg-primary-container/10 p-1.5 text-primary">
                              <Globe className="size-[16px]" />
                            </div>
                            <h3 className="font-body-md text-[14px] font-semibold text-on-surface">
                              AI-powered lead search
                            </h3>
                          </div>
                          <p className="font-body-md text-[13px] text-text-muted">
                            Alongside our directory-based search, AI does a
                            live web search for real, currently-operating
                            businesses matching your targeting — and helps
                            track down an email when the usual sources come
                            up empty.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAiDiscoveryEnabled((v) => !v)}
                          className={cn(
                            "shrink-0 w-12 h-7 rounded-full transition-colors relative",
                            aiDiscoveryEnabled ? "bg-tertiary-fixed" : "bg-surface-container-high",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute left-1 top-1 h-5 w-5 rounded-full bg-[#ffffff] shadow-sm transition-transform",
                              aiDiscoveryEnabled ? "translate-x-5" : "translate-x-0",
                            )}
                          />
                        </button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                    <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)} className="text-primary">
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="gradient"
                      size="lg"
                      onClick={handleSubmit}
                      disabled={creating}
                      className="w-full justify-center sm:w-auto"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="size-[18px] animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          Create campaign
                          <Rocket className="size-[18px]" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                </motion.div>
              )}
              </AnimatePresence>
            </>
          )}
        </main>
      </div>
      <ConfirmDialog
        open={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={() => {
          setShowLeaveConfirm(false);
          router.push("/automated-outreach");
        }}
        title="Leave without finishing?"
        description="Your progress on this campaign will be lost."
        confirmLabel="Leave"
        destructive
      />
    </AppShell>
  );
}
