import { z } from "zod";
import { withAuth } from "@/server/http/with-api";
import { candidateService } from "@/server/services/candidate.service";
import { billingService } from "@/server/services/billing.service";
import { auditRepo } from "@/server/repositories/audit.repo";
import { getServices } from "@/server/container";
import { uuidOr404 } from "@/server/validation/common";
import { AppError, BadRequest } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";

const messageSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

/**
 * POST /api/candidates/:id/message — email the candidate. recruiter+.
 * Replies go to the sending recruiter (reply-to), and the send is audited.
 * Rate-limited per tenant so a compromised seat can't blast the database.
 */
export const POST = withAuth<z.infer<typeof messageSchema>>(
  async ({ ctx, session, params, body }) => {
    await billingService.assertActiveSubscription(ctx);
    const candidateId = uuidOr404(params.id, "Candidate not found");
    const candidate = await candidateService.get(ctx, candidateId); // 404s cross-tenant

    const to = candidate.emails?.[0];
    if (!to) throw new BadRequest("This candidate has no email address on file");

    try {
      await getServices().mailer.send({
        to,
        subject: body.subject,
        text: body.message,
        replyTo: session.email,
      });
    } catch (err) {
      // Provider failure: log detail server-side, return a safe retryable error.
      logger.error({ err, candidateId }, "candidate_message_send_failed");
      throw new AppError(502, "email_failed", "Could not send the email — please try again later");
    }

    await auditRepo.log(ctx, {
      action: "candidate.message",
      targetType: "candidate",
      targetId: candidateId,
      metadata: { subject: body.subject },
    });

    return { data: { sent: true, to } };
  },
  {
    role: "recruiter",
    bodySchema: messageSchema,
    rateLimit: { limit: 30, windowSeconds: 3600, keyPrefix: "message" },
  },
);
