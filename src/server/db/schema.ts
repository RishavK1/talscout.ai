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
import { sql } from "drizzle-orm";

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
  /** Set by poll-outreach-replies.ts when a Gmail thread shows a reply from
   *  the lead — mirrors automated_lead_status's "replied" value. */
  "replied",
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

/** Blueprint = an AI-generated business-context artifact (what you sell, who
 *  it's for, differentiator, proof, voice, objections). Generated once from a
 *  guided website-intake wizard and reused to write outreach copy. Fully
 *  separate from the bulk-fire outreach tables above. */
export const blueprintStatus = pgEnum("blueprint_status", [
  "draft",
  "active",
  "archived",
]);

/** Automated outreach campaign engine — blueprint-powered lead discovery,
 *  email enrichment, AI copywriting, and draft-only AI reply handling.
 *  Deliberately separate tables from the outreach_* (bulk-fire) tables above:
 *  no FK either direction except read-only references to tenants,
 *  blueprints, and senderAccounts, so this feature can never touch bulk-fire
 *  behavior. */
export const automatedCampaignStatus = pgEnum("automated_campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "error",
]);
export const automatedLeadStatus = pgEnum("automated_lead_status", [
  "discovered",
  "no_email",
  /** Has a findable email but fails the blueprint's lead-qualification
   *  criteria (e.g. campaign targets businesses without a website, but this
   *  one already has a polished one). Unlike "no_email", kept visible in the
   *  lead list (with `notes` explaining why) — this is a business decision
   *  worth auditing, not bookkeeping noise. Never reaches copy generation. */
  "disqualified",
  "ready",
  "queued",
  "sent",
  "replied",
  "failed",
  "skipped",
  /** A sent email came back as an undeliverable-mail notification (detected
   *  by poll-automated-replies.ts recognizing a mailer-daemon/postmaster
   *  bounce in the same Gmail thread — see lib/bounce-detection.ts).
   *  Terminal: remaining scheduled follow-ups for this lead are cancelled
   *  the moment it's detected, same as "replied". Visible in the lead list
   *  (LISTABLE_STATUSES) — a real, auditable outcome, not bookkeeping. */
  "bounced",
  /** This business's email matched an entry in `suppressed_emails` (an
   *  earlier unsubscribe, from this campaign or any other in the tenant) at
   *  discovery/enrichment time, so it was never qualified or emailed at all.
   *  Visible in the lead list so "why wasn't this business contacted" has an
   *  honest answer instead of it just silently never appearing. */
  "suppressed",
]);
export const automatedLeadEmailSource = pgEnum("automated_lead_email_source", [
  "site_scrape",
  "hunter",
  "apollo",
  "google_places",
  /** The business's own OpenStreetMap listing carried an email tag —
   *  found at discovery time, no enrichment call needed. */
  "osm",
  /** JS-rendering scrape fallback (Firecrawl) for sites our own plain fetch
   *  can't read. */
  "firecrawl",
  /** Snov.io free-tier domain search. */
  "snov",
  "none",
]);
export const automatedSendStatus = pgEnum("automated_send_status", [
  "scheduled",
  "sent",
  "failed",
  "skipped",
]);
export const automatedReplyDraftStatus = pgEnum("automated_reply_draft_status", [
  "pending",
  "approved",
  "rejected",
  "sent",
]);
/** AI-classified sentiment of a genuine inbound reply (never a bounce or an
 *  out-of-office auto-reply — those are filtered out before classification
 *  even runs, see poll-automated-replies.ts). Purely informational — never
 *  gates or auto-approves anything, a human still makes every send decision
 *  (same discipline as `confidence` on this same table). */
export const automatedReplyIntent = pgEnum("automated_reply_intent", [
  "interested",
  "not_interested",
  "referral",
  "unclear",
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
    /** Whether this Gmail account's refresh token was granted with the
     *  read scope (gmail.readonly) in addition to gmail.send. Accounts
     *  connected before reply-detection shipped only carry the send scope —
     *  they keep sending fine, but the follow-up reply-stop check fails open
     *  (sends anyway) until the mailbox is reconnected. */
    gmailHasReadScope: boolean("gmail_has_read_scope").notNull().default(false),
    // WhatsApp Business Cloud API credentials (type = "whatsapp"). The E.164
    // phone number itself is stored in the `email` column above (already
    // NOT NULL + unique per tenant; sender-facing code already branches on
    // `type` before treating that column as an email address).
    whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
    whatsappWabaId: text("whatsapp_waba_id"),
    whatsappAccessTokenEnc: text("whatsapp_access_token_enc"),
    whatsappDisplayName: text("whatsapp_display_name"),
    /** Soft-delete marker. "Disconnect" in the UI sets this (and scrubs the
     *  credential columns above) instead of hard-deleting the row — the row
     *  used to be DELETEd outright, which cascade-deleted every outreach_send
     *  that referenced it (see the FK below) and wiped a campaign's entire
     *  send history/threading anchors out from under it. Null means active
     *  (subject to isActive for pause/resume); non-null means disconnected. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sender_accounts_tenant_idx").on(t.tenantId),
    // PARTIAL on purpose: sender accounts are SOFT-deleted, so a full unique
    // index would count disconnected rows and permanently block reconnecting
    // the same mailbox. Every read path already filters on
    // `isNull(deletedAt)`, so uniqueness only ever needs to hold among live
    // rows — see the matching note on blueprints_tenant_name_uq below.
    uniqueIndex("sender_accounts_tenant_email_uq")
      .on(t.tenantId, t.email)
      .where(sql`${t.deletedAt} is null`),
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
    /** When the pending scheduled fire is for step 0 and this is true, the
     *  fire also cascades Day 3/Day 7 follow-up sends (see
     *  fireCampaign's cascadeFollowups option). Persisted alongside the
     *  schedule because the actual fire happens days later in a background
     *  job that only has this row to go on. */
    scheduledFireCascade: boolean("scheduled_fire_cascade").notNull().default(false),
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
    /** RFC 5322 Message-ID of a SENT email (self-generated before send, so
     *  no provider read-back is needed). A step-0 row's value becomes the
     *  follow-up steps' In-Reply-To/References anchor — what keeps Day 3/
     *  Day 7 in the same conversation. Null for WhatsApp and unsent rows. */
    rfc822MessageId: text("rfc822_message_id"),
    /** Gmail's thread id from the messages.send response (gmail senders
     *  only) — passed back on follow-up sends as requestBody.threadId, the
     *  authoritative way to land a reply in the same Gmail thread. */
    gmailThreadId: text("gmail_thread_id"),
    /** The spintax-resolved subject actually sent (email only). Persisted
     *  because Gmail only files a follow-up into an existing thread when its
     *  Subject matches the original (modulo "Re:") — Day 3/Day 7 reuse this
     *  as `Re: <sentSubject>` instead of their own step's subject template. */
    sentSubject: text("sent_subject"),
    /** First time the tracking pixel embedded in this send's HTML body was
     *  fetched — set once (first open wins) by the public
     *  /api/track/open route, never touched again. Null for WhatsApp sends
     *  (no HTML body) and for emails not yet opened. */
    openedAt: timestamp("opened_at", { withTimezone: true }),
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

/**
 * Blueprints — one AI business-context artifact per offer/brand (a workspace
 * can hold several). `sections` is the generated structured context the email
 * writer will consume next phase; `intakeAnswers` preserves the raw wizard
 * answers so a blueprint can be re-generated without re-running the intake.
 * Deliberately independent of the outreach tables — no FK either direction —
 * so this feature never touches bulk-fire behavior. Soft-delete via
 * nullable `deletedAt`, mirroring senderAccounts.
 */
export const blueprints = pgTable(
  "blueprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by"),
    name: text("name").notNull(),
    websiteUrl: text("website_url"),
    status: blueprintStatus("status").notNull().default("draft"),
    /** The generated business-context artifact (whoWeAre, whatWeOffer,
     *  whoItsFor, differentiator, proof[], personas[], voice, objections[],
     *  rules[]). Null until the wizard's generate step runs. */
    sections: jsonb("sections"),
    /** Raw guided-wizard answers (per-field selections/edits) — kept so
     *  re-generate can re-run generation from the confirmed intake without
     *  re-fetching the site. */
    intakeAnswers: jsonb("intake_answers"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("blueprints_tenant_idx").on(t.tenantId),
    // PARTIAL on purpose. Blueprints are SOFT-deleted (deletedAt), and a full
    // unique index counts those hidden rows: creating "Acme", deleting it, then
    // creating "Acme" again passed the service's friendly duplicate-name check
    // (findByName filters isNull(deletedAt)) and then blew up on this
    // constraint — surfacing as a bare "Something went wrong" with no way for
    // the user to recover the name short of renaming. Scoping the index to live
    // rows makes the DB agree with every read path in the app.
    uniqueIndex("blueprints_tenant_name_uq")
      .on(t.tenantId, t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * One automated campaign per blueprint-driven outreach effort. References
 * `senderAccountId` read-only (no onDelete — that table is soft-delete only,
 * so this FK never blocks) and `blueprintId` (no onDelete — a campaign must
 * never silently lose its grounding context).
 */
export const automatedCampaigns = pgTable(
  "automated_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by"),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => blueprints.id),
    senderAccountId: uuid("sender_account_id")
      .notNull()
      .references(() => senderAccounts.id),
    name: text("name").notNull(),
    status: automatedCampaignStatus("status").notNull().default("draft"),
    /** { category, location: { lat, lon, radiusMeters } | { text } } */
    discoveryQuery: jsonb("discovery_query").notNull(),
    /** Target of USABLE (email-bearing) leads per cron tick — the pipeline
     *  fetches a much larger raw candidate pool and keeps enriching until
     *  this many with-email leads are found or the pool/budget runs out
     *  (see run-automated-campaign.ts). Independent of the daily SEND cap. */
    maxLeadsPerRun: integer("max_leads_per_run").notNull().default(25),
    signatureName: text("signature_name").notNull(),
    signatureTitle: text("signature_title"),
    signatureClosing: text("signature_closing").notNull().default("Best regards"),
    /** Up to 2 example emails used as few-shot style guidance — validated at
     *  the API layer, stored as string[]. */
    styleExamples: jsonb("style_examples"),
    /** Optional real-time market research (competition, typical digital
     *  presence, local pain points for this category+location) — gathered
     *  once during campaign setup via the wizard's Research step, then
     *  threaded into every generated email as untrusted supplementary
     *  grounding (see OutreachCopyRequest.marketResearch). Null when the
     *  plan doesn't include web research or the user skipped that step. */
    marketResearch: text("market_research"),
    /** Requires the sender to be Gmail with read scope (enforced at create
     *  time in the service) — SMTP/no-read-scope senders force this false. */
    replyPollingEnabled: boolean("reply_polling_enabled").notNull().default(true),
    lastDiscoveryRunAt: timestamp("last_discovery_run_at", { withTimezone: true }),
    lastReplyPollAt: timestamp("last_reply_poll_at", { withTimezone: true }),
    errorReason: text("error_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("automated_campaigns_tenant_idx").on(t.tenantId),
    index("automated_campaigns_status_idx").on(t.status),
  ],
);

/**
 * Businesses discovered for a campaign. `sourcePlaceId` (e.g. "osm:node/123",
 * "google:ChIJ...") is the discovery-dedup key — a re-run of the discovery
 * step never inserts the same business twice for the same campaign.
 */
export const automatedLeads = pgTable(
  "automated_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => automatedCampaigns.id, { onDelete: "cascade" }),
    sourcePlaceId: text("source_place_id").notNull(),
    businessName: text("business_name").notNull(),
    category: text("category"),
    addressText: text("address_text"),
    phone: text("phone"),
    website: text("website"),
    lat: numeric("lat"),
    lon: numeric("lon"),
    status: automatedLeadStatus("status").notNull().default("discovered"),
    /** Null until the email-finder waterfall succeeds. A lead that never
     *  gets an email (status "no_email") is terminal — it stays visible for
     *  transparency but is never eligible for AI copy generation or sending. */
    email: text("email"),
    emailSource: automatedLeadEmailSource("email_source").notNull().default("none"),
    emailConfidence: integer("email_confidence"),
    notes: text("notes"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("automated_leads_tenant_idx").on(t.tenantId),
    index("automated_leads_campaign_status_idx").on(t.campaignId, t.status),
    uniqueIndex("automated_leads_campaign_source_uq").on(t.campaignId, t.sourcePlaceId),
  ],
);

/**
 * Up to 3 rows per lead — Day 0/3/7 sequencing, same shape as bulk-fire's
 * outreachSends (stepIndex 0/1/2). Sends go through the same OutreachMailer
 * port bulk-fire uses, same threading discipline (sentSubject is what lets
 * Day 3/7 thread as "Re: <Day 0 subject>" in the same Gmail thread).
 */
export const automatedSends = pgTable(
  "automated_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => automatedCampaigns.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => automatedLeads.id, { onDelete: "cascade" }),
    senderAccountId: uuid("sender_account_id")
      .notNull()
      .references(() => senderAccounts.id),
    /** 0 = Day 0 (initial pitch), 1 = Day 3 follow-up, 2 = Day 7 follow-up.
     *  Existing pre-migration rows default to 0 — accurate, since they were
     *  written back when this table was single-touch-only. */
    stepIndex: integer("step_index").notNull().default(0),
    subject: text("subject").notNull(),
    /** Final text actually sent, signature already appended. */
    body: text("body").notNull(),
    status: automatedSendStatus("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    rfc822MessageId: text("rfc822_message_id"),
    gmailThreadId: text("gmail_thread_id"),
    /** Subject actually sent — only stepIndex 0 needs this read back later
     *  (Day 3/7 thread off it as "Re: {sentSubject}"), but every row gets
     *  one written at send time for consistency. */
    sentSubject: text("sent_subject"),
    errorReason: text("error_reason"),
    /** Mirrors outreachSends.openedAt — first tracking-pixel fetch, set once
     *  by the shared /api/track/open route. */
    openedAt: timestamp("opened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("automated_sends_tenant_idx").on(t.tenantId),
    index("automated_sends_campaign_idx").on(t.campaignId),
    /** One email per (business, step) per campaign — enforced at the DB
     *  level so even a concurrent/retried job step can't double-email. */
    uniqueIndex("automated_sends_campaign_lead_step_uq").on(t.campaignId, t.leadId, t.stepIndex),
    index("automated_sends_gmail_thread_idx").on(t.gmailThreadId),
    /** Mirrors outreachSends' cap-count query shape exactly (see
     *  countSentTodayForTenant) for the independent 50/day automated cap. */
    index("automated_sends_tenant_status_scheduled_idx").on(
      t.tenantId,
      t.status,
      t.scheduledAt,
    ),
  ],
);

/**
 * AI-drafted replies awaiting human review. Draft-only by construction: this
 * table has no code path to an actual send except the explicit human-
 * triggered approve action (see automated-outreach.service.ts). `sendId` is
 * unique so a repeat poll tick refreshes an existing PENDING draft in place
 * rather than duplicating — an already-reviewed row is never touched again.
 */
export const automatedReplyDrafts = pgTable(
  "automated_reply_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => automatedCampaigns.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => automatedLeads.id, { onDelete: "cascade" }),
    sendId: uuid("send_id")
      .notNull()
      .references(() => automatedSends.id, { onDelete: "cascade" }),
    /** Raw fetched reply content — UNTRUSTED, attacker-controllable. Never
     *  interpolated into anything executed; only ever displayed as text or
     *  passed to the AI drafter inside an explicit untrusted-data tag. */
    inboundSubject: text("inbound_subject"),
    inboundBody: text("inbound_body").notNull(),
    draftBody: text("draft_body").notNull(),
    reasoning: text("reasoning"),
    confidence: numeric("confidence"),
    /** AI-classified sentiment — see automatedReplyIntent's doc comment.
     *  Null for drafts created before this existed. */
    intent: automatedReplyIntent("intent"),
    status: automatedReplyDraftStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorReason: text("error_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("automated_reply_drafts_tenant_idx").on(t.tenantId),
    index("automated_reply_drafts_campaign_idx").on(t.campaignId),
    index("automated_reply_drafts_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("automated_reply_drafts_send_uq").on(t.sendId),
  ],
);

/**
 * Permanent per-tenant email suppression list — once an address is here, no
 * future automated-outreach discovery/enrichment ever qualifies it again
 * (checked in run-automated-campaign.ts) and no already-scheduled send to it
 * fires (re-checked in send-automated-email.ts, same "recheck at send time"
 * discipline as the reply-stop check). Populated by the public unsubscribe
 * route (src/app/api/automated-outreach/unsubscribe/[leadId]/route.ts).
 *
 * Deliberately NOT scoped to a single campaign — CAN-SPAM/GDPR opt-outs are
 * an organization-level obligation, not a per-campaign one: someone who
 * unsubscribes from one campaign must never be re-contacted by a DIFFERENT
 * campaign in the same tenant either. Named generically (not
 * "automated_suppressed_emails") so bulk-fire can share this same table in
 * a later pass instead of needing its own.
 */
export const suppressedEmails = pgTable(
  "suppressed_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Always lowercased before insert/lookup (see suppressedEmailRepo) —
     *  the local part is compared case-sensitively by spec but essentially
     *  never in practice, and normalizing avoids a duplicate live row for
     *  "Info@x.com" vs "info@x.com" silently failing to suppress the other
     *  casing. */
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("suppressed_emails_tenant_email_uq").on(t.tenantId, t.email),
    index("suppressed_emails_tenant_idx").on(t.tenantId),
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
  blueprints,
  automatedCampaigns,
  automatedLeads,
  automatedSends,
  automatedReplyDrafts,
  suppressedEmails,
};
