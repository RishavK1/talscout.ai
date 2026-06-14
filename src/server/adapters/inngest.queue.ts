import { inngest } from "../jobs/inngest-client";
import type { JobQueue, JobHandler } from "@/server/ports";

/** Production-ready job queue sending events to Inngest (async, serverless-safe). */
export class InngestQueue implements JobQueue {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  register(name: string, handler: JobHandler): void {
    // No-op. Inngest registers handlers at the API router endpoint.
  }

  async enqueue(name: string, payload: unknown): Promise<void> {
    // Map camelCase job names (e.g. "parseResume") to dash-cased event names (e.g. "job/parse-resume")
    const eventName = `job/${name.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    await inngest.send({
      name: eventName,
      data: payload as Record<string, unknown>,
    });
  }
}
