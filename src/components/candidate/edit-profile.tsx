"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Candidate {
  id: string;
  fullName: string | null;
  emails: string[] | null;
  phones: string[] | null;
  location: string | null;
  currentTitle: string | null;
  yearsExperience: string | null;
  skills: string[] | null;
  summary: string | null;
  status: "ready" | "processing" | "error";
}

export function EditProfile({
  candidate,
  onUpdate,
}: {
  candidate: any;
  onUpdate: (updated: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form states initialized from props
  const [fullName, setFullName] = useState(candidate.fullName || "");
  const [currentTitle, setCurrentTitle] = useState(candidate.currentTitle || "");
  const [location, setLocation] = useState(candidate.location || "");
  const [email, setEmail] = useState(candidate.emails?.[0] || "");
  const [yearsExperience, setYearsExperience] = useState(
    candidate.yearsExperience ? String(Math.round(parseFloat(candidate.yearsExperience))) : "0"
  );
  const [summary, setSummary] = useState(candidate.summary || "");

  const handleOpen = () => {
    // Reset values to current candidate state
    setFullName(candidate.fullName || "");
    setCurrentTitle(candidate.currentTitle || "");
    setLocation(candidate.location || "");
    setEmail(candidate.emails?.[0] || "");
    setYearsExperience(
      candidate.yearsExperience ? String(Math.round(parseFloat(candidate.yearsExperience))) : "0"
    );
    setSummary(candidate.summary || "");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setTimeout(() => setSaved(false), 250);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch<Candidate>(`/api/candidates/${candidate.id}`, {
        fullName: fullName.trim(),
        currentTitle: currentTitle.trim(),
        location: location.trim(),
        emails: email.trim() ? [email.trim()] : [],
        yearsExperience: parseFloat(yearsExperience) || 0,
        summary: summary.trim(),
      });
      toast.success("Profile updated successfully");
      setSaved(true);
      onUpdate(updated);
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary";
  const label = "mb-1.5 block font-label-md text-[13px] text-primary";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex-1 py-2 bg-transparent border border-outline-variant text-on-surface-variant rounded-lg font-label-md text-[13px] hover:bg-surface-container-low transition-colors active:scale-[0.98]"
      >
        Edit Profile
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Edit Profile"
        subtitle={`Update ${candidate.fullName || "candidate"}'s details.`}
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Full name</label>
                <input
                  className={field}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={label}>Title</label>
                <input
                  className={field}
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Location</label>
                <input
                  className={field}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Email</label>
                <input
                  className={field}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Years of Experience</label>
                <input
                  className={field}
                  type="number"
                  min="0"
                  max="80"
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Executive Summary</label>
                <textarea
                  className={`${field} h-24 resize-none`}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
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
                disabled={saving}
                className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
