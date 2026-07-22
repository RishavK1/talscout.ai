import type {
  OutreachCopywriter,
  OutreachCopyRequest,
  OutreachCopyResult,
} from "@/server/ports";

/** Deterministic mock — no network. Test sentinel `%%THROW%%` in
 *  `lead.businessName` simulates a provider failure. Distinct, deterministic
 *  content per `followUp.stepIndex` so tests can assert 3 genuinely
 *  different Day 0/3/7 rows exist, not the same email repeated. */
export class MockOutreachCopywriter implements OutreachCopywriter {
  async generateEmail(input: OutreachCopyRequest): Promise<OutreachCopyResult> {
    if (input.lead.businessName.includes("%%THROW%%")) {
      throw new Error("mock outreach copywriter provider failure");
    }
    if (input.followUp) {
      return {
        subject: `Re: Quick question for ${input.lead.businessName}`,
        body:
          input.followUp.stepIndex === 1
            ? `Hi ${input.lead.businessName} team,\n\nJust bumping this up in case it got buried — still worth a quick chat about ${input.blueprint.whatWeOffer}?`
            : `Hi ${input.lead.businessName} team,\n\nLast note from me — happy to help with ${input.blueprint.whatWeOffer} whenever it's useful.`,
      };
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
