import { adminDb } from "@/server/db/client";
import { processedWebhooks } from "@/server/db/schema";
import { eq } from "drizzle-orm";

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

  /** SEC-006: Removes the processed marker if side effects failed, allowing retries. */
  async deleteProcessed(eventId: string): Promise<void> {
    await adminDb()
      .delete(processedWebhooks)
      .where(eq(processedWebhooks.eventId, eventId));
  },
};
