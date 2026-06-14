"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";

export function MessageCandidate({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const close = () => {
    setOpen(false);
    // reset after the exit animation
    setTimeout(() => setSent(false), 250);
  };

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
        subtitle="Send a message — they'll get it by email."
      >
        {sent ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed/20 text-tertiary-container">
              <span className="material-symbols-outlined">send</span>
            </div>
            <p className="font-headline-md text-[18px] text-primary serif-text">
              Message sent
            </p>
            <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">
              Your message to {name} is on its way.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-5 rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
            className="space-y-4"
          >
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
                defaultValue="Opportunity: Lead Product Designer at Acme Corp"
                className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-label-md text-[13px] text-primary">Message</label>
              <textarea
                required
                rows={5}
                defaultValue={`Hi ${name.split(" ")[0]},\n\nI came across your profile and think you'd be a strong fit for a role we're hiring for. Would you be open to a quick chat this week?\n\nBest,\nRishav`}
                className="w-full resize-none rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                Send message
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
