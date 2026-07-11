import { withTenantTx } from "@/server/db/tx";
import { outreachCampaignRepo } from "@/server/repositories/outreach.repo";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";
import { logger } from "@/server/observability/logger";
import type { Services } from "@/server/ports";

export interface FireScheduledCampaignPayload {
  tenantId: string;
  campaignId: string;
  /** ISO timestamp the schedule was set for — echoed back so this run can
   *  tell a fresh wake-up from a stale one (see the staleness check below). */
  scheduledFireAt: string;
}

/**
 * Wakes up (via the Inngest function's `step.sleepUntil` in
 * `src/app/api/inngest/route.ts`) at the campaign's chosen fire time and
 * runs the exact same `outreachService.fireCampaign` flow a manual Fire
 * click triggers — same eligibility check, same send pacing.
 *
 * Re-checks `campaign.scheduledFireAt` against the value carried in this
 * job's own payload before doing anything: if the campaign was deleted, the
 * schedule was canceled, or it was rescheduled to a different time since
 * this job was enqueued, the DB no longer matches and this run is a no-op —
 * the same "re-validate before acting" idempotency pattern already used by
 * `sendOutreachEmail` for pause/stop. No explicit job-cancellation API is
 * needed because of this.
 */
export async function fireScheduledCampaign(
  payload: FireScheduledCampaignPayload,
  services: Services,
): Promise<void> {
  const { tenantId, campaignId, scheduledFireAt } = payload;

  const snapshot = await withTenantTx({ tenantId }, (ctx) =>
    outreachCampaignRepo.getById(ctx, campaignId),
  );
  if (!snapshot) return; // campaign deleted mid-flight
  if (
    !snapshot.scheduledFireAt ||
    snapshot.scheduledFireAt.toISOString() !== scheduledFireAt
  ) {
    return; // canceled or rescheduled since this wake-up was enqueued
  }

  try {
    const { afterCommit } = await withTenantTx({ tenantId }, async (ctx) => {
      // The tenant's plan may have changed since this fire was scheduled
      // (e.g. downgraded off Scale) — re-check scheduler access at wake
      // time; fireCampaign below re-checks outreach_bulk_fire itself.
      await billingService.assertCapability(ctx, "outreach_scheduler");
      await outreachCampaignRepo.clearScheduledFire(ctx, campaignId);
      return outreachService.fireCampaign(
        ctx,
        campaignId,
        snapshot.scheduledFireStepIndex ?? 0,
        (snapshot.scheduledFireLeadIds as string[] | null) ?? undefined,
      );
    });
    await afterCommit();
  } catch (e) {
    // No sender connected / no eligible leads by fire time / campaign no
    // longer ready, etc. — surface it the same way parse-leads-docx surfaces
    // background failures: flip the campaign to "error" with a readable
    // reason instead of silently dropping the scheduled fire.
    logger.error({ err: e, campaignId }, "scheduled_fire_failed");
    await withTenantTx({ tenantId }, async (ctx) => {
      await outreachCampaignRepo.clearScheduledFire(ctx, campaignId);
      await outreachCampaignRepo.setStatus(
        ctx,
        campaignId,
        "error",
        e instanceof Error ? e.message : "scheduled_fire_failed",
      );
    });
  }
}

export const FIRE_SCHEDULED_CAMPAIGN_JOB = "fireScheduledCampaign";
