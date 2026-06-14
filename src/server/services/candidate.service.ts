import { candidateRepo } from "@/server/repositories/candidate.repo";
import { auditRepo } from "@/server/repositories/audit.repo";
import { NotFound } from "@/server/http/errors";
import type { TenantContext } from "@/server/db/tx";
import type {
  CreateCandidateBody,
  UpdateCandidateBody,
  ListCandidatesQuery,
} from "@/server/validation/candidate";

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
    const ok = await candidateRepo.remove(ctx, id);
    if (!ok) throw new NotFound("Candidate not found"); // TEN-02 / IDOR
    await auditRepo.log(ctx, {
      action: "candidate.delete",
      targetType: "candidate",
      targetId: id,
    });
    return { deleted: true };
  },
};
