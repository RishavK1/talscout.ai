import { withAuth } from "@/server/http/with-api";
import { candidateService } from "@/server/services/candidate.service";
import { billingService } from "@/server/services/billing.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  updateCandidateSchema,
  type UpdateCandidateBody,
} from "@/server/validation/candidate";

/** GET /api/candidates/:id — viewer+ (cross-tenant → 404) */
export const GET = withAuth(
  async ({ ctx, params }) => {
    await billingService.assertActiveSubscription(ctx);
    return {
      data: await candidateService.get(ctx, uuidOr404(params.id, "Candidate not found")),
    };
  },
  { role: "viewer" },
);

/** PATCH /api/candidates/:id — recruiter+ */
export const PATCH = withAuth<UpdateCandidateBody>(
  async ({ ctx, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    return {
      data: await candidateService.update(
        ctx,
        uuidOr404(params.id, "Candidate not found"),
        body,
      ),
    };
  },
  { role: "recruiter", bodySchema: updateCandidateSchema },
);

/** DELETE /api/candidates/:id — admin only */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    await billingService.assertActiveSubscription(ctx);
    return {
      data: await candidateService.remove(
        ctx,
        uuidOr404(params.id, "Candidate not found"),
      ),
    };
  },
  { role: "admin" },
);
