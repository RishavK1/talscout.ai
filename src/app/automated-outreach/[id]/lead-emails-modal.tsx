"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

interface Lead {
  id: string;
  businessName: string;
}

interface LeadSend {
  id: string;
  stepIndex: number;
  subject: string;
  body: string;
  status: "scheduled" | "sent" | "failed" | "skipped";
  scheduledAt: string;
  sentAt: string | null;
  errorReason: string | null;
}

const STEP_LABELS = ["Day 0", "Day 3", "Day 7"];

const SEND_STATUS_TONE: Record<LeadSend["status"], NonNullable<StatusBadgeProps["tone"]>> = {
  scheduled: "invited",
  sent: "active",
  failed: "error",
  skipped: "neutral",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeadEmailsModal({
  campaignId,
  lead,
  onClose,
}: {
  campaignId: string;
  lead: Lead | null;
  onClose: () => void;
}) {
  const [sends, setSends] = useState<LeadSend[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setLoading(true);
    api
      .get<{ sends: LeadSend[] }>(`/api/automated-campaigns/${campaignId}/leads/${lead.id}/sends`)
      .then((res) => setSends(res.sends))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load emails"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, lead?.id]);

  return (
    <Modal
      open={!!lead}
      onClose={onClose}
      title={lead ? `Emails for ${lead.businessName}` : "Emails"}
      subtitle="The AI-written Day 0/3/7 sequence for this lead — locked once generated, not editable like a reusable template."
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-10 font-body-md text-on-surface-variant">
          <Loader2 className="mr-2 size-[18px] animate-spin" />
          Loading…
        </div>
      ) : sends.length === 0 ? (
        <div className="py-10 text-center font-body-md text-[13px] text-on-surface-variant">
          No emails generated for this lead yet.
        </div>
      ) : (
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {sends.map((send) => (
            <div key={send.id} className="rounded-[16px] border border-border-low-alpha bg-bg-cream/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-headline-md text-[14px] text-on-surface">
                  {STEP_LABELS[send.stepIndex] ?? `Step ${send.stepIndex}`}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="font-data-mono text-[11px] text-on-surface-variant">
                    {send.status === "sent" && send.sentAt
                      ? `Sent ${formatTime(send.sentAt)}`
                      : send.status === "scheduled"
                        ? `Sends ${formatTime(send.scheduledAt)}`
                        : send.status === "skipped"
                          ? (send.errorReason ?? "Skipped")
                          : (send.errorReason ?? "Failed")}
                  </span>
                  <StatusBadge tone={SEND_STATUS_TONE[send.status]} className="capitalize">
                    {send.status}
                  </StatusBadge>
                </div>
              </div>
              <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                Subject
              </label>
              <p className="mb-3 rounded-lg border border-border-low-alpha bg-white px-3 py-2 font-body-md text-[13px] text-on-surface">
                {send.subject}
              </p>
              <label className="mb-1 block font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                Body
              </label>
              <p className="whitespace-pre-wrap rounded-lg border border-border-low-alpha bg-white px-3 py-2 font-body-md text-[13px] text-on-surface">
                {send.body}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 flex justify-end border-t border-border-low-alpha pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border-low-alpha bg-white px-4 py-2 font-label-md text-[12px] text-on-surface transition-colors hover:bg-surface-container-low"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
