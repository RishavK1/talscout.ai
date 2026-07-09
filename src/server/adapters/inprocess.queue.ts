import type { JobQueue, JobHandler } from "@/server/ports";
import { logger } from "@/server/observability/logger";

/** Payloads that carry their own dispatch time (e.g. paced outreach sends). */
function targetSendAt(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object" || !("targetSendAt" in payload)) {
    return undefined;
  }
  const raw = (payload as { targetSendAt?: unknown }).targetSendAt;
  if (typeof raw !== "string") return undefined;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * In-process queue for dev/test: handlers run inline and `enqueue` awaits
 * completion, so tests are deterministic. Prod swaps in Inngest (async, retries,
 * DLQ) behind this same interface.
 *
 * Jobs carrying a future `targetSendAt` (currently only paced outreach sends,
 * see `scheduleSends` in spintax.ts) are the one exception: they're dispatched
 * via `setTimeout` and `enqueue` returns immediately, mirroring `InngestQueue`
 * (an event send there returns right away too — the real delay happens inside
 * Inngest's `step.sleepUntil`, off the request path). Without this, every send
 * job registered here ran inline back-to-back with zero gap between them, so
 * a whole campaign fired within the same second regardless of the block/jitter
 * schedule computed for it — exactly the all-at-once blast the pacing exists
 * to prevent, and exactly what damaged deliverability in local testing.
 */
export class InProcessQueue implements JobQueue {
  private handlers = new Map<string, JobHandler>();

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async enqueue(name: string, payload: unknown): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler registered for job "${name}"`);

    const run = async () => {
      try {
        await handler(payload);
      } catch (err) {
        // A job failure must never bubble into the request that enqueued it.
        logger.error({ err, job: name }, "job_failed");
      }
    };

    const runAt = targetSendAt(payload);
    const delayMs = runAt ? runAt - Date.now() : 0;
    if (delayMs > 0) {
      setTimeout(() => {
        void run();
      }, delayMs);
      return;
    }
    await run();
  }
}
