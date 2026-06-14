"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";

export function InviteMemberButton() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const close = () => {
    setOpen(false);
    setTimeout(() => setSent(false), 250);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-8 py-4 bg-primary text-white rounded-lg font-headline-md text-[16px] font-semibold hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
      >
        <span className="material-symbols-outlined">person_add</span>
        Invite member
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Invite a member"
        subtitle="Add a recruiter to your Acme Corp workspace."
      >
        {sent ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed/20 text-tertiary-container">
              <span className="material-symbols-outlined">check_circle</span>
            </div>
            <p className="font-headline-md text-[18px] text-primary serif-text">Invitation sent</p>
            <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">
              They&apos;ll get an email to join your workspace.
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
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="name@company.com"
                className="flex-1 min-w-0 rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                defaultValue="Recruiter"
                className="rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option>Admin</option>
                <option>Recruiter</option>
                <option>Viewer</option>
              </select>
            </div>
            <p className="font-body-md text-[13px] text-on-surface-variant">
              You have 3 seats remaining on your Professional plan.
            </p>
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
                className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
              >
                Send invitation
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
