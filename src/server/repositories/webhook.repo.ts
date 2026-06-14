import { adminDb } from "@/server/db/client";
import { processedWebhooks } from "@/server/db/schema";

export const webhookRepo = {
  /** Returns true if this is the FIRST time we see the event id, false if it
   *  was already processed (PAY-02 idempotency). Atomic via unique PK. */
  async markProcessed(eventId: string): Promise<boolean> {
    const rows = await adminDb()
      .insert(processedWebhooks)
      .values({ eventId })
      .onConflictDoNothing()
      .returning({ eventId: processedWebhooks.eventId });
    return rows.length > 0;
  },
};
