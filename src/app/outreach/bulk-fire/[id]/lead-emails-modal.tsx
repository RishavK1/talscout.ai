"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Lead {
  id: string;
  name: string;
  niche: string | null;
  location: string | null;
  decisionMaker: string | null;
  email: string | null;
  phone: string | null;
  status: "pending" | "scheduled" | "sent" | "bounced" | "failed" | "skipped";
  nextSendAt: string | null;
}

interface LeadTemplateStep {
  stepIndex: number;
  subject: string;
  body: string;
  isOwn: boolean;
}

const STEP_LABELS = ["Day 0", "Day 3", "Day 7"];

export default function LeadEmailsModal({
  campaignId,
  lead,
  onClose,
  onSaved,
}: {
  campaignId: string;
  lead: Lead | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [steps, setSteps] = useState<LeadTemplateStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setLoading(true);
    api
      .get<{ leadId: string; steps: LeadTemplateStep[] }>(
        `/api/outreach/campaigns/${campaignId}/leads/${lead.id}/templates`,
      )
      .then((res) => setSteps(res.steps))
      .catch((err: any) =>
        toast.error(err.message || "Failed to load emails"),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, lead?.id]);

  const updateStep = (stepIndex: number, patch: Partial<LeadTemplateStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.stepIndex === stepIndex ? { ...s, ...patch } : s)),
    );
  };

  const handleSave = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await api.put(
        `/api/outreach/campaigns/${campaignId}/leads/${lead.id}/templates`,
        {
          steps: steps.map(({ stepIndex, subject, body }) => ({
            stepIndex,
            subject,
            body,
          })),
        },
      );
      toast.success("Emails updated for this lead");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save emails");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!lead}
      onClose={onClose}
      title={lead ? `Emails for ${lead.name}` : "Emails"}
      subtitle="The exact subject and body this lead will be sent at each step — edit and save to override just this lead."
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-10 font-body-md text-on-surface-variant">
          <span className="material-symbols-outlined mr-2 animate-spin">
            sync
          </span>
          Loading…
        </div>
      ) : (
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {steps.map((step) => (
            <div
              key={step.stepIndex}
              className="rounded-[16px] border border-border-low-alpha bg-bg-cream/30 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-headline-md text-[14px] text-on-surface">
                  {STEP_LABELS[step.stepIndex]}
                </h3>
                {step.isOwn && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-label-md text-[10px] text-primary">
                    Custom copy
                  </span>
                )}
              </div>
              <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                Subject
              </label>
              <input
                value={step.subject}
                onChange={(e) =>
                  updateStep(step.stepIndex, { subject: e.target.value })
                }
                className="mb-3 w-full rounded-lg border border-border-low-alpha bg-surface-white px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                Body
              </label>
              <textarea
                value={step.body}
                onChange={(e) =>
                  updateStep(step.stepIndex, { body: e.target.value })
                }
                rows={5}
                className="w-full resize-none rounded-lg border border-border-low-alpha bg-surface-white px-3 py-2 font-body-md text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-3 border-t border-border-low-alpha pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border-low-alpha bg-surface-white px-4 py-2 font-label-md text-[12px] text-on-surface transition-colors hover:bg-surface-container-low"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-lg bg-primary px-4 py-2 font-label-md text-[12px] text-on-primary transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}
