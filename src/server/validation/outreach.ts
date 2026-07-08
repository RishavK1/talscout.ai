import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateCampaignBody = z.infer<typeof createCampaignSchema>;

export const sequenceStepSchema = z.object({
  stepIndex: z.number().int().min(0).max(2),
  dayOffset: z.number().int().min(0).max(90),
  subjectTemplate: z.string().min(1).max(500),
  bodyTemplate: z.string().min(1).max(10_000),
});

/** At most 3 steps (day0/day3/day7) — see SequenceStepKey in server/lib/spintax.ts. */
export const setSequenceSchema = z.object({
  sequence: z.array(sequenceStepSchema).max(3),
});
export type SetSequenceBody = z.infer<typeof setSequenceSchema>;

export const fireCampaignSchema = z.object({
  stepIndex: z.number().int().min(0).max(2).default(0),
  /** Optional — when provided, fires only these leads (intersected with
   *  step eligibility server-side). Omitted/empty means "all eligible". */
  leadIds: z.array(z.uuid()).max(5000).optional(),
});
export type FireCampaignBody = z.infer<typeof fireCampaignSchema>;

/** List query for a campaign's leads table. Bad values fall back to repo
 *  defaults rather than erroring, same convention as listCandidatesQuerySchema. */
export const listLeadsQuerySchema = z.object({
  limit: z.coerce.number().int().optional().catch(undefined),
  offset: z.coerce.number().int().optional().catch(undefined),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

const LEADS_DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const requestLeadsUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.literal(LEADS_DOCX_CONTENT_TYPE),
  sizeBytes: z.number().int().positive(),
});
export type RequestLeadsUploadBody = z.infer<typeof requestLeadsUploadSchema>;

export const completeLeadsUploadSchema = z.object({
  fileKey: z.string().min(1).max(500),
});
export type CompleteLeadsUploadBody = z.infer<typeof completeLeadsUploadSchema>;

export const createSmtpSenderSchema = z.object({
  label: z.string().min(1).max(200),
  email: z.email().max(320),
  fromName: z.string().max(200).optional(),
  dailyLimit: z.number().int().positive().max(500).optional(),
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.number().int().positive().max(65535),
  smtpSecure: z.boolean(),
  smtpUsername: z.string().min(1).max(255),
  smtpPassword: z.string().min(1).max(500),
});
export type CreateSmtpSenderBody = z.infer<typeof createSmtpSenderSchema>;

export const setSenderActiveSchema = z.object({
  isActive: z.boolean(),
});
export type SetSenderActiveBody = z.infer<typeof setSenderActiveSchema>;

export const gmailOauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});
export type GmailOauthCallbackQuery = z.infer<typeof gmailOauthCallbackSchema>;
