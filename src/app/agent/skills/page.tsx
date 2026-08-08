"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Plus, Pencil, Trash2, Play, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  usageCount: number;
  lastUsedAt: string | null;
}

function SkillForm({
  skill,
  onDone,
  onSaved,
}: {
  skill: Skill | null;
  onDone: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !instructions.trim()) return;
    setSaving(true);
    try {
      if (skill) {
        await api.patch(`/api/agent/skills/${skill.id}`, { name, description, instructions });
        toast.success("Skill updated");
      } else {
        await api.post("/api/agent/skills", { name, description, instructions });
        toast.success("Skill saved");
      }
      onSaved();
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-label-md text-primary mb-2">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Weekly follow-up campaign"
          maxLength={100}
          className="bg-bg-cream/30 h-auto px-4 py-3 rounded-xl font-body-md"
        />
      </div>
      <div>
        <label className="block font-label-md text-primary mb-2">Description</label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line — helps the agent recognize when to suggest this"
          maxLength={500}
          className="bg-bg-cream/30 h-auto px-4 py-3 rounded-xl font-body-md"
        />
      </div>
      <div>
        <label className="block font-label-md text-primary mb-2">Instructions</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="The full procedure — what to do, which tools to use, in what order. Use {placeholders} for whatever should vary each time."
          rows={8}
          maxLength={8000}
          className="w-full rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md text-[13.5px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="gradient" loading={saving}>
          {skill ? "Save changes" : "Create skill"}
        </Button>
      </div>
    </form>
  );
}

export default function AgentSkillsPage() {
  const { can, loading: authLoading } = useAuth();
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<{ skills: Skill[] }>("/api/agent/skills");
      setSkills(res.skills);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load skills");
      setSkills([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/agent/skills/${deleteTarget.id}`);
      toast.success("Skill deleted");
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete skill");
    }
  };

  const handleRunNow = async (skill: Skill) => {
    setStarting(skill.id);
    try {
      const res = await api.post<{ conversation: { id: string } }>("/api/agent/conversations", {});
      router.push(`/agent?c=${res.conversation.id}&skill=${encodeURIComponent(skill.name)}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start a new chat");
      setStarting(null);
    }
  };

  if (authLoading || skills === null) {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface">
        <Loader2 className="size-[24px] animate-spin text-on-surface-variant" />
      </main>
    );
  }

  if (!can("ai_agent")) {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface">
        <p className="font-body-md text-on-surface-variant">Skills require the AI Agent capability.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/agent"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
          >
            <ArrowLeft className="size-[18px]" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
            <Sparkles className="size-[18px]" />
          </div>
          <div className="flex-1">
            <h1 className="font-headline-md text-[18px] font-semibold text-primary">Skills</h1>
            <p className="font-body-md text-[13px] text-on-surface-variant">
              Teach the agent a procedure once, reuse it by name in any chat.
            </p>
          </div>
          <Button
            type="button"
            variant="gradient"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-[16px]" />
            New skill
          </Button>
        </div>

        {skills.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-low-alpha py-16 text-center">
            <Sparkles className="mx-auto size-[28px] text-outline" />
            <p className="mt-3 font-body-md text-[14px] text-on-surface-variant">
              No skills yet. Save one from a chat (&quot;save this as a skill&quot;), or create one here directly.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-border-low-alpha/60 bg-surface-container-low p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-label-md text-[15px] font-semibold text-primary">{s.name}</p>
                    <p className="mt-1 font-body-md text-[13.5px] text-on-surface-variant">{s.description}</p>
                    <p className="mt-2 text-[12px] text-on-surface-variant/70">
                      Used {s.usageCount} time{s.usageCount === 1 ? "" : "s"}
                      {s.lastUsedAt ? ` · last used ${new Date(s.lastUsedAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="gradient" size="sm" loading={starting === s.id} onClick={() => handleRunNow(s)}>
                      <Play className="size-[13px]" />
                      Run now
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(s);
                        setFormOpen(true);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
                    >
                      <Pencil className="size-[14px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(s)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                    >
                      <Trash2 className="size-[14px]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit skill" : "New skill"}
        maxWidth="max-w-xl"
      >
        <SkillForm skill={editing} onDone={() => setFormOpen(false)} onSaved={load} />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
      />
    </main>
  );
}
