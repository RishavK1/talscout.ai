import { withAuth } from "@/server/http/with-api";
import { searchService } from "@/server/services/search.service";
import { billingService } from "@/server/services/billing.service";
import { searchSchema, type SearchInput } from "@/server/validation/search";

/** POST /api/search — semantic + filter hybrid search. viewer+ */
export const POST = withAuth<SearchInput>(
  async ({ ctx, body }) => {
    await billingService.assertActiveSubscription(ctx);
    return { data: await searchService.search(ctx, body) };
  },
  { role: "viewer", bodySchema: searchSchema },
);
