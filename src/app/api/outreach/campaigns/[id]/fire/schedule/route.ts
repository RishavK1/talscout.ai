import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  scheduleFireSchema,
  type ScheduleFireBody,
} from "@/server/validation/outreach";

/** POST /api/outreach/campaigns/[id]/fire/schedule — schedule one sequence
 *  step to fire at a future time instead of immediately. recruiter+ */
export const POST = withAuth<ScheduleFireBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const campaignId = uuidOr404(params.id, "Campaign not found");
    const { result, afterCommit } = await outreachService.scheduleFire(
      ctx,
      campaignId,
      body.stepIndex,
      new Date(body.scheduledFireAt),
      body.leadIds,
    );
    return { data: result, afterCommit };
  },
  { role: "recruiter", bodySchema: scheduleFireSchema },
);

/** DELETE /api/outreach/campaigns/[id]/fire/schedule — cancel a pending
 *  scheduled fire. recruiter+ */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    const campaignId = uuidOr404(params.id, "Campaign not found");
    return { data: await outreachService.cancelScheduledFire(ctx, campaignId) };
  },
  { role: "recruiter" },
);
