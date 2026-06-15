import { candidateRepo } from "@/server/repositories/candidate.repo";
import { auditRepo } from "@/server/repositories/audit.repo";
import { NotFound } from "@/server/http/errors";
import type { TenantContext } from "@/server/db/tx";
import type {
  CreateCandidateBody,
  UpdateCandidateBody,
  ListCandidatesQuery,
} from "@/server/validation/candidate";
import { getServices } from "@/server/container";
import { resumeFiles } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

export const candidateService = {
  async create(ctx: TenantContext, body: CreateCandidateBody) {
    // Manual entries are immediately "ready" (no parse needed). Status is
    // server-controlled, never taken from the client.
    const candidate = await candidateRepo.create(ctx, {
      ...body,
      status: "ready",
    });
    await auditRepo.log(ctx, {
      action: "candidate.create",
      targetType: "candidate",
      targetId: candidate.id,
    });
    return candidate;
  },

  async get(ctx: TenantContext, id: string) {
    const candidate = await candidateRepo.getById(ctx, id);
    if (!candidate) throw new NotFound("Candidate not found"); // TEN-01
    return candidate;
  },

  async list(ctx: TenantContext, query: ListCandidatesQuery) {
    const { rows, limit, offset } = await candidateRepo.list(ctx, query);
    const total = await candidateRepo.count(ctx, { status: query.status });
    return { candidates: rows, total, limit, offset };
  },

  async update(ctx: TenantContext, id: string, body: UpdateCandidateBody) {
    const candidate = await candidateRepo.update(ctx, id, body);
    if (!candidate) throw new NotFound("Candidate not found"); // TEN-02 / IDOR
    await auditRepo.log(ctx, {
      action: "candidate.update",
      targetType: "candidate",
      targetId: id,
      metadata: { fields: Object.keys(body) },
    });
    return candidate;
  },

  async remove(ctx: TenantContext, id: string) {
    // SEC-008: Retrieve file keys associated with the candidate before deletion
    const files = await ctx.tx
      .select({ fileKey: resumeFiles.fileKey })
      .from(resumeFiles)
      .where(
        and(
          eq(resumeFiles.candidateId, id),
          eq(resumeFiles.tenantId, ctx.tenantId)
        )
      );

    const ok = await candidateRepo.remove(ctx, id);
    if (!ok) throw new NotFound("Candidate not found"); // TEN-02 / IDOR

    // Clean up corresponding storage objects
    for (const f of files) {
      try {
        await getServices().storage.deleteObject(f.fileKey);
      } catch (err) {
        console.error(`Failed to clean up storage for key ${f.fileKey}:`, err);
      }
    }

    await auditRepo.log(ctx, {
      action: "candidate.delete",
      targetType: "candidate",
      targetId: id,
    });
    return { deleted: true };
  },
};
