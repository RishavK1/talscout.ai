import { withAuth } from "@/server/http/with-api";
import { outreachService } from "@/server/services/outreach.service";
import { billingService } from "@/server/services/billing.service";

/** GET /api/outreach/senders/gmail/oauth/start — returns the Google consent
 *  URL for the frontend to navigate the browser to. recruiter+ */
export const GET = withAuth(
  async ({ ctx, session, req }) => {
    await billingService.assertActiveSubscription(ctx);
    const appOrigin = new URL(req.url).origin;
    const url = outreachService.buildGmailOAuthUrl(ctx.tenantId, session.userId, appOrigin);
    return { data: { url } };
  },
  { role: "recruiter" },
);
