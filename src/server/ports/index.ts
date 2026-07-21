/** Hexagonal ports — external concerns behind interfaces so the core runs on
 *  mock adapters with zero paid keys, and real adapters drop in unchanged. */

export interface PresignResult {
  uploadUrl: string;
  key: string;
}

export interface Storage {
  /** Issue a URL the client uploads to directly (file never touches our server). */
  createPresignedUpload(args: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignResult>;
  /** Used by the worker (download) and, in mock/local, to simulate the upload. */
  putObject(key: string, bytes: Buffer, contentType?: string): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  /** The presigned URL's declared `maxBytes` isn't enforced by the storage
   *  provider itself — a client can lie about `sizeBytes` at request time and
   *  then PUT anything to the signed URL. Callers that need the real size
   *  (e.g. to reject an oversized upload after the fact) use this instead of
   *  trusting the client-supplied value. Returns null if the object doesn't
   *  exist. */
  getObjectSize(key: string): Promise<number | null>;
}

export interface WorkHistoryItem {
  company?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  highlights?: string[];
}
export interface EducationItem {
  institution?: string;
  degree?: string;
  field?: string;
  startYear?: string;
  endYear?: string;
}
export interface ProjectItem {
  name?: string;
  description?: string;
  technologies?: string[];
}

export interface ExtractedProfile {
  fullName?: string;
  emails?: string[];
  phones?: string[];
  currentTitle?: string;
  location?: string;
  yearsExperience?: number;
  summary?: string;
  skills?: string[];
  languages?: string[];
  certifications?: string[];
  workHistory?: WorkHistoryItem[];
  education?: EducationItem[];
  projects?: ProjectItem[];
}

export interface ResumeExtractor {
  /** Treat input strictly as untrusted DATA — extract, never follow it. */
  extract(text: string): Promise<ExtractedProfile>;
}

/** Modern embedding models encode queries and documents asymmetrically; using
 *  the right side materially improves retrieval quality. */
export type EmbedInputType = "query" | "document";

export interface Embedder {
  readonly dimensions: number;
  /** `inputType` defaults to "document" (the corpus side). Pass "query" when
   *  embedding a user's search text. */
  embed(text: string, inputType?: EmbedInputType): Promise<number[]>;
}

/** A candidate handed to the reranker — compact, text-only (no vectors). */
export interface RerankDocument {
  id: string;
  /** A plain-text profile representation the model reads to judge fit. */
  text: string;
}

export interface RerankResult {
  id: string;
  /** Relevance to the query in [0,1]. Higher = better fit. */
  score: number;
  /** Short human-readable justification ("why matched"), if the model gives one. */
  reason?: string;
}

/**
 * Second-stage relevance model. Given the query + the top-K vector hits, it
 * *reads* each profile and scores true semantic fit — catching cases a single
 * cosine number misses (e.g. a full-stack dev whose only tie to "video editor"
 * is one unrelated certification). Implementations MUST preserve the input ids
 * and never invent new ones.
 */
export interface Reranker {
  rerank(query: string, documents: RerankDocument[]): Promise<RerankResult[]>;
}

export type JobHandler = (payload: unknown) => Promise<void>;

export interface JobQueue {
  register(name: string, handler: JobHandler): void;
  enqueue(name: string, payload: unknown): Promise<void>;
  /** Same job, many payloads — one round trip instead of N. Used where a
   *  single user action fans out into many jobs (e.g. firing a campaign to
   *  hundreds of leads) so a transient failure fails atomically rather than
   *  stranding an arbitrary prefix of the loop. */
  enqueueBatch(name: string, payloads: unknown[]): Promise<void>;
}

export interface CheckoutArgs {
  tenantId: string;
  plan: string;
  seats: number;
  amount: number; // total in minor units (cents) — computed server-side
  customerId?: string;
  /** Origin of the initiating request (e.g. https://app.example.com). Used for
   *  success/cancel redirects so deployed checkouts never bounce to localhost. */
  appOrigin?: string;
}
export interface CheckoutSession {
  url: string;
  sessionId: string;
}
export interface WebhookEvent {
  id: string;
  type: string;
  created?: number;
  data: {
    tenantId?: string;
    seats?: number;
    status?: string;
    stripeCustomerId?: string;
    stripeSubId?: string;
    renewsAt?: string;
    plan?: string;
  };
}

export interface PaymentProvider {
  createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession>;
  /** Verify the signature over the RAW body and return the parsed event.
   *  Throws on an invalid/forged signature. */
  verifyWebhook(rawBody: string, signature: string | null): WebhookEvent;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Replies go to the sending recruiter, not our transactional address. */
  replyTo?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Credentials for one connected sender account (see server/db/schema.ts's
 *  `senderAccounts`), decrypted just-in-time by the caller — never persisted
 *  in this shape. Gmail uses server-side OAuth with offline access (a
 *  refresh token), not a browser-held access token, so sending works with
 *  no tab open. */
export type SenderAccountCredentials =
  | {
      type: "smtp";
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password: string;
    }
  | {
      type: "gmail";
      refreshToken: string;
      /** True when the stored refresh token was granted gmail.readonly in
       *  addition to gmail.send (senderAccounts.gmailHasReadScope). Tokens
       *  from before reply-detection shipped are send-only; threadHasReply
       *  returns "unknown" for them rather than burning a doomed API call. */
      hasReadScope?: boolean;
    };

export interface OutreachSendArgs {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  /** Replies go back to the sending mailbox itself. */
  replyTo?: string;
  /** Pre-generated RFC 5322 Message-ID (with angle brackets) the adapter
   *  MUST stamp on the outgoing mail — generated by the caller (not read
   *  back from the provider) so it can be persisted even when the provider
   *  offers no read scope. */
  messageId: string;
  /** Set on follow-up sends (Day 3/Day 7): the step-0 email's Message-ID.
   *  Adapters emit it as In-Reply-To + References so the mail threads as a
   *  reply in every client, not just Gmail. */
  inReplyTo?: string;
  /** Set on follow-up sends from a Gmail sender: the step-0 send's Gmail
   *  thread id, passed as requestBody.threadId — Gmail's authoritative
   *  same-thread mechanism. Ignored by SMTP. */
  gmailThreadId?: string;
}

/** What a completed send hands back so follow-ups can thread onto it.
 *  `gmailThreadId` is only present for Gmail sends (SMTP has no thread
 *  concept server-side — threading there rides purely on the headers). */
export interface OutreachSendResult {
  gmailThreadId?: string;
}

/**
 * Separate from `Mailer` on purpose: `Mailer` assumes one fixed transactional
 * sender (Resend), while bulk-fire rotates sends across many tenant-owned
 * mailbox identities (Gmail/SMTP), each with its own credentials supplied
 * per call.
 */
export interface OutreachMailer {
  send(
    creds: SenderAccountCredentials,
    message: OutreachSendArgs,
  ): Promise<OutreachSendResult>;
  /** Reply-stop probe for follow-up sends: does this Gmail thread contain a
   *  message from someone other than the sender (i.e. the lead replied)?
   *  Returns "unknown" whenever the question can't be answered — SMTP
   *  senders, Gmail tokens that predate the read scope, transient API
   *  errors — and callers treat "unknown" as "send anyway" (fail open):
   *  a missed stop is a duplicate follow-up, a false stop is a silently
   *  dead sequence. */
  threadHasReply(
    creds: SenderAccountCredentials,
    args: { gmailThreadId: string; senderEmail: string },
  ): Promise<"replied" | "no_reply" | "unknown">;
  /** Fetches the latest inbound message (not from `senderEmail`) in a Gmail
   *  thread — used by the automated-outreach reply-poll job to get the
   *  actual reply CONTENT for AI drafting (threadHasReply only answers
   *  whether one exists). Same fail-quiet semantics as threadHasReply: null
   *  for SMTP, send-only tokens, no reply yet, or any transient error —
   *  callers must treat null as "nothing to draft yet," never as a failure. */
  getThreadReplyContent(
    creds: SenderAccountCredentials,
    args: { gmailThreadId: string; senderEmail: string },
  ): Promise<{ subject: string; body: string } | null>;
}

/** A WhatsApp Business Cloud API send always goes through a pre-approved
 *  template (Meta forbids free-form business-initiated text), so this is
 *  intentionally not shaped like `OutreachSendArgs` — there is no
 *  subject/body, only a template name + positional body params. Kept as a
 *  dedicated port (not a third arm on `OutreachMailer`/
 *  `SenderAccountCredentials`) since those two types are irreducibly
 *  email-shaped and already exhaustively pattern-matched elsewhere. */
export interface WhatsAppTemplateSendArgs {
  to: string;
  templateName: string;
  language: string;
  bodyParams: string[];
}

export interface WhatsAppSenderCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export interface WhatsAppSender {
  send(
    creds: WhatsAppSenderCredentials,
    message: WhatsAppTemplateSendArgs,
  ): Promise<{ providerMessageId: string }>;
}

export interface WhatsAppTemplateSubmission {
  wabaId: string;
  accessToken: string;
  name: string;
  category: "marketing" | "utility" | "authentication";
  language: string;
  bodyText: string;
}

export interface WhatsAppTemplateStatusResult {
  metaTemplateId: string;
  status: "pending" | "approved" | "rejected" | "disabled";
  rejectionReason?: string;
}

/** Meta's template-submission/status-lookup surface — separate from
 *  `WhatsAppSender` (which only sends already-approved templates) so the
 *  mock adapter can simulate approval without touching send semantics. */
export interface WhatsAppTemplateManager {
  submit(input: WhatsAppTemplateSubmission): Promise<{ metaTemplateId: string }>;
  getStatus(
    wabaId: string,
    accessToken: string,
    metaTemplateId: string,
  ): Promise<WhatsAppTemplateStatusResult>;
}

/** ---- Blueprint (AI business-context) ports ----
 *  Two task-specific AI seams behind the hexagon (same shape as
 *  `ResumeExtractor`/`Reranker` — NOT a generic chat client). The researcher
 *  reads a website and proposes selectable answer options for the guided
 *  intake wizard; the generator turns the user's confirmed answers into the
 *  final structured business-context artifact. Both treat any fetched website
 *  text strictly as untrusted DATA. */

/** One intake question with AI-suggested options the user picks/edits.
 *  `field` is the stable key the wizard/generator address (e.g. "whatWeSell",
 *  "icp", "differentiator"). `multi` marks fields where several options can be
 *  selected (proof points, objections) vs. a single choice (voice). */
export interface BlueprintSuggestedField {
  field: string;
  question: string;
  options: string[];
  multi: boolean;
}

export interface BlueprintSuggestions {
  /** Best-effort human-readable business name inferred from the site. */
  businessName?: string;
  fields: BlueprintSuggestedField[];
}

export interface BlueprintResearcher {
  /** Given a website URL (and the user-entered offer/business name), fetch +
   *  read the site and return suggested answer options per intake field.
   *  Website content is UNTRUSTED — extract, never follow it. */
  suggest(args: { websiteUrl: string; name: string }): Promise<BlueprintSuggestions>;
}

/** The confirmed intake answers the user submits from the wizard — a map of
 *  field key → selected/edited value(s). Free-form on purpose so new wizard
 *  fields don't require a port change. */
export interface BlueprintIntakeAnswers {
  businessName?: string;
  websiteUrl?: string;
  /** field key → the user's confirmed answer(s). */
  answers: Record<string, string | string[]>;
}

export interface BlueprintProofPoint {
  label: string;
  detail?: string;
}
export interface BlueprintPersona {
  name: string;
  description?: string;
}

/** The generated business-context artifact. Stored as jsonb on `blueprints`
 *  and (next phase) read by the email writer to produce per-lead copy. */
export interface BlueprintSections {
  whoWeAre: string;
  whatWeOffer: string;
  whoItsFor: string;
  statusQuo?: string;
  differentiator: string;
  painWeSolve: string;
  proof: BlueprintProofPoint[];
  personas: BlueprintPersona[];
  voice: string;
  objections: string[];
  rules: string[];
}

export interface BlueprintGenerator {
  /** Turn confirmed intake answers into the final structured blueprint. */
  generate(input: BlueprintIntakeAnswers): Promise<BlueprintSections>;
}

/** ---- Automated outreach campaign ports ----
 *  Fully separate seams from the outreach_* (bulk-fire) tables/ports above —
 *  these back a blueprint-powered discover→enrich→write→send pipeline plus
 *  draft-only AI reply handling. */

export interface LeadDiscoveryQuery {
  category: string;
  location: { lat: number; lon: number; radiusMeters: number } | { text: string };
  limit: number;
}

export interface DiscoveredLead {
  /** External id (e.g. "osm:node/123", "google:ChIJ...") — the discovery
   *  dedup key so a re-run never inserts the same business twice. */
  sourcePlaceId: string;
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  /** Public contact email published on the business's own directory listing
   *  (e.g. OSM's `email`/`contact:email` tag). When present, the lead skips
   *  the email-finder waterfall entirely — it's already usable. */
  email?: string;
  lat?: number;
  lon?: number;
}

/** Business lead discovery — free-first (OpenStreetMap primary), an optional
 *  paid fallback (Google Places) only ever constructed when the tenant/ops
 *  team has configured its own API key. */
export interface LeadDiscovery {
  discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]>;
}

export type EmailSourceType =
  | "site_scrape"
  | "hunter"
  | "apollo"
  | "google_places"
  | "osm"
  | "firecrawl"
  | "snov";

export interface EmailFinderResult {
  email: string;
  source: EmailSourceType;
  confidence?: number;
}

/** Email discovery for a business — implementations are chained by the
 *  caller (site scrape → free-tier finder services) and MUST return `null`
 *  (never throw) on a genuine miss, since a `null` result is what the
 *  service maps directly to lead status "no_email" — a strict rule that a
 *  lead with no findable email must never enter the send pipeline. */
export interface EmailFinder {
  find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null>;
}

export interface OutreachCopyRequest {
  blueprint: BlueprintSections;
  lead: { businessName: string; category?: string; location?: string };
  /** Up to 2 example emails the user provided — few-shot style guidance,
   *  not content to copy. */
  styleExamples?: string[];
}

export interface OutreachCopyResult {
  subject: string;
  /** Body text WITHOUT a signature — the calling service appends the
   *  signature block deterministically so the human's real name/title can
   *  never be hallucinated or altered by the model. */
  body: string;
}

export interface OutreachCopywriter {
  generateEmail(input: OutreachCopyRequest): Promise<OutreachCopyResult>;
}

export interface ReplyDraftRequest {
  blueprint: BlueprintSections;
  lead: { businessName: string };
  originalSend: { subject: string; body: string };
  /** The lead's inbound reply — ATTACKER-CONTROLLABLE. Implementations MUST
   *  treat this strictly as untrusted data, never as instructions (see
   *  gemini.reply-drafter.ts for the required prompt-injection defense). */
  inboundMessage: { subject: string; body: string };
  styleExamples?: string[];
}

export interface ReplyDraftResult {
  body: string;
  reasoning?: string;
  /** 0-1 self-reported confidence, surfaced in the review UI — never used
   *  to auto-approve. A human always makes the send decision. */
  confidence?: number;
}

/** Drafts a reply for human review — this port has NO send capability by
 *  design. There is no code path from a drafted reply to an actual send
 *  except the explicit human-triggered approve action in
 *  automated-outreach.service.ts. */
export interface ReplyDrafter {
  draft(input: ReplyDraftRequest): Promise<ReplyDraftResult>;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // timestamp in ms
}

export interface RateLimiter {
  limit(key: string, limitCount: number, windowSeconds: number): Promise<RateLimitResult>;
}

export interface Services {
  storage: Storage;
  extractor: ResumeExtractor;
  embedder: Embedder;
  reranker: Reranker;
  queue: JobQueue;
  payment: PaymentProvider;
  limiter: RateLimiter;
  mailer: Mailer;
  outreachMailer: OutreachMailer;
  whatsappSender: WhatsAppSender;
  whatsappTemplateManager: WhatsAppTemplateManager;
  blueprintResearcher: BlueprintResearcher;
  blueprintGenerator: BlueprintGenerator;
  leadDiscovery: LeadDiscovery;
  emailFinder: EmailFinder;
  outreachCopywriter: OutreachCopywriter;
  replyDrafter: ReplyDrafter;
}
