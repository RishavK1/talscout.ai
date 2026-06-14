import { createHash } from "node:crypto";
import { withTenantTx } from "@/server/db/tx";
import { candidateRepo } from "@/server/repositories/candidate.repo";
import { resumeFileRepo } from "@/server/repositories/resume-file.repo";
import { resumeProfileSchema } from "@/server/validation/resume-profile";
import { typeMatches } from "@/server/ingestion/file-type";
import type { Services } from "@/server/ports";

export interface ParseResumePayload {
  tenantId: string;
  candidateId: string;
  fileKey: string;
}

class IngestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Parse a résumé: download → verify → extract → embed → persist.
 * Slow work (download/extract/embed) runs OUTSIDE the DB transaction; only the
 * final write is transactional (prod-safe — no long-held locks).
 * Idempotent (CONC-04): a second run on an already-`ready` candidate is a no-op.
 */
export async function parseResume(
  payload: ParseResumePayload,
  services: Services,
): Promise<void> {
  const { tenantId, candidateId, fileKey } = payload;

  // 1) Read current state (short tx, RLS-scoped)
  const snapshot = await withTenantTx({ tenantId }, async (ctx) => {
    const candidate = await candidateRepo.getById(ctx, candidateId);
    const file = await resumeFileRepo.getByCandidate(ctx, candidateId);
    return { candidate, file };
  });
  if (!snapshot.candidate) return; // deleted mid-flight (CONC-05)
  if (snapshot.candidate.status === "ready") return; // idempotent (CONC-04)

  // 2) Heavy work, no tx held
  let profileData: import("@/server/validation/resume-profile").ResumeProfile | null = null;
  let embedding: number[] | null = null;
  let sha: string | null = null;
  let errorReason: string | null = null;

  try {
    const bytes = await services.storage.getObject(fileKey);
    if (!bytes) throw new IngestError("file_missing");
    sha = createHash("sha256").update(bytes).digest("hex");

    const declaredMime = snapshot.file?.mimeType ?? "text/plain";
    if (!typeMatches(declaredMime, bytes)) throw new IngestError("type_mismatch"); // UP-02

    const text = bytes.toString("utf8");
    const raw = await services.extractor.extract(text); // may throw (AI-03)
    const parsed = resumeProfileSchema.safeParse(raw);
    if (!parsed.success) throw new IngestError("invalid_extraction"); // AI-02/04
    profileData = parsed.data;

    embedding = await services.embedder.embed(profileData.summary ?? text);
  } catch (e) {
    errorReason = e instanceof IngestError ? e.code : "extraction_failed";
  }

  // 3) Persist result (short tx)
  await withTenantTx({ tenantId }, async (ctx) => {
    if (errorReason || !profileData) {
      await candidateRepo.update(ctx, candidateId, {
        status: "error",
        errorReason: errorReason ?? "extraction_failed",
      });
      return;
    }
    if (sha && snapshot.file) await resumeFileRepo.setSha(ctx, snapshot.file.id, sha);
    await candidateRepo.update(ctx, candidateId, {
      status: "ready",
      fullName: profileData.fullName,
      emails: profileData.emails ?? null,
      currentTitle: profileData.currentTitle ?? null,
      location: profileData.location ?? null,
      skills: profileData.skills ?? null,
      summary: profileData.summary ?? null,
      embedding: embedding,
      errorReason: null,
    });
  });
}

export const PARSE_RESUME_JOB = "parseResume";
