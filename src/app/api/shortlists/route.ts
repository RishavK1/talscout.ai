import { withAuth } from "@/server/http/with-api";
import { shortlistRepo } from "@/server/repositories/shortlist.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { BadRequest } from "@/server/http/errors";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(255),
});

export const GET = withAuth(async ({ ctx }) => {
  return { data: { shortlists: await shortlistRepo.getByTenant(ctx) } };
});

export const POST = withAuth(
  async ({ ctx, body }) => {
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    const plan = tenant?.plan || "starter";

    if (plan === "starter") {
      const existing = await shortlistRepo.getByTenant(ctx);
      if (existing.length >= 3) {
        throw new BadRequest("Starter plan is limited to 3 shortlists. Please upgrade to create more.");
      }
    }

    const created = await shortlistRepo.create(ctx, body.name);
    return { status: 201, data: created };
  },
  { bodySchema: createSchema }
);
