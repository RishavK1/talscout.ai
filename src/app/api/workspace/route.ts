import { z } from "zod";
import { withAuth } from "@/server/http/with-api";
import { workspaceService } from "@/server/services/workspace.service";

/** The client must send the literal confirmation string — never trust a bare
 *  DELETE call for an action this irreversible (VAL/AUTH fail-closed). */
const deleteWorkspaceSchema = z.object({
  confirm: z.literal("DELETE"),
});

/** DELETE /api/workspace — permanently delete the tenant and all its data. admin only. */
export const DELETE = withAuth<z.infer<typeof deleteWorkspaceSchema>>(
  async ({ ctx }) => ({ data: await workspaceService.deleteWorkspace(ctx) }),
  { role: "admin", bodySchema: deleteWorkspaceSchema },
);
