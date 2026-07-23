import { withAuth } from "@/server/http/with-api";
import { blueprintService } from "@/server/services/blueprint.service";
import { uuidOr404 } from "@/server/validation/common";
import {
  updateBlueprintSchema,
  type UpdateBlueprintBody,
} from "@/server/validation/blueprint";

/** GET /api/blueprints/[id] — one blueprint (detail/edit). viewer+ */
export const GET = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Blueprint not found");
    return { data: await blueprintService.get(ctx, id) };
  },
  { role: "viewer" },
);

/** PATCH /api/blueprints/[id] — edit name/url/status/answers. recruiter+ */
export const PATCH = withAuth<UpdateBlueprintBody>(
  async ({ ctx, params, body }) => {
    const id = uuidOr404(params.id, "Blueprint not found");
    return { data: await blueprintService.update(ctx, id, body) };
  },
  { role: "recruiter", bodySchema: updateBlueprintSchema },
);

/** DELETE /api/blueprints/[id] — soft-delete. recruiter+ */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Blueprint not found");
    return { data: await blueprintService.remove(ctx, id) };
  },
  { role: "recruiter" },
);
