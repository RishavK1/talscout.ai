import { z } from "zod";

const discoveryLocationSchema = z.union([
  z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    radiusMeters: z.number().int().min(100).max(50_000),
  }),
  z.object({ text: z.string().min(1).max(200) }),
]);

const discoveryQuerySchema = z.object({
  category: z.string().min(1).max(100),
  location: discoveryLocationSchema,
});

export const createAutomatedCampaignSchema = z.object({
  blueprintId: z.uuid(),
  senderAccountId: z.uuid(),
  name: z.string().min(1).max(200),
  discoveryQuery: discoveryQuerySchema,
  maxLeadsPerRun: z.number().int().min(1).max(100).optional(),
  signatureName: z.string().min(1).max(200),
  signatureTitle: z.string().max(200).optional(),
  signatureClosing: z.string().max(100).optional(),
  /** Up to 2 example emails — few-shot style guidance for AI-generated copy. */
  styleExamples: z.array(z.string().min(1).max(5_000)).max(2).optional(),
  replyPollingEnabled: z.boolean().optional(),
});
export type CreateAutomatedCampaignBody = z.infer<typeof createAutomatedCampaignSchema>;

export const updateAutomatedCampaignSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    discoveryQuery: discoveryQuerySchema.optional(),
    maxLeadsPerRun: z.number().int().min(1).max(100).optional(),
    signatureName: z.string().min(1).max(200).optional(),
    signatureTitle: z.string().max(200).optional(),
    signatureClosing: z.string().max(100).optional(),
    styleExamples: z.array(z.string().min(1).max(5_000)).max(2).optional(),
    replyPollingEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });
export type UpdateAutomatedCampaignBody = z.infer<typeof updateAutomatedCampaignSchema>;

export const listAutomatedLeadsQuerySchema = z.object({
  // "no_email" is intentionally excluded — a business with no findable
  // email is never a selectable/visible lead (see automatedLeadRepo.list's
  // doc comment, which also hard-excludes it regardless of this filter).
  status: z
    .enum(["discovered", "ready", "queued", "sent", "replied", "failed", "skipped"])
    .optional()
    .catch(undefined),
  source: z
    .enum(["site_scrape", "hunter", "apollo", "google_places", "osm"])
    .optional()
    .catch(undefined),
  limit: z.coerce.number().int().optional().catch(undefined),
  offset: z.coerce.number().int().optional().catch(undefined),
});
export type ListAutomatedLeadsQuery = z.infer<typeof listAutomatedLeadsQuerySchema>;

export const listReplyDraftsQuerySchema = z.object({
  limit: z.coerce.number().int().optional().catch(undefined),
  offset: z.coerce.number().int().optional().catch(undefined),
});
export type ListReplyDraftsQuery = z.infer<typeof listReplyDraftsQuerySchema>;

export const updateReplyDraftSchema = z.object({
  draftBody: z.string().min(1).max(10_000),
});
export type UpdateReplyDraftBody = z.infer<typeof updateReplyDraftSchema>;

/** Optional final-edit override at the moment of approval — lets the UI
 *  combine "edit" + "approve" into one action if it wants. */
export const approveReplyDraftSchema = z
  .object({
    draftBody: z.string().min(1).max(10_000).optional(),
  })
  .optional();
export type ApproveReplyDraftBody = z.infer<typeof approveReplyDraftSchema>;
