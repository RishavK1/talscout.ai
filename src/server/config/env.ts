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
    VOYAGE_API_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    REDIS_URL: z.string().optional(),
    REDIS_TOKEN: z.string().optional(),

    /** ---- live-mode tuning (all optional, sensible defaults) ---- */
    ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
    ANTHROPIC_FALLBACK_MODEL: z.string().default("claude-sonnet-4-6"),
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
    GEMINI_FALLBACK_MODEL: z.string().default("gemini-2.5-pro"),
    VOYAGE_MODEL: z.string().default("voyage-3"),
    SUPABASE_STORAGE_BUCKET: z.string().default("resumes"),
    STRIPE_PRICE_STARTER: z.string().optional(),
    STRIPE_PRICE_GROWTH: z.string().optional(),
    STRIPE_PRICE_SCALE: z.string().optional(),
    APP_URL: z.string().default("http://localhost:3100"),
  })
  .superRefine((env, ctx) => {
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
