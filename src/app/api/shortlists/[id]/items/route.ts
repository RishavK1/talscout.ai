import { withAuth } from "@/server/http/with-api";
import { db } from "@/server/db/client";
import { shortlists, shortlistItems, candidates } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { uuidOr404 } from "@/server/validation/common";
import { z } from "zod";
import { NotFound, Conflict } from "@/server/http/errors";

const addSchema = z.object({
  candidateId: z.string().uuid(),
});

export const POST = withAuth<z.infer<typeof addSchema>>(
  async ({ ctx, params, body }) => {
    const shortlistId = uuidOr404(params.id, "Shortlist not found");
    const candidateId = body.candidateId;

    // 1. Verify candidate exists and belongs to the tenant
    const candidate = await db()
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.tenantId, ctx.tenantId)
        )
      )
      .limit(1);

    if (candidate.length === 0) {
      throw new NotFound("Candidate not found");
    }

    // 2. Verify shortlist exists and belongs to the tenant
    const shortlist = await db()
      .select()
      .from(shortlists)
      .where(
        and(
          eq(shortlists.id, shortlistId),
          eq(shortlists.tenantId, ctx.tenantId)
        )
      )
      .limit(1);

    if (shortlist.length === 0) {
      throw new NotFound("Shortlist not found");
    }

    // 3. Check if already added
    const existing = await db()
      .select()
      .from(shortlistItems)
      .where(
        and(
          eq(shortlistItems.tenantId, ctx.tenantId),
          eq(shortlistItems.shortlistId, shortlistId),
          eq(shortlistItems.candidateId, candidateId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Conflict("Candidate is already in this shortlist");
    }

    // 4. Insert shortlist item
    const [inserted] = await db()
      .insert(shortlistItems)
      .values({
        tenantId: ctx.tenantId,
        shortlistId,
        candidateId,
      })
      .returning();

    return { status: 201, data: inserted };
  },
  { bodySchema: addSchema, role: "recruiter" }
);
