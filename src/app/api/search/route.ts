import { withAuth } from "@/server/http/with-api";
import { searchService } from "@/server/services/search.service";
import { searchSchema, type SearchInput } from "@/server/validation/search";

/** POST /api/search — semantic + filter hybrid search. viewer+ */
export const POST = withAuth<SearchInput>(
  async ({ ctx, body }) => ({ data: await searchService.search(ctx, body) }),
  { role: "viewer", bodySchema: searchSchema },
);
