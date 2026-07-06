import { withTenantTx } from "@/server/db/tx";
import { outreachCampaignRepo, outreachLeadRepo } from "@/server/repositories/outreach.repo";
import { parseLeadsDocx } from "@/server/lib/docx-lead-parser";
import type { Services } from "@/server/ports";

export interface ParseLeadsDocxPayload {
  tenantId: string;
  campaignId: string;
  fileKey: string;
}

class ImportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Docx lead import: download → parse → bulk-insert `outreachLeads`, mirroring
 * `parse-resume`'s 3-phase shape (short read-tx → heavy work outside any tx →
 * short write-tx). Per-lead personalized templates travel inside each parsed
 * lead's `notes` (see server/lib/docx-lead-parser.ts); `campaign.sequence`
 * stays whatever the sequence editor set — it's a fallback default for leads
 * without their own embedded copy, not derived from this import.
 */
export async function parseLeadsDocxJob(
  payload: ParseLeadsDocxPayload,
  services: Services,
): Promise<void> {
  const { tenantId, campaignId, fileKey } = payload;

  const snapshot = await withTenantTx({ tenantId }, async (ctx) => {
    return await outreachCampaignRepo.getById(ctx, campaignId);
  });
  if (!snapshot) return; // deleted mid-flight
  if (snapshot.status !== "importing") return; // idempotent — already processed

  let leads: Awaited<ReturnType<typeof parseLeadsDocx>> | null = null;
  let errorReason: string | null = null;

  try {
    const bytes = await services.storage.getObject(fileKey);
    if (!bytes) throw new ImportError("file_missing");
    const parsed = await parseLeadsDocx(bytes);
    if (parsed.length === 0) throw new ImportError("no_leads_found");
    leads = parsed;
  } catch (e) {
    errorReason = e instanceof ImportError ? e.code : "docx_parse_failed";
  }

  await withTenantTx({ tenantId }, async (ctx) => {
    if (errorReason || !leads) {
      await outreachCampaignRepo.setStatus(ctx, campaignId, "error", errorReason ?? "docx_parse_failed");
      return;
    }
    await outreachLeadRepo.bulkInsert(ctx, campaignId, leads);
    await outreachCampaignRepo.setStatus(ctx, campaignId, "ready");
  });
}

export const PARSE_LEADS_DOCX_JOB = "parseLeadsDocx";
