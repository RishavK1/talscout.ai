import { setupDatabase } from "../../src/server/db/setup";

/**
 * Runs once before the whole suite: ensures the restricted role + test DB +
 * pgvector + schema + RLS exist. Idempotent, so re-runs are cheap.
 */
export default async function globalSetup() {
  await setupDatabase({
    adminBaseUrl: "postgresql://rishav@localhost:5432/talscout_test",
    dbName: "talscout_test",
    appRole: "talscout_app",
    appPassword: "talscout_app_pw",
    resetSchema: true,
  });
}
