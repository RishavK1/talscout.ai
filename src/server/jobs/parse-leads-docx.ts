import { sql } from "drizzle-orm";
import { withTenantTx, type TenantContext } from "@/server/db/tx";
import { outreachCampaignRepo, outreachLeadRepo } from "@/server/repositories/outreach.repo";
import { parseLeadsDocx } from "@/server/lib/docx-lead-parser";
import { logger } from "@/server/observability/logger";
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
 * Runs `fn` inside a tenant tx capped at a short statement_timeout, retrying
 * a few times with backoff on failure. Whether the campaign ever leaves
 * "importing" depends entirely on one of these writes landing — the
 * session's default statement_timeout (minutes, tuned for slow analytical
 * queries) would otherwise mean a single transient DB/network blip costs
 * several minutes before even the first retry, let alone leaves the UI
 * stuck if every attempt shares that same slow ceiling.
 */
async function withRetry(
  tenantId: string,
  fn: (ctx: TenantContext) => Promise<void>,
): Promise<boolean> {
  const backoffMs = [0, 1000, 3000];
  for (const delay of backoffMs) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await withTenantTx({ tenantId }, async (ctx) => {
        await ctx.tx.execute(sql`set local statement_timeout = '15s'`);
        await fn(ctx);
      });
      return true;
    } catch (e) {
      logger.error({ err: e }, "parse_leads_docx_write_attempt_failed");
    }
  }
  return false;
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

  let snapshot: Awaited<ReturnType<typeof outreachCampaignRepo.getById>>;
  try {
    snapshot = await withTenantTx({ tenantId }, async (ctx) => {
      await ctx.tx.execute(sql`set local statement_timeout = '15s'`);
      return await outreachCampaignRepo.getById(ctx, campaignId);
    });
  } catch (e) {
    logger.error({ err: e, campaignId }, "parse_leads_docx_snapshot_read_failed");
    await withRetry(tenantId, (ctx) =>
      outreachCampaignRepo.setStatus(ctx, campaignId, "error", "import_failed"),
    );
    return;
  }
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

  const finalized = await withRetry(tenantId, async (ctx) => {
    if (errorReason || !leads) {
      await outreachCampaignRepo.setStatus(ctx, campaignId, "error", errorReason ?? "docx_parse_failed");
      return;
    }
    await outreachLeadRepo.bulkInsert(ctx, campaignId, leads);
    await outreachCampaignRepo.setStatus(ctx, campaignId, "ready");
  });

  if (!finalized) {
    logger.error({ campaignId }, "parse_leads_docx_finalize_exhausted_retries");
  }
}

export const PARSE_LEADS_DOCX_JOB = "parseLeadsDocx";
