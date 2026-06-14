import { and, eq } from "drizzle-orm";
import { resumeFiles } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

export const resumeFileRepo = {
  async create(
    ctx: TenantContext,
    input: {
      candidateId: string;
      fileKey: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
    const [row] = await ctx.tx
      .insert(resumeFiles)
      .values({
        tenantId: ctx.tenantId,
        candidateId: input.candidateId,
        fileKey: input.fileKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      })
      .returning();
    return row;
  },

  async getByCandidate(ctx: TenantContext, candidateId: string) {
    const [row] = await ctx.tx
      .select()
      .from(resumeFiles)
      .where(
        and(
          eq(resumeFiles.tenantId, ctx.tenantId),
          eq(resumeFiles.candidateId, candidateId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async setSha(ctx: TenantContext, id: string, sha256: string) {
    await ctx.tx
      .update(resumeFiles)
      .set({ sha256 })
      .where(and(eq(resumeFiles.tenantId, ctx.tenantId), eq(resumeFiles.id, id)));
  },
};
