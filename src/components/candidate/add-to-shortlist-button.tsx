"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";

interface Shortlist {
  id: string;
  name: string;
  candidateCount: number;
}

export function AddToShortlistButton({
  candidateId,
  name,
}: {
  candidateId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [shortlists, setShortlists] = useState<Shortlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedShortlistId, setSelectedShortlistId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  // Quick create option inside modal
  const [showCreate, setShowCreate] = useState(false);
  const [newShortlistName, setNewShortlistName] = useState("");

  const loadShortlists = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ shortlists: Shortlist[] }>("/api/shortlists");
      setShortlists(res.shortlists);
      if (res.shortlists.length > 0) {
        setSelectedShortlistId(res.shortlists[0].id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load shortlists");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setShowCreate(false);
    setNewShortlistName("");
    loadShortlists();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShortlistId) return;

    setSubmitting(true);
    try {
      await api.post(`/api/shortlists/${selectedShortlistId}/items`, {
        candidateId,
      });
      const selectedName = shortlists.find((s) => s.id === selectedShortlistId)?.name || "shortlist";
      toast.success(`Added ${name} to ${selectedName}`);
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add to shortlist");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortlistName.trim()) return;

    setSubmitting(true);
    try {
      // 1. Create the shortlist
      const created = await api.post<Shortlist>("/api/shortlists", {
        name: newShortlistName.trim(),
      });
      
      // 2. Add the candidate to the newly created shortlist
      await api.post(`/api/shortlists/${created.id}/items`, {
        candidateId,
      });
      
      toast.success(`Created "${newShortlistName}" and added ${name}`);
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create and add candidate");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    "w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary";
  const labelClass = "mb-1.5 block font-label-md text-[13px] text-primary";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full py-3 bg-primary text-on-primary rounded-lg font-label-md text-label-md shadow-sm hover:bg-primary/90 transition-colors flex justify-center items-center active:scale-[0.98]"
      >
        <span className="material-symbols-outlined mr-2 text-[18px]">star</span>
        Add to Shortlist
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Add ${name} to Shortlist`}
        subtitle="Choose a talent pool to organize this candidate."
      >
        {loading ? (
          <div className="py-8 text-center flex flex-col items-center gap-2">
            <span className="material-symbols-outlined animate-spin text-primary">sync</span>
            <p className="font-body-md text-[14px] text-on-surface-variant">Loading shortlists...</p>
          </div>
        ) : showCreate ? (
          <form onSubmit={handleCreateAndAdd} className="space-y-4">
            <div>
              <label className={labelClass}>New Shortlist Name</label>
              <input
                required
                value={newShortlistName}
                onChange={(e) => setNewShortlistName(e.target.value)}
                placeholder="e.g. Senior Frontend Roles"
                className={fieldClass}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
              >
                Back to List
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? "Creating & Adding..." : "Create & Add"}
              </button>
            </div>
          </form>
        ) : shortlists.length === 0 ? (
          <div className="text-center py-6">
            <p className="font-body-md text-on-surface-variant mb-4">No shortlists found in your account.</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98]"
            >
              + Create New Shortlist
            </button>
          </div>
        ) : (
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={labelClass}>Select Shortlist</label>
              <select
                value={selectedShortlistId}
                onChange={(e) => setSelectedShortlistId(e.target.value)}
                className={fieldClass}
              >
                {shortlists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.candidateCount} candidates)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-primary font-label-md hover:underline text-[14px]"
              >
                + Create new shortlist
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-outline px-5 py-2.5 font-label-md text-primary transition-colors hover:bg-surface-container-low"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-primary px-5 py-2.5 font-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? "Adding..." : "Add to Shortlist"}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
