import { withAuth } from "@/server/http/with-api";
import { connectionsService } from "@/server/services/connections.service";
import { uuidOr404 } from "@/server/validation/common";

/** DELETE /api/connections/[id] — disconnect an app. recruiter+ */
export const DELETE = withAuth(
  async ({ ctx, params }) => {
    const id = uuidOr404(params.id, "Connection not found");
    await connectionsService.disconnect(ctx, id);
    return { data: { ok: true } };
  },
  { role: "recruiter" },
);
