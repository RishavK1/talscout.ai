import { logger } from "@/server/observability/logger";
import { assessContact, CONTACT_TIER_RANK } from "@/server/lib/email-identity";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/**
 * Tries each configured sub-finder in order, KEEPING THE BEST result across
 * all of them by contact tier (named person > decision-maker role > generic
 * shared inbox — see email-identity.ts), not simply the first hit. Each
 * sub-finder is independently try/caught so one provider's outage or
 * exhausted free-tier quota doesn't break the whole chain.
 *
 * Stops early once a decision-maker-or-better contact is found — no reason
 * to keep spending budget (free-tier credits, the paid AI rung) once a
 * genuinely good contact is in hand. If every finder only ever produces a
 * generic address (or nothing), the best generic candidate found is
 * returned rather than nothing — the founder's own call: "generic allowed
 * last, but only after real sources had their chance to do better."
 *
 * Returns null (never throws) on a total miss — callers map that directly
 * to lead status "no_email", enforcing the strict rule that a lead with no
 * findable email must never enter the send pipeline.
 */
export class WaterfallEmailFinder implements EmailFinder {
  constructor(private finders: EmailFinder[]) {}

  async find(args: {
    website?: string;
    businessName: string;
    budgetScopeId?: string;
  }): Promise<EmailFinderResult | null> {
    let best: EmailFinderResult | null = null;
    let bestRank = 0;

    for (const finder of this.finders) {
      let result: EmailFinderResult | null;
      try {
        result = await finder.find(args);
      } catch (err) {
        logger.warn({ err }, "waterfall_email_finder_sub_failed_continuing");
        continue;
      }
      if (!result) continue;

      const assessment = assessContact({
        email: result.email,
        businessName: args.businessName,
        website: args.website,
      });
      if (assessment.tier === "reject") continue; // never accept — keep trying other sources

      const rank = CONTACT_TIER_RANK[assessment.tier];
      if (rank > bestRank) {
        best = result;
        bestRank = rank;
      }
      if (bestRank >= CONTACT_TIER_RANK.decision_maker) break; // good enough — stop spending budget
    }

    return best;
  }
}
