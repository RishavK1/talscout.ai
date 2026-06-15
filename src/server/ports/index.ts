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
}

export interface CheckoutArgs {
  tenantId: string;
  plan: string;
  seats: number;
  amount: number; // total in minor units (cents) — computed server-side
  customerId?: string;
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
}
