import type {
  OutreachCopywriter,
  OutreachCopyRequest,
  OutreachCopyResult,
} from "@/server/ports";

/** Deterministic mock — no network. Test sentinel `%%THROW%%` in
 *  `lead.businessName` simulates a provider failure. */
export class MockOutreachCopywriter implements OutreachCopywriter {
  async generateEmail(input: OutreachCopyRequest): Promise<OutreachCopyResult> {
    if (input.lead.businessName.includes("%%THROW%%")) {
      throw new Error("mock outreach copywriter provider failure");
    }
    return {
      subject: `Quick question for ${input.lead.businessName}`,
      body:
        `Hi ${input.lead.businessName} team,\n\n` +
        `${input.blueprint.whatWeOffer} ${input.blueprint.differentiator}\n\n` +
        `Worth a quick chat?`,
    };
  }
}
