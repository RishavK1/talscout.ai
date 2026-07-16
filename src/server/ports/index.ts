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
    };

export interface OutreachSendArgs {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  /** Replies go back to the sending mailbox itself. */
  replyTo?: string;
}

/**
 * Separate from `Mailer` on purpose: `Mailer` assumes one fixed transactional
 * sender (Resend), while bulk-fire rotates sends across many tenant-owned
 * mailbox identities (Gmail/SMTP), each with its own credentials supplied
 * per call.
 */
export interface OutreachMailer {
  send(creds: SenderAccountCredentials, message: OutreachSendArgs): Promise<void>;
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
}
