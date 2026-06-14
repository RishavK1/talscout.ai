import { candidateRepo } from "@/server/repositories/candidate.repo";
import { resumeFileRepo } from "@/server/repositories/resume-file.repo";
import { usageRepo, currentMonthStart } from "@/server/repositories/usage.repo";
import { auditRepo } from "@/server/repositories/audit.repo";
import { getServices } from "@/server/container";
import { MAX_UPLOAD_BYTES, extensionFor } from "@/server/ingestion/file-type";
import { PARSE_RESUME_JOB } from "@/server/jobs/parse-resume";
import {
  PayloadTooLarge,
  PaymentRequired,
  NotFound,
  BadRequest,
} from "@/server/http/errors";
import type { TenantContext } from "@/server/db/tx";
import type {
  RequestUploadBody,
  CompleteUploadBody,
} from "@/server/validation/upload";

const MONTHLY_UPLOAD_LIMIT = 1000; // abuse guardrail (plan-tiered in B6)

export const ingestionService = {
  async requestUpload(ctx: TenantContext, body: RequestUploadBody) {
    if (body.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLarge("File exceeds the 10MB limit"); // UP-03
    }

    const window = currentMonthStart();
    const used = await usageRepo.getCount(ctx, "uploads", window);
    if (used >= MONTHLY_UPLOAD_LIMIT) {
      throw new PaymentRequired("Monthly upload quota reached"); // UP-06
    }

    const candidate = await candidateRepo.create(ctx, { status: "processing" });

    // Key is built ENTIRELY from server-controlled values — the client filename
    // never enters the path, so traversal is impossible (UP-09).
    const fileKey = `tenants/${ctx.tenantId}/${candidate.id}/${globalThis.crypto.randomUUID()}${extensionFor(body.contentType)}`;

    await resumeFileRepo.create(ctx, {
      candidateId: candidate.id,
      fileKey,
      mimeType: body.contentType,
      sizeBytes: body.sizeBytes,
    });
    await usageRepo.increment(ctx, "uploads", window);

    const presign = await getServices().storage.createPresignedUpload({
      key: fileKey,
      contentType: body.contentType,
      maxBytes: MAX_UPLOAD_BYTES,
    });

    await auditRepo.log(ctx, {
      action: "upload.request",
      targetType: "candidate",
      targetId: candidate.id,
    });

    return { candidateId: candidate.id, fileKey, uploadUrl: presign.uploadUrl };
  },

  async completeUpload(ctx: TenantContext, body: CompleteUploadBody) {
    const candidate = await candidateRepo.getById(ctx, body.candidateId);
    if (!candidate) throw new NotFound("Candidate not found"); // IDOR → 404

    const file = await resumeFileRepo.getByCandidate(ctx, body.candidateId);
    if (!file || file.fileKey !== body.fileKey) {
      throw new BadRequest("Unknown file for this candidate");
    }

    const exists = await getServices().storage.exists(body.fileKey);
    if (!exists) throw new BadRequest("File was not uploaded"); // UP-08

    await auditRepo.log(ctx, {
      action: "upload.complete",
      targetType: "candidate",
      targetId: candidate.id,
    });

    await getServices().queue.enqueue(PARSE_RESUME_JOB, {
      tenantId: ctx.tenantId,
      candidateId: candidate.id,
      fileKey: body.fileKey,
    });

    return { candidateId: candidate.id, status: "queued" as const };
  },
};
