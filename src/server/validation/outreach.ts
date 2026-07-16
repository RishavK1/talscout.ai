import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  /** Fixed at creation — the sequence step shape below depends on it and is
   *  not changeable per-step (see outreachCampaigns.channel in schema.ts). */
  channel: z.enum(["email", "whatsapp"]).default("email"),
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

/** WhatsApp steps carry a pre-approved templateId + its {{n}} params instead
 *  of free-text subject/body — Meta forbids anything else for business-
 *  initiated messages (see resolveWhatsAppTemplateParam in spintax.ts). */
export const whatsappSequenceStepSchema = z.object({
  stepIndex: z.number().int().min(0).max(2),
  dayOffset: z.number().int().min(0).max(90),
  templateId: z.uuid(),
  templateParams: z.array(z.string().max(500)).max(10),
});

export const setWhatsAppSequenceSchema = z.object({
  sequence: z.array(whatsappSequenceStepSchema).max(3),
});
export type SetWhatsAppSequenceBody = z.infer<typeof setWhatsAppSequenceSchema>;

export const fireCampaignSchema = z.object({
  stepIndex: z.number().int().min(0).max(2).default(0),
  /** Optional — when provided, fires only these leads (intersected with
   *  step eligibility server-side). Omitted/empty means "all eligible". */
  leadIds: z.array(z.uuid()).max(5000).optional(),
  /** Step-0 email fires only: also auto-schedule the Day 3/Day 7 follow-ups
   *  at each lead's Day 0 slot + dayOffset days (same clock time), sent
   *  in-thread from the same mailbox. Ignored for step 1/2 and WhatsApp. */
  cascadeFollowups: z.boolean().default(false),
});
export type FireCampaignBody = z.infer<typeof fireCampaignSchema>;

/** Schedules a future Fire for one sequence step — same shape as
 *  `fireCampaignSchema` plus the target time. */
export const scheduleFireSchema = z.object({
  stepIndex: z.number().int().min(0).max(2).default(0),
  scheduledFireAt: z.iso.datetime(),
  leadIds: z.array(z.uuid()).max(5000).optional(),
  cascadeFollowups: z.boolean().default(false),
});
export type ScheduleFireBody = z.infer<typeof scheduleFireSchema>;

/** Empty array means "no explicit selection" — the campaign falls back to
 *  every active sender account (see resolveCampaignSenders). */
export const setCampaignSendersSchema = z.object({
  senderAccountIds: z.array(z.uuid()).max(20),
});
export type SetCampaignSendersBody = z.infer<typeof setCampaignSendersSchema>;

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

/** E.164 phone number, e.g. +14155552671 — reused as senderAccounts.email. */
const E164_PHONE = /^\+[1-9]\d{6,14}$/;

export const createWhatsAppSenderSchema = z.object({
  label: z.string().min(1).max(200),
  phoneNumber: z.string().regex(E164_PHONE, "Must be an E.164 phone number, e.g. +14155552671"),
  whatsappPhoneNumberId: z.string().min(1).max(200),
  whatsappWabaId: z.string().min(1).max(200),
  whatsappAccessToken: z.string().min(1).max(2000),
  whatsappDisplayName: z.string().max(200).optional(),
  dailyLimit: z.number().int().positive().max(100_000).optional(),
});
export type CreateWhatsAppSenderBody = z.infer<typeof createWhatsAppSenderSchema>;

export const submitWhatsAppTemplateSchema = z.object({
  senderAccountId: z.uuid(),
  metaTemplateName: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, "Meta template names are lowercase letters, digits, underscores only"),
  category: z.enum(["marketing", "utility", "authentication"]),
  language: z.string().min(2).max(10).default("en_US"),
  bodyText: z.string().min(1).max(1024),
});
export type SubmitWhatsAppTemplateBody = z.infer<typeof submitWhatsAppTemplateSchema>;

export const leadTemplateStepSchema = z.object({
  stepIndex: z.number().int().min(0).max(2),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10_000),
});

/** Saved as this lead's own copy (overrides the campaign fallback sequence
 *  for it) — see `replaceOutreachTemplatesBlock` in server/lib/spintax.ts. */
export const setLeadTemplatesSchema = z.object({
  steps: z.array(leadTemplateStepSchema).min(1).max(3),
});
export type SetLeadTemplatesBody = z.infer<typeof setLeadTemplatesSchema>;

export const gmailOauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});
export type GmailOauthCallbackQuery = z.infer<typeof gmailOauthCallbackSchema>;
