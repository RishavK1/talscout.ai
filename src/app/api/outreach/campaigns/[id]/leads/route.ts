import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  listLeadsQuerySchema,
  type ListLeadsQuery,
} from "@/server/validation/outreach";

/** GET /api/outreach/campaigns/[id]/leads — leads table, paginated. viewer+ */
export const GET = withAuth<undefined, ListLeadsQuery>(
  async ({ ctx, params, query }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { data: await outreachService.listLeads(ctx, campaignId, query) };
  },
  { role: "viewer", querySchema: listLeadsQuerySchema },
);
