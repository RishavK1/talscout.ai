import { withAuth } from "@/server/http/with-api";
import { blueprintService } from "@/server/services/blueprint.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  generateBlueprintSchema,
  type GenerateBlueprintBody,
} from "@/server/validation/blueprint";

/** POST /api/blueprints/[id]/generate — wizard Step 3 / regenerate: turn the
 *  confirmed intake answers into the structured blueprint and persist it.
 *  Optional inline `intakeAnswers` override the stored ones. LLM-backed →
 *  rate-limited. recruiter+ */
export const POST = withAuth<GenerateBlueprintBody>(
  async ({ ctx, params, body }) => {
    const id = uuidOr404(params.id, "Blueprint not found");
    return { data: await blueprintService.generate(ctx, id, body?.intakeAnswers) };
  },
  {
    role: "recruiter",
    bodySchema: generateBlueprintSchema,
    rateLimit: { limit: 30, windowSeconds: 3600, keyPrefix: "blueprint_generate" },
  },
);
