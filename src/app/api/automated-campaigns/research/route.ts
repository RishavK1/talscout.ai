import { withAuth } from "@/server/http/with-api";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import {
  researchMarketSchema,
  type ResearchMarketBody,
} from "@/server/validation/automated-outreach";

/** POST /api/automated-campaigns/research — campaign wizard's Research step:
 *  real-time market research for a category+location, grounded in the
 *  selected blueprint. Stateless (persists nothing); LLM/search-backed, so
 *  rate-limited to protect the Perplexity budget. recruiter+ */
export const POST = withAuth<ResearchMarketBody>(
  async ({ ctx, body }) => {
    return { data: await automatedOutreachService.researchMarket(ctx, body) };
  },
  {
    role: "recruiter",
    bodySchema: researchMarketSchema,
    rateLimit: { limit: 30, windowSeconds: 3600, keyPrefix: "automated_campaign_research" },
  },
);
