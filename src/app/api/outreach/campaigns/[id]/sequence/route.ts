import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import { setSequenceSchema, type SetSequenceBody } from "@/server/validation/outreach";

/** PUT /api/outreach/campaigns/[id]/sequence — persist the Day 0/3/7 subject
 *  + body templates from the sequence editor. recruiter+ */
export const PUT = withAuth<SetSequenceBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { data: await outreachService.setSequence(ctx, campaignId, body) };
  },
  { role: "recruiter", bodySchema: setSequenceSchema },
);
