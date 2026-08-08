import { z } from "zod";

/**
 * Environment configuration — validated once at boot. The process refuses to
 * start half-configured (CFG-01). Provider keys are only required when
 * APP_MODE=live; in mock mode the whole backend runs with zero external keys.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /** Which adapters the container wires: mock = no external services. */
    APP_MODE: z.enum(["mock", "live"]).default("mock"),

    /** Runtime DB connection — the RESTRICTED app role (RLS applies). */
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    /** Owner/admin connection for migrations + DDL. Falls back to DATABASE_URL. */
    DATABASE_ADMIN_URL: z.string().min(1).optional(),

    /** Supabase JWT secret used to verify session tokens. */
    SUPABASE_JWT_SECRET: z
      .string()
      .min(16, "SUPABASE_JWT_SECRET must be at least 16 chars"),

    /** Restricted Postgres role the runtime SETs LOCAL to per tenant tx, so
     *  RLS is enforced even when the connection authenticates as a privileged
     *  role (e.g. Supabase's `postgres`). Identifier-safe. */
    APP_DB_ROLE: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .default("talscout_app"),

    /** ---- live-mode provider keys (validated lazily by adapters) ---- */
    ANTHROPIC_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    /** Second Gemini key for the AI Agent's model chain only (see
     *  agent/models.ts) — tried after GEMINI_API_KEY's quota is exhausted,
     *  before falling through to OpenRouter. Not wired into the other
     *  Gemini-backed adapters (extractor, reranker, blueprint, ...), which
     *  all share GEMINI_API_KEY as today. */
    GEMINI_API_KEY_FALLBACK: z.string().optional(),
    VOYAGE_API_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    REDIS_URL: z.string().optional(),
    REDIS_TOKEN: z.string().optional(),

    /** ---- bulk-fire outreach (new, opt-in — validated lazily by use) ---- */
    /** AES-256-GCM key (32 bytes, base64) for sender-account secret columns.
     *  See server/lib/secret-box.ts. Not required at boot (CFG-01 only
     *  applies to keys needed to start at all); connecting a sender account
     *  without it configured fails loudly at that call site instead. */
    OUTREACH_ENCRYPTION_KEY: z.string().optional(),
    /** Google OAuth client for the server-side "Connect Gmail" flow
     *  (offline access — sending must work with no browser tab open). */
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),

    /** ---- WhatsApp Business Cloud API (new, opt-in — validated lazily) ---- */
    /** Shared secret this app echoes back during Meta's webhook `GET`
     *  verification handshake (`hub.verify_token`). Set to whatever value is
     *  configured in the Meta App Dashboard's webhook subscription. */
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    /** Meta App secret used to verify the `X-Hub-Signature-256` HMAC on
     *  inbound webhook POSTs. Per-message-send credentials (phone number id,
     *  access token) live per sender account, not here — see
     *  `senderAccounts.whatsappAccessTokenEnc`. */
    WHATSAPP_APP_SECRET: z.string().optional(),

    /** ---- automated outreach campaign engine (new, opt-in — validated
     *  lazily by use). All three are free-tier services; none are required
     *  to run the feature at all — OpenStreetMap discovery + website email
     *  scraping need no key. Hunter/Apollo top up the email-finder waterfall
     *  with their free monthly credits when configured. GOOGLE_PLACES_API_KEY
     *  is the one exception worth flagging: unlike the others it is NOT free
     *  at scale (requires a Google Cloud billing account, bills past a small
     *  free threshold) — it's wired in as an optional last-resort discovery
     *  fallback and is never constructed/called anywhere unless this is
     *  set. ---- */
    HUNTER_API_KEY: z.string().optional(),
    APOLLO_API_KEY: z.string().optional(),
    GOOGLE_PLACES_API_KEY: z.string().optional(),
    /** OpenRouter (free-tier models, no card) — a last-resort fallback for
     *  the four Gemini-powered AI writing ports (blueprint research/
     *  generation, campaign copywriting, reply drafting), tried only after
     *  Gemini's primary AND fallback model both fail (e.g. daily quota
     *  exhausted). Never the primary path when GEMINI_API_KEY is set. */
    OPENROUTER_API_KEY: z.string().optional(),
    /** Geoapify Places API (free: 3,000 credits/day, no card) — OSM-based,
     *  wired as a discovery fallback alongside Overpass to top up sparse
     *  results before ever reaching the paid Google Places fallback. */
    GEOAPIFY_API_KEY: z.string().optional(),
    /** Snov.io (free: 50 credits/month, no card) — OAuth2 client-credentials
     *  domain search, another rung in the email-finder waterfall. Both must
     *  be set together; the adapter is only constructed when both are present. */
    SNOV_CLIENT_ID: z.string().optional(),
    SNOV_CLIENT_SECRET: z.string().optional(),
    /** Firecrawl (free: 1,000 credits/month, no card) — JS-rendering scrape
     *  fallback for the site-scrape email-finder step, for sites our own
     *  plain fetch can't read (client-rendered contact pages). */
    FIRECRAWL_API_KEY: z.string().optional(),
    /** Perplexity Sonar — metered, NOT free-forever like the keys above.
     *  Wired ONLY into blueprint generate() (see webResearcher in
     *  container.ts), called once per blueprint generation, never per-lead
     *  or per-email, to keep credit spend proportional to the rarest, most
     *  reused artifact in the pipeline. */
    PERPLEXITY_API_KEY: z.string().optional(),
    /** A SECOND, separate Perplexity account/key (own independent credit
     *  balance) wired as the PRIMARY tier — ahead of Gemini/OpenRouter — for
     *  blueprint suggest/generate and lead qualification (see
     *  perplexity.client.ts, container.ts). Deliberately a distinct env var
     *  from PERPLEXITY_API_KEY above so the two budgets never share a meter:
     *  that one stays reserved for the real-time web-research call. */
    PERPLEXITY_API_KEY_PRIMARY: z.string().optional(),

    /** ---- Composio (new, opt-in — validated lazily by use). Powers both
     *  the "Connected apps" integrations page and the AI Agent's tool
     *  registry. Absent key -> MockConnectionProvider, same ternary pattern
     *  as every other adapter in container.ts; nothing else in the app is
     *  affected. See server/adapters/composio.connection-provider.ts. ---- */
    COMPOSIO_API_KEY: z.string().optional(),

    /** ---- AI Agent chat (new, opt-in). Gates the agent route/UI and its
     *  model fallback chain — see server/agent/*. All optional so the app
     *  boots and every existing feature keeps working with none of these
     *  set; the nav item itself is also plan-gated (capability "ai_agent"),
     *  independent of whether a key is configured. ---- */
    AGENT_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),

    /** ---- live-mode tuning (all optional, sensible defaults) ---- */
    ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
    ANTHROPIC_FALLBACK_MODEL: z.string().default("claude-sonnet-4-6"),
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
    GEMINI_FALLBACK_MODEL: z.string().default("gemini-2.5-pro"),
    VOYAGE_MODEL: z.string().default("voyage-3"),
    /** Verified sender for outbound mail. Resend's shared onboarding sender is
     *  the zero-config default (delivers only to the account owner's inbox
     *  until a real domain is verified). */
    RESEND_FROM: z.string().default("TalScout <onboarding@resend.dev>"),
    SUPABASE_STORAGE_BUCKET: z.string().default("resumes"),
    STRIPE_PRICE_STARTER: z.string().optional(),
    STRIPE_PRICE_GROWTH: z.string().optional(),
    STRIPE_PRICE_SCALE: z.string().optional(),
    /** Separate Stripe Price objects (interval: year) for the annual-billing
     *  discount. Optional so monthly-only checkout keeps working if these
     *  aren't set up yet — annual checkout is rejected with a clear error
     *  instead of silently charging the monthly amount. */
    STRIPE_PRICE_STARTER_ANNUAL: z.string().optional(),
    STRIPE_PRICE_GROWTH_ANNUAL: z.string().optional(),
    STRIPE_PRICE_SCALE_ANNUAL: z.string().optional(),
    APP_URL: z.string().default("http://localhost:3100"),
  })
  .superRefine((env, ctx) => {
    // CFG-02: APP_MODE defaults to "mock" for a friction-free local dev
    // bootstrap, but that same default would let a production deploy boot
    // silently in mock mode if the env var were ever left unset — real
    // Stripe/auth/AI calls skipped, and MockPaymentProvider's webhook secret
    // is a hardcoded, source-visible constant, so anyone could forge a
    // webhook granting a free plan. NODE_ENV=production is set automatically
    // by every production Next.js runtime regardless of host, so this can't
    // be bypassed by simply forgetting to set APP_MODE.
    if (env.NODE_ENV === "production" && env.APP_MODE === "mock") {
      ctx.addIssue({
        code: "custom",
        message:
          "APP_MODE must be explicitly set to \"live\" in production — refusing to boot in mock mode (NODE_ENV=production).",
        path: ["APP_MODE"],
      });
    }
    if (env.APP_MODE === "live") {
      // AI extractor: require EITHER Anthropic OR Gemini key (Gemini = free tier for building)
      if (!env.ANTHROPIC_API_KEY && !env.GEMINI_API_KEY) {
        ctx.addIssue({
          code: "custom",
          message: "Either ANTHROPIC_API_KEY or GEMINI_API_KEY is required when APP_MODE=live",
          path: ["ANTHROPIC_API_KEY"],
        });
      }
      const required: (keyof typeof env)[] = [
        "VOYAGE_API_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "RESEND_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
      ];
      for (const key of required) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            message: `${key} is required when APP_MODE=live`,
            path: [key],
          });
        }
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // Fail fast, loudly, with no secret values echoed.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function adminDbUrl(): string {
  const env = getEnv();
  return env.DATABASE_ADMIN_URL ?? env.DATABASE_URL;
}
