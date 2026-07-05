import { withAuth } from "@/server/http/with-api";
import { candidateService } from "@/server/services/candidate.service";
import { billingService } from "@/server/services/billing.service";
import { resumeFileRepo } from "@/server/repositories/resume-file.repo";
import { getServices } from "@/server/container";
import { uuidOr404 } from "@/server/validation/common";
import { extensionFor } from "@/server/ingestion/file-type";
import { NotFound } from "@/server/http/errors";

/**
 * GET /api/candidates/:id/resume — download the original résumé file. viewer+
 * Résumés are capped at 10MB (UP-03), so returning the bytes as base64 JSON
 * (through the same tenant-scoped auth + envelope every route uses) is simpler
 * and safer than a separate raw-binary/signed-URL code path for one action.
 */
export const GET = withAuth(
  async ({ ctx, params }) => {
    await billingService.assertActiveSubscription(ctx);
    const candidateId = uuidOr404(params.id, "Candidate not found");
    const candidate = await candidateService.get(ctx, candidateId); // 404s if cross-tenant/missing

    const file = await resumeFileRepo.getByCandidate(ctx, candidateId);
    if (!file) throw new NotFound("This candidate has no uploaded résumé file");

    const bytes = await getServices().storage.getObject(file.fileKey);
    if (!bytes) throw new NotFound("The résumé file is no longer available in storage");

    const safeName = (candidate.fullName || "candidate").replace(/[^a-z0-9]+/gi, "_");
    const filename = `${safeName}${extensionFor(file.mimeType || "application/pdf")}`;

    return {
      data: {
        filename,
        mimeType: file.mimeType || "application/octet-stream",
        base64: bytes.toString("base64"),
      },
    };
  },
  { role: "viewer" },
);
