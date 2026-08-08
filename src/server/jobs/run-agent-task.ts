import { withTenantTx } from "@/server/db/tx";
import { agentTaskRepo } from "@/server/repositories/agent-task.repo";
import { agentRepo } from "@/server/repositories/agent.repo";
import { buildInHouseTools } from "@/server/agent/tools";
import { buildComposioTools } from "@/server/agent/composio-tools";
import { runAgentTaskHeadless } from "@/server/agent/run-task-headless";
import { buildSystemPrompt } from "@/server/services/agent.service";
import { nextRunAfter } from "@/server/services/agent-tasks.service";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import type { agentTasks } from "@/server/db/schema";

export const RUN_DUE_AGENT_TASKS_JOB = "runDueAgentTasks";
export const RUN_AGENT_TASK_NOW_JOB = "runAgentTaskNow";

const TASK_PREAMBLE = `You are running as a SCHEDULED BACKGROUND TASK, not a live chat — there is no user watching to answer follow-up questions or approve anything right now. The instructions below normally tell you to pause and wait for the user's explicit "yes" before a sensitive action (sending, deleting, sharing, activating) — that doesn't apply here: scheduling this task WAS the user's authorization to do exactly what the instruction says, every time it runs, unattended. Do your best with reasonable defaults for anything unspecified. Only stop short (rather than guessing) if the instruction is genuinely ambiguous about something destructive/costly in a way that could cause real harm if you guessed wrong (e.g. "send an email" with no clear recipient anywhere in reach) — in that case, don't act, and clearly explain in your report what needs to be clarified (e.g. by editing the task's instruction). Otherwise, complete the instruction and report what you did.\n\n`;

type Task = typeof agentTasks.$inferSelect;

/** Cron-triggered sweep (see the Inngest function registration in
 *  src/app/api/inngest/route.ts) — mirrors run-automated-campaign.ts's
 *  runAutomatedCampaigns exactly: one task's failure is isolated (logged,
 *  that task marked "error") and never blocks the others in the same tick. */
export async function runDueAgentTasks(): Promise<void> {
  const due = await agentTaskRepo.listDueAdmin();
  for (const task of due) {
    await runOneAgentTaskIsolated(task);
  }
}

/** Runs a single task immediately — used when schedule_task creates a
 *  one-off task due very soon, or wired to the tasks page's explicit "Run
 *  now" button, which is shown for active/paused/error tasks (a paused or
 *  previously-failed task is exactly what a user wants to manually retry).
 *  Re-fetches the task first since time may have passed between enqueueing
 *  and running — only a task that's gone (deleted) or already "done" is a
 *  true no-op; the UI hides the button for "done" but the job stays
 *  defensive here too in case it's triggered another way. */
export async function runAgentTaskNow(taskId: string): Promise<void> {
  const task = await agentTaskRepo.getByIdAdmin(taskId);
  if (!task || task.status === "done") {
    logger.warn({ taskId }, "agent_task_run_now_skipped_missing_or_done");
    return;
  }
  await runOneAgentTaskIsolated(task);
}

async function runOneAgentTaskIsolated(task: Task): Promise<void> {
  try {
    await runOneAgentTask(task);
  } catch (err) {
    logger.error({ err, taskId: task.id }, "agent_task_run_failed");
    await agentTaskRepo.setErrorAdmin(task.id, err instanceof Error ? err.message : "agent_task_run_failed");
  }
}

async function runOneAgentTask(task: Task): Promise<void> {
  const identity = { tenantId: task.tenantId, userId: task.userId, conversationId: task.conversationId };

  const inHouseTools = buildInHouseTools(identity);
  const [composioTools, systemBase] = await Promise.all([
    buildComposioTools(identity, getEnv().APP_URL, Object.keys(inHouseTools).length),
    withTenantTx(identity, (ctx) => buildSystemPrompt(ctx)),
  ]);
  const tools = { ...inHouseTools, ...composioTools };

  const { text, toolCallCount } = await runAgentTaskHeadless({
    system: TASK_PREAMBLE + systemBase,
    instruction: task.instruction,
    tools,
  });

  // Some models finish a tool-calling turn without a closing text summary
  // (seen with both a free OpenRouter model and, occasionally, Gemini) —
  // the tool calls still ran for real in that case, so say so plainly
  // instead of posting a bare, confusing "(no response)".
  const resultText =
    text ||
    (toolCallCount > 0
      ? `Done — ran ${toolCallCount} action${toolCallCount === 1 ? "" : "s"}, but the model didn't return a closing summary this time.`
      : "The model didn't take any action or return a response for this run.");

  // Posted into the same conversation the task was created from, so the
  // user finds it exactly where they'd expect — opening that chat later
  // shows what the background run did, same as any other message.
  await withTenantTx(identity, (ctx) =>
    agentRepo.addMessage(ctx, {
      conversationId: task.conversationId,
      role: "assistant",
      parts: [{ type: "text", text: `**Scheduled task ran:** ${task.instruction}\n\n${resultText}` }],
    }),
  );
  await withTenantTx(identity, (ctx) => agentRepo.touchConversation(ctx, task.conversationId));

  await agentTaskRepo.recordRunAdmin(task.id, {
    // Anchored to the PREVIOUS nextRunAt (when it was due), not to actual
    // execution time — see nextRunAfter's own doc comment for why.
    nextRunAt: task.schedule ? nextRunAfter(task.schedule, task.nextRunAt ?? undefined) : null,
    // A manual "Run now" on a PAUSED recurring task (see runAgentTaskNow's
    // doc comment) stays paused afterward — running it once to check the
    // output shouldn't silently resume its future schedule too. Retrying
    // an "error" task, by contrast, is meant to clear the error and put it
    // back on schedule, so that case (and the normal active/cron path)
    // both land on "active".
    status: task.schedule ? (task.status === "paused" ? "paused" : "active") : "done",
  });
}
