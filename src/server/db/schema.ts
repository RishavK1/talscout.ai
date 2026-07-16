import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  vector,
  bigint,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Schema mirrors the ERD in SYSTEM_DESIGN.md. Every tenant-scoped table carries
 * `tenant_id` and is protected by RLS (see db/rls.sql). Table name "users"
 * (not the reserved word "user").
 */

export const userRole = pgEnum("user_role", ["admin", "recruiter", "viewer"]);
export const candidateStatus = pgEnum("candidate_status", [
  "processing",
  "ready",
  "error",
]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);

/** Bulk-fire outreach — cold-email sending, kept separate from candidates. */
export const senderAccountType = pgEnum("sender_account_type", [
  "gmail",
  "smtp",
  "whatsapp",
]);
export const outreachCampaignStatus = pgEnum("outreach_campaign_status", [
  "draft",
  "importing",
  "ready",
  "running",
  "paused",
  "completed",
  "error",
]);
export const outreachLeadStatus = pgEnum("outreach_lead_status", [
  "pending",
  "scheduled",
  "sent",
  "bounced",
  "failed",
  "skipped",
]);
export const outreachSendStatus = pgEnum("outreach_send_status", [
  "scheduled",
  "sent",
  "failed",
  "skipped",
]);
/** Channel a campaign sends through — per-campaign, not per-step, since the
 *  jsonb `sequence` step shape differs entirely between the two (email steps
 *  carry subject/body spintax templates, WhatsApp steps carry a pre-approved
 *  template id + params). */
export const outreachChannel = pgEnum("outreach_channel", ["email", "whatsapp"]);
/** Delivery-status layer for WhatsApp sends, populated asynchronously by the
 *  inbound webhook — deliberately separate from `outreachSendStatus`, which
 *  drives the scheduling lifecycle the email path also depends on. */
export const outreachDeliveryStatus = pgEnum("outreach_delivery_status", [
  "sent",
  "delivered",
  "read",
  "failed",
]);
export const whatsappTemplateCategory = pgEnum("whatsapp_template_category", [
  "marketing",
  "utility",
  "authentication",
]);
export const whatsappTemplateStatus = pgEnum("whatsapp_template_status", [
  "pending",
  "approved",
  "rejected",
  "disabled",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"),
  seatLimit: integer("seat_limit").notNull().default(1),
  status: text("status").notNull().default("active"), // active | suspended
  logo: text("logo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Supabase auth.users id (verified JWT `sub`). NULL for pending invites
     *  until the invitee signs up and we reconcile it. */
    authUserId: uuid("auth_user_id"),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: userRole("role").notNull().default("recruiter"),
    status: text("status").notNull().default("active"), // active | removed
    avatar: text("avatar"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_auth_user_id_uq").on(t.authUserId),
    uniqueIndex("users_tenant_email_uq").on(t.tenantId, t.email),
    index("users_tenant_idx").on(t.tenantId),
  ],
);

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: candidateStatus("status").notNull().default("processing"),
    fullName: text("full_name"),
    emails: text("emails").array(),
    phones: text("phones").array(),
    location: text("location"),
    currentTitle: text("current_title"),
    yearsExperience: numeric("years_experience"),
    skills: text("skills").array(),
    workHistory: jsonb("work_history"),
    education: jsonb("education"),
    certifications: text("certifications").array(),
    projects: jsonb("projects"),
    languages: text("languages").array(),
    summary: text("summary"),
    embedding: vector("embedding", { dimensions: 1024 }),
    errorReason: text("error_reason"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("candidates_tenant_status_idx").on(t.tenantId, t.status),
    index("candidates_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

export const resumeFiles = pgTable(
  "resume_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("resume_files_tenant_idx").on(t.tenantId),
    uniqueIndex("resume_files_tenant_sha_uq").on(t.tenantId, t.sha256),
  ],
);

export const candidateTags = pgTable(
  "candidate_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
  },
  (t) => [index("candidate_tags_tenant_idx").on(t.tenantId)],
);

export const shortlists = pgTable(
  "shortlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shortlists_tenant_idx").on(t.tenantId)],
);

export const shortlistItems = pgTable(
  "shortlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    shortlistId: uuid("shortlist_id")
      .notNull()
      .references(() => shortlists.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("shortlist_items_tenant_idx").on(t.tenantId),
    uniqueIndex("shortlist_items_uq").on(t.shortlistId, t.candidateId),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubId: text("stripe_sub_id"),
    status: subscriptionStatus("status").notNull().default("trialing"),
    seats: integer("seats").notNull().default(1),
    renewsAt: timestamp("renews_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_tenant_uq").on(t.tenantId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

/** Idempotency for Stripe webhooks (PAY-02). NOT tenant-scoped. */
export const processedWebhooks = pgTable("processed_webhooks", {
  eventId: text("event_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Per-tenant usage counters (AI quota, upload quota) — abuse guardrails. */
export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(), // e.g. "ai_extractions", "uploads"
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: bigint("count", { mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("usage_counters_uq").on(t.tenantId, t.metric, t.windowStart)],
);

/**
 * Bulk-fire outreach. Sender accounts hold the mailbox credentials used to
 * rotate sends across multiple Gmail/SMTP identities; the secret columns are
 * always AES-256-GCM ciphertext (see server/lib/secret-box.ts), never
 * plaintext. Campaigns own a jsonb `sequence` (Day 0/3/7-style steps);
 * leads are cold-outreach prospects imported from a docx, deliberately kept
 * separate from `candidates` (a different domain). Sends is the per-email
 * audit/schedule log — one row per (lead, step) — which the Inngest job in
 * server/jobs/send-outreach-email.ts reads and updates.
 */
export const senderAccounts = pgTable(
  "sender_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by"),
    type: senderAccountType("type").notNull(),
    label: text("label").notNull(),
    email: text("email").notNull(),
    fromName: text("from_name"),
    isActive: boolean("is_active").notNull().default(true),
    /** Max sends/day for this mailbox — the CRM had no cap at all; with
     *  multiple real accounts now in play, this is what keeps any single
     *  one from tripping spam thresholds. */
    dailyLimit: integer("daily_limit").notNull().default(40),
    // SMTP credentials (type = "smtp").
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpSecure: boolean("smtp_secure"),
    smtpUsername: text("smtp_username"),
    smtpPasswordEnc: text("smtp_password_enc"),
    // Gmail credentials (type = "gmail") — server-side OAuth w/ offline
    // access, so sending works with no browser tab open.
    gmailRefreshTokenEnc: text("gmail_refresh_token_enc"),
    // WhatsApp Business Cloud API credentials (type = "whatsapp"). The E.164
    // phone number itself is stored in the `email` column above (already
    // NOT NULL + unique per tenant; sender-facing code already branches on
    // `type` before treating that column as an email address).
    whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
    whatsappWabaId: text("whatsapp_waba_id"),
    whatsappAccessTokenEnc: text("whatsapp_access_token_enc"),
    whatsappDisplayName: text("whatsapp_display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sender_accounts_tenant_idx").on(t.tenantId),
    uniqueIndex("sender_accounts_tenant_email_uq").on(t.tenantId, t.email),
  ],
);

export const outreachCampaigns = pgTable(
  "outreach_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by"),
    name: text("name").notNull(),
    status: outreachCampaignStatus("status").notNull().default("draft"),
    /** Which provider this campaign sends through. Fixed at creation-time
     *  scope for the sequence shape below — not changeable per-step. */
    channel: outreachChannel("channel").notNull().default("email"),
    /** Array of step objects, shape depends on `channel`:
     *  email: { stepIndex, dayOffset, subjectTemplate, bodyTemplate } —
     *    templates may contain spintax `{a|b|c}` and `{{placeholder}}`
     *    tokens, resolved per-send by server/lib/spintax.ts.
     *  whatsapp: { stepIndex, dayOffset, templateId, templateParams } —
     *    Meta forbids free text outside pre-approved template placeholders,
     *    so there is no spintax path for this channel. */
    sequence: jsonb("sequence").notNull().default([]),
    /** Minutes per pacing block for the send scheduler (fireQueue's
     *  block+jitter algorithm, generalized across sender accounts). */
    blockMinutes: integer("block_minutes").notNull().default(5),
    /** string[] | null — which sender accounts this campaign fires from.
     *  null/empty means "every active sender account" (the original,
     *  tenant-wide round-robin behavior); set means Fire/Schedule Fire only
     *  rotate across these ids (see resolveCampaignSenders in
     *  outreach.service.ts). */
    senderAccountIds: jsonb("sender_account_ids"),
    /** A pending "fire at this time" request set via the schedule-fire UI —
     *  all three null together means no schedule is pending. The Inngest job
     *  in server/jobs/fire-scheduled-campaign.ts re-checks scheduledFireAt
     *  against this row at wake time, so clearing/changing it here is enough
     *  to cancel/reschedule (see that file for the staleness check). */
    scheduledFireAt: timestamp("scheduled_fire_at", { withTimezone: true }),
    scheduledFireStepIndex: integer("scheduled_fire_step_index"),
    scheduledFireLeadIds: jsonb("scheduled_fire_lead_ids"),
    errorReason: text("error_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outreach_campaigns_tenant_idx").on(t.tenantId)],
);

export const outreachLeads = pgTable(
  "outreach_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => outreachCampaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    niche: text("niche"),
    location: text("location"),
    decisionMaker: text("decision_maker"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    status: outreachLeadStatus("status").notNull().default("pending"),
    lastActionAt: timestamp("last_action_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outreach_leads_tenant_idx").on(t.tenantId),
    index("outreach_leads_campaign_idx").on(t.campaignId),
  ],
);

export const outreachSends = pgTable(
  "outreach_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => outreachCampaigns.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => outreachLeads.id, { onDelete: "cascade" }),
    senderAccountId: uuid("sender_account_id")
      .notNull()
      .references(() => senderAccounts.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: outreachSendStatus("status").notNull().default("scheduled"),
    errorReason: text("error_reason"),
    /** Provider-assigned message id (Meta's `wamid.…` for WhatsApp sends) —
     *  what the inbound webhook uses to correlate a delivery/read event back
     *  to this row. Null for email sends. */
    providerMessageId: text("provider_message_id"),
    /** WhatsApp-only delivery-status layer, updated asynchronously by the
     *  webhook — kept separate from `status` above so the webhook never
     *  touches the scheduling-lifecycle field the email path depends on. */
    deliveryStatus: outreachDeliveryStatus("delivery_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outreach_sends_tenant_idx").on(t.tenantId),
    index("outreach_sends_campaign_idx").on(t.campaignId),
    uniqueIndex("outreach_sends_lead_step_uq").on(t.campaignId, t.leadId, t.stepIndex),
    index("outreach_sends_provider_message_id_idx").on(t.providerMessageId),
  ],
);

export const whatsappTemplates = pgTable(
  "whatsapp_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    senderAccountId: uuid("sender_account_id")
      .notNull()
      .references(() => senderAccounts.id, { onDelete: "cascade" }),
    metaTemplateName: text("meta_template_name").notNull(),
    category: whatsappTemplateCategory("category").notNull(),
    language: text("language").notNull().default("en_US"),
    bodyText: text("body_text").notNull(),
    placeholderCount: integer("placeholder_count").notNull().default(0),
    status: whatsappTemplateStatus("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    /** Meta's template id, returned from POST /{waba_id}/message_templates —
     *  what the status-update webhook and the cron sync job key off of. */
    metaTemplateId: text("meta_template_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("whatsapp_templates_tenant_idx").on(t.tenantId),
    index("whatsapp_templates_meta_template_id_idx").on(t.metaTemplateId),
    uniqueIndex("whatsapp_templates_tenant_sender_name_lang_uq").on(
      t.tenantId,
      t.senderAccountId,
      t.metaTemplateName,
      t.language,
    ),
  ],
);

export const schema = {
  tenants,
  users,
  candidates,
  resumeFiles,
  candidateTags,
  shortlists,
  shortlistItems,
  subscriptions,
  auditLogs,
  processedWebhooks,
  usageCounters,
  senderAccounts,
  outreachCampaigns,
  outreachLeads,
  outreachSends,
  whatsappTemplates,
};
