import type { JobQueue, JobHandler } from "@/server/ports";
import { logger } from "@/server/observability/logger";

/**
 * In-process queue for dev/test: handlers run inline and `enqueue` awaits
 * completion, so tests are deterministic. Prod swaps in Inngest (async, retries,
 * DLQ) behind this same interface.
 */
export class InProcessQueue implements JobQueue {
  private handlers = new Map<string, JobHandler>();

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async enqueue(name: string, payload: unknown): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler registered for job "${name}"`);
    try {
      await handler(payload);
    } catch (err) {
      // A job failure must never bubble into the request that enqueued it.
      logger.error({ err, job: name }, "job_failed");
    }
  }
}
