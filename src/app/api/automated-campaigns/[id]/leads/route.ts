import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  listAutomatedLeadsQuerySchema,
  type ListAutomatedLeadsQuery,
} from "@/server/validation/automated-outreach";

/** GET /api/automated-campaigns/[id]/leads?status=&source= — the leads
 *  table, filterable by discovery/send status and by which method found the
 *  email. viewer+ */
export const GET = withAuth<undefined, ListAutomatedLeadsQuery>(
  async ({ ctx, params, query }) => {
    const id = uuidOr404(params.id, "Campaign not found");
    return { data: { leads: await automatedOutreachService.listLeads(ctx, id, query) } };
  },
  { role: "viewer", querySchema: listAutomatedLeadsQuerySchema },
);
