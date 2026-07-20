import { withAuth } from "@/server/http/with-api";
import { blueprintService } from "@/server/services/blueprint.service";
import {
  createBlueprintSchema,
  type CreateBlueprintBody,
} from "@/server/validation/blueprint";

/** GET /api/blueprints — list this tenant's blueprints. viewer+ */
export const GET = withAuth(
  async ({ ctx }) => {
    return { data: { blueprints: await blueprintService.list(ctx) } };
  },
  { role: "viewer" },
);

/** POST /api/blueprints — create a draft blueprint shell. recruiter+ */
export const POST = withAuth<CreateBlueprintBody>(
  async ({ ctx, body }) => {
    return { status: 201, data: await blueprintService.create(ctx, body) };
  },
  {
    role: "recruiter",
    bodySchema: createBlueprintSchema,
    rateLimit: { limit: 30, windowSeconds: 3600, keyPrefix: "blueprint_create" },
  },
);
