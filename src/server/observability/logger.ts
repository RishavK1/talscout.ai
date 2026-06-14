import pino from "pino";
import { getEnv } from "@/server/config/env";

/**
 * Structured logger. Redacts common secret/PII paths so they never reach logs
 * (CFG-02). Pretty in dev, JSON in prod/test.
 */
const env = (() => {
  try {
    return getEnv();
  } catch {
    return { NODE_ENV: "development" } as { NODE_ENV: string };
  }
})();

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "silent" : "info"),
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.token",
      "*.secret",
      "*.apiKey",
      "*.SUPABASE_JWT_SECRET",
      "*.STRIPE_SECRET_KEY",
      "*.ANTHROPIC_API_KEY",
    ],
    censor: "[redacted]",
  },
});
