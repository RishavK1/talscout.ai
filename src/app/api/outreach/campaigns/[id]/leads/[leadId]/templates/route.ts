import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  setLeadTemplatesSchema,
  type SetLeadTemplatesBody,
} from "@/server/validation/outreach";

/** GET /api/outreach/campaigns/[id]/leads/[leadId]/templates — the Day 0/3/7
 *  subject+body this lead will actually be sent (its own copy where set,
 *  else the campaign's fallback sequence). Backs the leads-table email
 *  view/edit modal. viewer+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    const leadId = uuidOr404(params.leadId, "Lead not found");
    return {
      data: await outreachService.getLeadTemplates(ctx, campaignId, leadId),
    };
  },
  { role: "viewer" },
);

/** PUT .../templates — saves edited subject/body as this lead's own copy.
 *  recruiter+ */
export const PUT = withAuth<SetLeadTemplatesBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    const leadId = uuidOr404(params.leadId, "Lead not found");
    return {
      data: await outreachService.setLeadTemplates(ctx, campaignId, leadId, body),
    };
  },
  { role: "recruiter", bodySchema: setLeadTemplatesSchema },
);
