import { createHash } from "node:crypto";
import { withTenantTx } from "@/server/db/tx";
import { candidateRepo } from "@/server/repositories/candidate.repo";
import { resumeFileRepo } from "@/server/repositories/resume-file.repo";
import { resumeProfileSchema } from "@/server/validation/resume-profile";
import { typeMatches } from "@/server/ingestion/file-type";
import { extractResumeText } from "@/server/ingestion/extract-text";
import type { Services } from "@/server/ports";
import type { ResumeProfile } from "@/server/validation/resume-profile";

/** Build the text we embed — richer than the summary alone, so semantic search
 *  matches on title, skills and location too. */
function embeddingText(p: ResumeProfile): string {
  return [
    p.fullName,
    p.currentTitle,
    p.location,
    p.skills?.length ? `Skills: ${p.skills.join(", ")}` : null,
    p.summary,
  ]
    .filter(Boolean)
    .join("\n");
}

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
  let profileData: ResumeProfile | null = null;
  let embedding: number[] | null = null;
  let sha: string | null = null;
  let errorReason: string | null = null;

  try {
    const bytes = await services.storage.getObject(fileKey);
    if (!bytes) throw new IngestError("file_missing");
    sha = createHash("sha256").update(bytes).digest("hex");

    const declaredMime = snapshot.file?.mimeType ?? "text/plain";
    if (!typeMatches(declaredMime, bytes)) throw new IngestError("type_mismatch"); // UP-02

    // Extract real text from PDF/DOCX (binary) before the LLM sees it.
    const text = await extractResumeText(bytes, declaredMime);
    if (!text || text.trim().length < 10) throw new IngestError("empty_document");
    const raw = await services.extractor.extract(text); // may throw (AI-03)
    const parsed = resumeProfileSchema.safeParse(raw);
    if (!parsed.success) throw new IngestError("invalid_extraction"); // AI-02/04
    profileData = parsed.data;

    embedding = await services.embedder.embed(embeddingText(profileData));
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
      phones: profileData.phones ?? null,
      currentTitle: profileData.currentTitle ?? null,
      location: profileData.location ?? null,
      yearsExperience: profileData.yearsExperience ?? null,
      skills: profileData.skills ?? null,
      languages: profileData.languages ?? null,
      certifications: profileData.certifications ?? null,
      workHistory: profileData.workHistory ?? null,
      education: profileData.education ?? null,
      projects: profileData.projects ?? null,
      summary: profileData.summary ?? null,
      embedding: embedding,
      errorReason: null,
    });
  });
}

export const PARSE_RESUME_JOB = "parseResume";
