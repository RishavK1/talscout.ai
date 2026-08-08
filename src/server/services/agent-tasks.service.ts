import type { TenantContext } from "@/server/db/tx";
import { agentTaskRepo } from "@/server/repositories/agent-task.repo";
import { billingService } from "@/server/services/billing.service";
import { NotFound, BadRequest } from "@/server/http/errors";

/** Deliberately NOT a general cron-expression parser — a small, fixed set
 *  of presets computed with plain date math. A full cron parser pulls in a
 *  real dependency and real edge cases (DST, month-end, timezones); for a
 *  first pass, "every hour/day/week" covers the realistic recurring-task
 *  use case ("check my replies every morning", "summarize new leads
 *  weekly") without that risk. Add real cron syntax later if a user
 *  genuinely needs finer control than these three. */
const INTERVAL_MS: Record<string, number> = {
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
};

/** `from` should be the task's OWN previous `nextRunAt`, not the moment
 *  it's actually executing — anchoring to actual execution time would
 *  drift a "daily" task's time-of-day forward a little on every single
 *  run (whenever the 15-minute cron sweep happens to pick it up that day).
 *  The one exception: if the previous scheduled time is more than a full
 *  interval in the past (the sweep didn't run for a while — deploy,
 *  outage), anchoring there would compute a next run that's ALSO already
 *  due, and the task would fire again on the very next sweep tick,
 *  repeating until it "catches up" — a burst nobody wants. In that case,
 *  fall forward to now + one interval instead, same as a fresh task. */
export function nextRunAfter(schedule: string, from: Date = new Date()): Date {
  const ms = INTERVAL_MS[schedule];
  if (!ms) throw new BadRequest(`Unknown schedule "${schedule}" — use hourly, daily, or weekly`);
  const anchored = new Date(from.getTime() + ms);
  return anchored.getTime() < Date.now() ? new Date(Date.now() + ms) : anchored;
}

const MAX_INSTRUCTION = 4_000;

export const agentTasksService = {
  async list(ctx: TenantContext) {
    await billingService.assertCapability(ctx, "ai_agent");
    return await agentTaskRepo.list(ctx);
  },

  async create(
    ctx: TenantContext,
    input: { conversationId: string; instruction: string; schedule?: string; runAt?: string },
  ) {
    await billingService.assertCapability(ctx, "ai_agent");
    if (!input.instruction.trim()) throw new BadRequest("Task instruction is required");
    if (input.instruction.length > MAX_INSTRUCTION) {
      throw new BadRequest(`Task instruction must be under ${MAX_INSTRUCTION} characters`);
    }
    if (!input.schedule && !input.runAt) {
      throw new BadRequest("Provide either a recurring schedule (hourly/daily/weekly) or a one-off run time");
    }
    if (input.schedule && !INTERVAL_MS[input.schedule]) {
      throw new BadRequest(`Unknown schedule "${input.schedule}" — use hourly, daily, or weekly`);
    }

    let runAt: Date | null = null;
    let nextRunAt: Date | null = null;
    if (input.runAt) {
      runAt = new Date(input.runAt);
      if (Number.isNaN(runAt.getTime())) throw new BadRequest("Invalid run time");
      if (runAt.getTime() <= Date.now()) throw new BadRequest("Run time must be in the future");
      nextRunAt = runAt;
    } else if (input.schedule) {
      nextRunAt = nextRunAfter(input.schedule);
    }

    return await agentTaskRepo.create(ctx, {
      conversationId: input.conversationId,
      instruction: input.instruction.trim(),
      schedule: input.schedule ?? null,
      runAt,
      nextRunAt,
    });
  },

  async pause(ctx: TenantContext, id: string) {
    const row = await agentTaskRepo.setStatus(ctx, id, "paused");
    if (!row) throw new NotFound("Task not found");
    return row;
  },

  async resume(ctx: TenantContext, id: string) {
    await billingService.assertCapability(ctx, "ai_agent");
    const existing = await agentTaskRepo.getById(ctx, id);
    if (!existing) throw new NotFound("Task not found");
    const row = await agentTaskRepo.setStatus(ctx, id, "active");
    return row;
  },

  async remove(ctx: TenantContext, id: string) {
    const existing = await agentTaskRepo.getById(ctx, id);
    if (!existing) throw new NotFound("Task not found");
    await agentTaskRepo.remove(ctx, id);
  },
};
