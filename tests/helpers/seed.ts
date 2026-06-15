import { adminDb } from "../../src/server/db/client";
import { truncateAll } from "../../src/server/db/setup";
import {
  tenants,
  users,
  candidates,
  subscriptions,
} from "../../src/server/db/schema";

const ADMIN_TARGET_URL = "postgresql://rishav@localhost:5432/talscout_test";

/**
 * Seeds run on the ADMIN (superuser) connection, which bypasses RLS — exactly
 * like a privileged service path. App-side reads/writes go through the
 * restricted role where RLS is enforced.
 */

export async function resetDb(): Promise<void> {
  await truncateAll(ADMIN_TARGET_URL);
}

export async function seedTenant(name = "Acme Staffing") {
  const [row] = await adminDb().insert(tenants).values({ name }).returning();
  return row;
}

export async function seedUser(
  tenantId: string,
  opts: { email?: string; role?: "admin" | "recruiter" | "viewer"; authUserId?: string } = {},
) {
  const [row] = await adminDb()
    .insert(users)
    .values({
      tenantId,
      email: opts.email ?? `user-${Math.floor(performance.now() * 1000)}@x.com`,
      role: opts.role ?? "recruiter",
      authUserId: opts.authUserId ?? crypto.randomUUID(),
    })
    .returning();
  return row;
}

export async function seedSubscription(
  tenantId: string,
  opts: {
    status?: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
    seats?: number;
  } = {},
) {
  const [row] = await adminDb()
    .insert(subscriptions)
    .values({
      tenantId,
      status: opts.status ?? "active",
      seats: opts.seats ?? 1,
    })
    .onConflictDoUpdate({
      target: subscriptions.tenantId,
      set: {
        status: opts.status ?? "active",
        seats: opts.seats ?? 1,
      },
    })
    .returning();
  return row;
}

export async function seedCandidate(
  tenantId: string,
  overrides: Partial<{
    fullName: string;
    status: "processing" | "ready" | "error";
    location: string;
    currentTitle: string;
    summary: string;
    skills: string[];
    yearsExperience: number;
    embedding: number[];
  }> = {},
) {
  const [row] = await adminDb()
    .insert(candidates)
    .values({
      tenantId,
      status: overrides.status ?? "ready",
      fullName: overrides.fullName ?? "Test Candidate",
      location: overrides.location ?? "Remote",
      currentTitle: overrides.currentTitle ?? "Engineer",
      summary: overrides.summary ?? null,
      skills: overrides.skills ?? null,
      yearsExperience:
        overrides.yearsExperience == null
          ? null
          : String(overrides.yearsExperience),
      embedding: overrides.embedding ?? null,
    })
    .returning();
  return row;
}
