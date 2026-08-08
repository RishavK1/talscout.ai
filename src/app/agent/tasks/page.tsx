"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Pause, Play, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Task {
  id: string;
  instruction: string;
  schedule: string | null;
  runAt: string | null;
  status: "active" | "paused" | "done" | "error";
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

const STATUS_TONE: Record<Task["status"], "active" | "invited" | "draft" | "error"> = {
  active: "active",
  paused: "draft",
  done: "invited",
  error: "error",
};

export default function AgentTasksPage() {
  const { can, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const load = async () => {
    try {
      const res = await api.get<{ tasks: Task[] }>("/api/agent/tasks");
      setTasks(res.tasks);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load tasks");
      setTasks([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (task: Task) => {
    setBusyId(task.id);
    try {
      await api.patch(`/api/agent/tasks/${task.id}`, { status: task.status === "active" ? "paused" : "active" });
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (task: Task) => {
    setBusyId(task.id);
    try {
      await api.post(`/api/agent/tasks/${task.id}/run`, {});
      toast.success("Running now — check the conversation shortly for the result");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start the task");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/agent/tasks/${deleteTarget.id}`);
      toast.success("Task deleted");
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    }
  };

  if (authLoading || tasks === null) {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface">
        <Loader2 className="size-[24px] animate-spin text-on-surface-variant" />
      </main>
    );
  }

  if (!can("ai_agent")) {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface">
        <p className="font-body-md text-on-surface-variant">Scheduled tasks require the AI Agent capability.</p>
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
            <Clock className="size-[18px]" />
          </div>
          <div>
            <h1 className="font-headline-md text-[18px] font-semibold text-primary">Scheduled tasks</h1>
            <p className="font-body-md text-[13px] text-on-surface-variant">
              Ask the agent to schedule something (&quot;check my replies every morning&quot;) — it shows up here.
            </p>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-low-alpha py-16 text-center">
            <Clock className="mx-auto size-[28px] text-outline" />
            <p className="mt-3 font-body-md text-[14px] text-on-surface-variant">
              No scheduled tasks yet. Ask the agent in chat to set one up.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-2xl border border-border-low-alpha/60 bg-surface-container-low p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <StatusBadge tone={STATUS_TONE[t.status]}>{t.status}</StatusBadge>
                      {t.schedule && (
                        <span className="font-label-md text-[11px] uppercase tracking-wide text-on-surface-variant">
                          {t.schedule}
                        </span>
                      )}
                    </div>
                    <p className="font-body-md text-[13.5px] text-on-surface">{t.instruction}</p>
                    <p className="mt-2 text-[12px] text-on-surface-variant/70">
                      {t.nextRunAt && t.status === "active" ? `Next run ${new Date(t.nextRunAt).toLocaleString()}` : null}
                      {t.lastRunAt ? ` · last ran ${new Date(t.lastRunAt).toLocaleString()}` : ""}
                    </p>
                    {t.lastError && (
                      <p className="mt-1.5 text-[12px] text-error">{t.lastError}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {t.status !== "done" && (
                      <Button type="button" variant="outline" size="sm" loading={busyId === t.id} onClick={() => runNow(t)}>
                        Run now
                      </Button>
                    )}
                    {(t.status === "active" || t.status === "paused") && (
                      <button
                        type="button"
                        onClick={() => toggle(t)}
                        disabled={busyId === t.id}
                        title={t.status === "active" ? "Pause" : "Resume"}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                      >
                        {t.status === "active" ? <Pause className="size-[14px]" /> : <Play className="size-[14px]" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(t)}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete this scheduled task?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
      />
    </main>
  );
}
