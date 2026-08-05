"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { useAuth } from "@/components/app/auth-provider";

export function MessageCandidate({
  candidateId,
  name,
  email,
}: {
  candidateId: string;
  name: string;
  email: string;
}) {
  const { user, profile, workspaceName } = useAuth();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  // Sender identity comes from the logged-in account, never hardcoded.
  const senderName =
    user?.user_metadata?.full_name ||
    (profile?.email ? profile.email.split("@")[0] : "The recruiting team");
  const firstName = name.split(" ")[0];

  const [subject, setSubject] = useState(
    `Opportunity at ${workspaceName || "our agency"}`,
  );
  const [message, setMessage] = useState(
    `Hi ${firstName},\n\nI came across your profile and think you'd be a strong fit for a role we're hiring for. Would you be open to a quick chat this week?\n\nBest,\n${senderName}`,
  );

  const close = () => {
    setOpen(false);
    // reset after the exit animation
    setTimeout(() => setSent(false), 250);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post(`/api/candidates/${candidateId}/message`, { subject, message });
      setSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // No email on file → an honest disabled state instead of a doomed form.
  if (!email) {
    return (
      <button
        type="button"
        disabled
        title="This candidate has no email address on file"
        className="w-full py-3 bg-surface-white border border-outline-variant text-on-surface-variant/50 rounded-lg font-label-md text-label-md shadow-sm flex justify-center items-center cursor-not-allowed"
      >
        <span className="material-symbols-outlined mr-2 text-[18px]">mail_off</span>
        No email on file
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 bg-surface-white border border-outline-variant text-primary rounded-lg font-label-md text-label-md shadow-sm hover:bg-surface-container-low transition-colors flex justify-center items-center active:scale-[0.98]"
      >
        <span className="material-symbols-outlined mr-2 text-[18px]">mail</span>
        Message Candidate
      </button>

      <Modal
        open={open}
        onClose={close}
        title={`Message ${name}`}
        subtitle="Send a message — they'll get it by email, and replies come back to you."
      >
        {sent ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed/20 text-tertiary">
              <span className="material-symbols-outlined">send</span>
            </div>
            <p className="font-headline-md text-[18px] text-primary serif-text">
              Message sent
            </p>
            <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">
              Your message to {name} is on its way to {email}.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-5 rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-[filter] hover:brightness-110 active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block font-label-md text-[13px] text-primary">To</label>
              <input
                readOnly
                value={`${name} · ${email}`}
                className="w-full cursor-default rounded-xl border border-border-low-alpha bg-bg-cream/40 px-4 py-3 font-body-md text-on-surface-variant"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-label-md text-[13px] text-primary">Subject</label>
              <input
                required
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-label-md text-[13px] text-primary">Message</label>
              <textarea
                required
                rows={5}
                maxLength={5000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full resize-none rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={close}
                disabled={sending}
                className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                {sending ? "Sending..." : "Send message"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
