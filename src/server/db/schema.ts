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
};
