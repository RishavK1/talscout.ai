import { sql } from "drizzle-orm";
import { db } from "./client";
import { getEnv } from "@/server/config/env";
import type { schema } from "./schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/** The transaction handle drizzle hands to a `.transaction()` callback. */
export type Tx = Parameters<
  Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]
>[0];

/** Everything a repository needs: the tenant-scoped tx + identity context. */
export interface TenantContext {
  tx: Tx;
  tenantId: string;
  userId?: string;
}

/**
 * Run `fn` inside a transaction whose `app.tenant_id` is set from the
 * (server-verified) session. Postgres RLS uses that setting to physically
 * restrict every row read/written to this tenant — layer 1 of isolation.
 *
 * `set_config(..., is_local=true)` scopes the setting to THIS transaction only,
 * so a pooled connection can never leak tenant context to the next request.
 */
export async function withTenantTx<T>(
  ctx: { tenantId: string; userId?: string },
  fn: (c: TenantContext) => Promise<T>,
): Promise<T> {
  if (!ctx.tenantId) {
    throw new Error("withTenantTx called without a tenantId");
  }
  const role = getEnv().APP_DB_ROLE; // identifier-validated by env schema
  return db().transaction(async (tx) => {
    // Drop to the restricted role for THIS tx so RLS is enforced even when the
    // pool authenticates as a privileged role. Owner/admin paths (adminDb)
    // never SET ROLE, so they bypass RLS by design.
    await tx.execute(sql.raw(`set local role "${role}"`));
    // pgvector lives in `extensions` on Supabase, `public` locally; include both
    // so the vector type + operators resolve. Missing schemas are ignored.
    await tx.execute(sql.raw(`set local search_path to public, extensions`));
    await tx.execute(
      sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`,
    );
    return fn({ tx, tenantId: ctx.tenantId, userId: ctx.userId });
  });
}
