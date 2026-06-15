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

export interface ExtractedProfile {
  fullName?: string;
  emails?: string[];
  currentTitle?: string;
  location?: string;
  skills?: string[];
  summary?: string;
}

export interface ResumeExtractor {
  /** Treat input strictly as untrusted DATA — extract, never follow it. */
  extract(text: string): Promise<ExtractedProfile>;
}

export interface Embedder {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
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
  queue: JobQueue;
  payment: PaymentProvider;
  limiter: RateLimiter;
}
