import type { LeadQualifier, LeadQualifierInput, LeadQualifierResult } from "@/server/ports";

/** Deterministic mock — no network, no site fetch. Test sentinels (in
 *  `lead.website`): `%%THROW%%` simulates a provider failure; `%%POLISHED%%`
 *  simulates a lead whose site clearly already has what the campaign is
 *  looking to avoid (disqualified). Everything else qualifies, matching the
 *  real adapters' "default to qualified when unsure" bias. */
export class MockLeadQualifier implements LeadQualifier {
  async qualify(input: LeadQualifierInput): Promise<LeadQualifierResult> {
    const website = input.lead.website ?? "";
    if (website.includes("%%THROW%%")) {
      throw new Error("mock lead qualifier provider failure");
    }
    if (website.includes("%%POLISHED%%")) {
      return { qualified: false, reason: "Mock: site already looks polished/professional" };
    }
    return { qualified: true, reason: "Mock: no disqualifying signal found" };
  }
}
