"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { TopAppBar } from "@/components/app/top-app-bar";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface BlueprintOption {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
}
interface SenderOption {
  id: string;
  type: "gmail" | "smtp" | "whatsapp";
  label: string;
  email: string;
  isActive: boolean;
  gmailHasReadScope: boolean;
}

export default function NewAutomatedCampaignPage() {
  const router = useRouter();
  const [blueprints, setBlueprints] = useState<BlueprintOption[]>([]);
  const [senders, setSenders] = useState<SenderOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [name, setName] = useState("");
  const [blueprintId, setBlueprintId] = useState("");
  const [senderAccountId, setSenderAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [locationText, setLocationText] = useState("");
  const [maxLeadsPerRun, setMaxLeadsPerRun] = useState(25);
  const [signatureName, setSignatureName] = useState("");
  const [signatureTitle, setSignatureTitle] = useState("");
  const [signatureClosing, setSignatureClosing] = useState("Best regards");
  const [styleExamples, setStyleExamples] = useState<string[]>(["", ""]);
  const [replyPollingEnabled, setReplyPollingEnabled] = useState(true);
  const [creating, setCreating] = useState(false);

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

  const selectedSender = senders.find((s) => s.id === senderAccountId);
  const senderQualifiesForReplyPolling =
    selectedSender?.type === "gmail" && selectedSender.gmailHasReadScope;

  useEffect(() => {
    if (!senderQualifiesForReplyPolling) setReplyPollingEnabled(false);
  }, [senderQualifiesForReplyPolling]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !blueprintId || !senderAccountId || !category.trim() || !locationText.trim()) {
      return;
    }
    if (!signatureName.trim()) return;

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
      });
      toast.success("Campaign created");
      router.push(`/automated-outreach/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <TopAppBar
          leftContent={
            <div className="flex items-center gap-2 text-text-muted font-label-md">
              <span>Automated Outreach</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
              <span className="text-on-surface font-medium">New</span>
            </div>
          }
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[720px] mx-auto w-full">
          {loadingOptions ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <span className="material-symbols-outlined animate-spin text-primary text-[32px]">sync</span>
            </div>
          ) : blueprints.length === 0 ? (
            <Card className="overflow-hidden text-center [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
              <CardContent>
                <span className="material-symbols-outlined text-outline text-[32px]">description</span>
                <p className="mt-3 font-body-md text-body-md text-text-muted">
                  You need at least one generated Blueprint before creating an
                  automated campaign.
                </p>
                <Button asChild variant="gradient" className="mt-4">
                  <Link href="/blueprints/new">Create a Blueprint</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="mb-2 flex items-center justify-center gap-2">
                {[
                  { n: 1, label: "Basics" },
                  { n: 2, label: "Who to find" },
                  { n: 3, label: "Voice" },
                  { n: 4, label: "Replies" },
                ].map((s, i, arr) => (
                  <div key={s.n} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-tertiary-fixed font-data-mono text-[11px] font-semibold text-on-tertiary-fixed">
                        {s.n}
                      </span>
                      <span className="hidden font-label-md text-[12px] text-text-muted sm:inline">
                        {s.label}
                      </span>
                    </div>
                    {i < arr.length - 1 && <span className="h-px w-6 bg-border-low-alpha sm:w-10" />}
                  </div>
                ))}
              </div>

              <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary-container/10 p-2 text-primary-container">
                      <span className="material-symbols-outlined text-[20px]">flag</span>
                    </div>
                    <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                      Campaign basics
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">
                      Campaign name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="e.g. Austin dentists — Q1"
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">Blueprint</label>
                    <select
                      value={blueprintId}
                      onChange={(e) => setBlueprintId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
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
                    <label className="block font-label-md text-label-md text-primary mb-2">
                      Sending account
                    </label>
                    <select
                      value={senderAccountId}
                      onChange={(e) => setSenderAccountId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
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
                </CardContent>
              </Card>

              <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary-container/10 p-2 text-primary-container">
                      <span className="material-symbols-outlined text-[20px]">travel_explore</span>
                    </div>
                    <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                      Who to find
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">
                      Business category
                    </label>
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                      placeholder="e.g. restaurant, dentist, gym"
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">
                      Location
                    </label>
                    <input
                      value={locationText}
                      onChange={(e) => setLocationText(e.target.value)}
                      required
                      placeholder="e.g. Austin, TX or Mumbai"
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                    />
                    <p className="mt-2 font-body-md text-[13px] text-text-muted">
                      Use a city, not a country — discovery searches ~10km around
                      the location&apos;s center.
                    </p>
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">
                      Target leads per run (with emails)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxLeadsPerRun}
                      onChange={(e) => setMaxLeadsPerRun(Number(e.target.value))}
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <p className="mt-2 font-body-md text-[13px] text-text-muted">
                      Sends are separately capped at 50/day regardless of this setting.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary-container/10 p-2 text-primary-container">
                      <span className="material-symbols-outlined text-[20px]">signature</span>
                    </div>
                    <CardTitle className="font-body-md text-headline-md font-semibold text-primary">
                      Signature &amp; voice
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-label-md text-label-md text-primary mb-2">
                        Your name
                      </label>
                      <input
                        value={signatureName}
                        onChange={(e) => setSignatureName(e.target.value)}
                        required
                        placeholder="Jane Doe"
                        className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                      />
                    </div>
                    <div>
                      <label className="block font-label-md text-label-md text-primary mb-2">
                        Title (optional)
                      </label>
                      <input
                        value={signatureTitle}
                        onChange={(e) => setSignatureTitle(e.target.value)}
                        placeholder="Founder"
                        className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">
                      Closing line
                    </label>
                    <input
                      value={signatureClosing}
                      onChange={(e) => setSignatureClosing(e.target.value)}
                      className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-primary mb-2">
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
                        className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md mb-2 focus:outline-none focus:ring-1 focus:ring-primary placeholder-outline"
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-1 flex items-center gap-3">
                        <div className="rounded-xl bg-primary-container/10 p-2 text-primary-container">
                          <span className="material-symbols-outlined text-[20px]">forum</span>
                        </div>
                        <h2 className="font-body-md text-headline-md font-semibold text-primary">
                          Reply polling
                        </h2>
                      </div>
                      <p className="font-body-md text-body-md text-text-muted">
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
                          "absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                          replyPollingEnabled ? "translate-x-6" : "translate-x-1",
                        )}
                      />
                    </button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="gradient" disabled={creating} className="w-full justify-center sm:w-auto">
                  {creating ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                      Creating...
                    </>
                  ) : (
                    "Create campaign"
                  )}
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </AppShell>
  );
}
