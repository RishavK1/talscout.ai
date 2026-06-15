import { withAuth } from "@/server/http/with-api";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { userRepo } from "@/server/repositories/user.repo";
import { tenants, users } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const settingsSchema = z.object({
  workspaceName: z.string().min(1).max(255).optional(),
  logo: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

export const GET = withAuth(async ({ session, ctx }) => {
  const tenant = await tenantRepo.getByIdAdmin(session.tenantId);
  const user = await userRepo.getById(ctx, session.userId);
  return {
    data: {
      workspaceName: tenant?.name || "Workspace",
      logo: tenant?.logo || null,
      avatar: user?.avatar || null,
    },
  };
});

export const PATCH = withAuth(
  async ({ session, ctx, body }) => {
    if (body.workspaceName !== undefined || body.logo !== undefined) {
      const tenantPatch: any = {};
      if (body.workspaceName !== undefined) tenantPatch.name = body.workspaceName;
      if (body.logo !== undefined) tenantPatch.logo = body.logo;
      
      await ctx.tx
        .update(tenants)
        .set(tenantPatch)
        .where(eq(tenants.id, session.tenantId));
    }

    if (body.avatar !== undefined) {
      await ctx.tx
        .update(users)
        .set({ avatar: body.avatar })
        .where(and(eq(users.tenantId, session.tenantId), eq(users.id, session.userId)));
    }

    const updatedTenant = await tenantRepo.getByIdAdmin(session.tenantId);
    const updatedUser = await userRepo.getById(ctx, session.userId);

    return {
      data: {
        workspaceName: updatedTenant?.name || "Workspace",
        logo: updatedTenant?.logo || null,
        avatar: updatedUser?.avatar || null,
      },
    };
  },
  { bodySchema: settingsSchema }
);
