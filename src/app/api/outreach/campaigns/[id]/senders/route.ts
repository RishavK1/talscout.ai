import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  setCampaignSendersSchema,
  type SetCampaignSendersBody,
} from "@/server/validation/outreach";

/** PUT /api/outreach/campaigns/[id]/senders — pin this campaign's Fire
 *  (immediate or scheduled) to a specific subset of sender accounts. Empty
 *  list clears back to "every active sender account". recruiter+ */
export const PUT = withAuth<SetCampaignSendersBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { data: await outreachService.setCampaignSenders(ctx, campaignId, body) };
  },
  { role: "recruiter", bodySchema: setCampaignSendersSchema },
);
