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
  /** Per-campaign opt-in for AI-driven discovery (Perplexity Sonar live web
   *  search) — see LeadDiscoveryQuery.aiDiscoveryEnabled's doc comment. */
  aiDiscoveryEnabled: z.boolean().optional(),
  /** Optional result of the wizard's Research step (see /research route) —
   *  persisted verbatim and threaded into every generated email. */
  marketResearch: z.string().max(4_000).optional(),
});
export type CreateAutomatedCampaignBody = z.infer<typeof createAutomatedCampaignSchema>;

export const researchMarketSchema = z.object({
  blueprintId: z.uuid(),
  category: z.string().min(1).max(100),
  location: z.string().min(1).max(200),
});
export type ResearchMarketBody = z.infer<typeof researchMarketSchema>;

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
    aiDiscoveryEnabled: z.boolean().optional(),
    marketResearch: z.string().max(4_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });
export type UpdateAutomatedCampaignBody = z.infer<typeof updateAutomatedCampaignSchema>;

export const listAutomatedLeadsQuerySchema = z.object({
  // "discovered", "no_email", and "disqualified" are intentionally excluded
  // — none of them are ever a selectable/visible lead (see
  // automatedLeadRepo.LISTABLE_STATUSES, which also hard-excludes them
  // regardless of this filter).
  status: z
    .enum(["ready", "queued", "sent", "replied", "failed", "skipped", "bounced", "suppressed"])
    .optional()
    .catch(undefined),
  source: z
    .enum(["site_scrape", "hunter", "apollo", "google_places", "osm", "perplexity"])
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
