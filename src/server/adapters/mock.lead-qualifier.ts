import type { LeadQualifier, LeadQualifierInput, LeadQualifierResult } from "@/server/ports";

/** Deterministic mock — no network, no site fetch. This qualifier is ONLY
 *  ever consulted for one narrow judgment: "no_or_weak_site" + this lead HAS
 *  a website — so the real adapters default to DISQUALIFIED when unsure
 *  (see gemini/openrouter/perplexity.lead-qualifier.ts), qualifying only a
 *  site with an explicit weak/thin/broken signal. Test sentinels (in
 *  `lead.website`): `%%THROW%%` simulates a provider failure; `%%POLISHED%%`
 *  simulates a clearly good site (disqualified); `%%WEAKSITE%%` simulates
 *  the narrow exception — a genuinely thin/broken site (qualified).
 *  Everything else disqualifies, matching the tightened real-adapter bias. */
export class MockLeadQualifier implements LeadQualifier {
  async qualify(input: LeadQualifierInput): Promise<LeadQualifierResult> {
    const website = input.lead.website ?? "";
    if (website.includes("%%THROW%%")) {
      throw new Error("mock lead qualifier provider failure");
    }
    if (website.includes("%%WEAKSITE%%")) {
      return { qualified: true, reason: "Mock: site is genuinely thin/broken — narrow exception" };
    }
    if (website.includes("%%POLISHED%%")) {
      return { qualified: false, reason: "Mock: site already looks polished/professional" };
    }
    return { qualified: false, reason: "Mock: site has real content — disqualified (high bar to qualify)" };
  }
}
