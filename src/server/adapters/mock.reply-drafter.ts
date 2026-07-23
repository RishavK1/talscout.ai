import type { ReplyDrafter, ReplyDraftRequest, ReplyDraftResult } from "@/server/ports";

/** Deterministic mock — no network. Test sentinel `%%THROW%%` in
 *  `lead.businessName` simulates a provider failure. */
export class MockReplyDrafter implements ReplyDrafter {
  async draft(input: ReplyDraftRequest): Promise<ReplyDraftResult> {
    if (input.lead.businessName.includes("%%THROW%%")) {
      throw new Error("mock reply drafter provider failure");
    }
    return {
      body: `Thanks for getting back to us! ${input.blueprint.differentiator} Happy to share more.`,
      reasoning: "Lead replied with interest; acknowledging and offering a next step.",
      confidence: 0.8,
    };
  }
}
