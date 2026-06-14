import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": srcDir },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/helpers/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
    // DB tests share one local Postgres — run serially to avoid cross-talk.
    fileParallelism: false,
    pool: "forks",
    env: {
      NODE_ENV: "test",
      APP_MODE: "mock",
      DATABASE_URL:
        "postgresql://talscout_app:talscout_app_pw@localhost:5432/talscout_test",
      DATABASE_ADMIN_URL: "postgresql://rishav@localhost:5432/talscout_test",
      SUPABASE_JWT_SECRET: "test-jwt-secret-0123456789abcdef0123456789",
    },
  },
});
