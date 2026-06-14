"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";

export function EditProfile() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const close = () => {
    setOpen(false);
    setTimeout(() => setSaved(false), 250);
  };

  const field =
    "w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary";
  const label = "mb-1.5 block font-label-md text-[13px] text-primary";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 py-2 bg-transparent border border-outline-variant text-on-surface-variant rounded-lg font-label-md text-[13px] hover:bg-surface-container-low transition-colors active:scale-[0.98]"
      >
        Edit Profile
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Edit profile"
        subtitle="Update this candidate's details."
        maxWidth="max-w-xl"
      >
        {saved ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed/20 text-tertiary-container">
              <span className="material-symbols-outlined">check_circle</span>
            </div>
            <p className="font-headline-md text-[18px] text-primary serif-text">Profile updated</p>
            <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">
              Your changes have been saved.
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
              setSaved(true);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Full name</label>
                <input className={field} defaultValue="Elena Rodriguez" required />
              </div>
              <div>
                <label className={label}>Title</label>
                <input className={field} defaultValue="Senior Product Designer" />
              </div>
              <div>
                <label className={label}>Location</label>
                <input className={field} defaultValue="San Francisco, CA (Open to Remote)" />
              </div>
              <div>
                <label className={label}>Email</label>
                <input className={field} type="email" defaultValue="elena.rodriguez@example.com" />
              </div>
              <div>
                <label className={label}>Current status</label>
                <select className={field} defaultValue="Interviewing">
                  <option>New</option>
                  <option>Screening</option>
                  <option>Interviewing</option>
                  <option>Offer</option>
                  <option>Hired</option>
                  <option>Rejected</option>
                </select>
              </div>
              <div>
                <label className={label}>Salary expectation</label>
                <input className={field} defaultValue="$160k - $180k" />
              </div>
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
                className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
              >
                Save changes
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
