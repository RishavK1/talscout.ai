import { logger } from "@/server/observability/logger";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Tries each configured sub-finder in order, stopping at the first hit. Each
 * sub-finder is independently try/caught so one provider's outage or
 * exhausted free-tier quota doesn't break the whole chain. Returns null
 * (never throws) on a total miss — callers map that directly to lead status
 * "no_email", enforcing the strict rule that a lead with no findable email
 * must never enter the send pipeline.
 */
export class WaterfallEmailFinder implements EmailFinder {
  constructor(private finders: EmailFinder[]) {}

  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    for (const finder of this.finders) {
      try {
        const result = await finder.find(args);
        if (result) return result;
      } catch (err) {
        logger.warn({ err }, "waterfall_email_finder_sub_failed_continuing");
      }
    }
    return null;
  }
}
