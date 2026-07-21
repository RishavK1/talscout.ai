/**
 * Minimal step-checkpointing hook both automated-outreach cron jobs accept.
 * When triggered by Inngest (see api/inngest/route.ts), each call becomes a
 * durable, independently-retryable checkpoint — a crash or timeout mid-tick
 * resumes from the next unfinished step instead of redoing already-completed
 * work (and re-burning rate-limited free-tier API/AI quota for leads/sends
 * that already succeeded). Defaults to running inline (no checkpointing)
 * when called outside Inngest — tests and any direct/manual invocation call
 * the job functions with no step argument at all.
 */
export type StepRun = <T>(id: string, fn: () => Promise<T>) => Promise<T>;

export const inlineStepRun: StepRun = (_id, fn) => fn();
