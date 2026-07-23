import { withAuth } from "@/server/http/with-api";
import { blueprintService } from "@/server/services/blueprint.service";
import {
  suggestBlueprintSchema,
  type SuggestBlueprintBody,
} from "@/server/validation/blueprint";

/** POST /api/blueprints/suggest — wizard Step 2: research a website and return
 *  AI-suggested intake options. Stateless (persists nothing). LLM-backed, so
 *  rate-limited to protect free-tier quota. recruiter+ */
export const POST = withAuth<SuggestBlueprintBody>(
  async ({ ctx, body }) => {
    return { data: await blueprintService.suggestFromWebsite(ctx, body) };
  },
  {
    role: "recruiter",
    bodySchema: suggestBlueprintSchema,
    rateLimit: { limit: 30, windowSeconds: 3600, keyPrefix: "blueprint_suggest" },
  },
);
