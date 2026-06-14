import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { resetDb, seedTenant, seedCandidate } from "../helpers/seed";
import { withTenantTx } from "../../src/server/db/tx";
import { candidateRepo } from "../../src/server/repositories/candidate.repo";
import { appPool, closePools } from "../../src/server/db/client";
import { candidates } from "../../src/server/db/schema";

/**
 * Tenant isolation — the highest-priority security guarantee.
 * Covers EDGE_CASES: TEN-01, TEN-03, TEN-06, TEN-09 + fail-closed + WITH CHECK.
 */

let tenantA: { id: string };
let tenantB: { id: string };
let aCandidate: { id: string };
let bCandidate: { id: string };

beforeEach(async () => {
  await resetDb();
  tenantA = await seedTenant("Tenant A");
  tenantB = await seedTenant("Tenant B");
  aCandidate = await seedCandidate(tenantA.id, { fullName: "Alice (A)" });
  bCandidate = await seedCandidate(tenantB.id, { fullName: "Bob (B)" });
  // a few more in A to make list assertions meaningful
  await seedCandidate(tenantA.id, { fullName: "Anna (A)" });
  await seedCandidate(tenantB.id, { fullName: "Ben (B)" });
});

afterAll(async () => {
  await closePools();
});

describe("TEN-03: list never returns another tenant's rows", () => {
  it("tenant A sees only A's candidates", async () => {
    const { rows } = await withTenantTx({ tenantId: tenantA.id }, (ctx) =>
      candidateRepo.list(ctx),
    );
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.tenantId === tenantA.id)).toBe(true);
    expect(rows.some((r) => r.fullName?.includes("(B)"))).toBe(false);
  });

  it("count is tenant-scoped", async () => {
    const aCount = await withTenantTx({ tenantId: tenantA.id }, (ctx) =>
      candidateRepo.count(ctx),
    );
    const bCount = await withTenantTx({ tenantId: tenantB.id }, (ctx) =>
      candidateRepo.count(ctx),
    );
    expect(aCount).toBe(2);
    expect(bCount).toBe(2);
  });
});

describe("TEN-01: cross-tenant read by id returns nothing (looks like 404)", () => {
  it("tenant A cannot read tenant B's candidate", async () => {
    const row = await withTenantTx({ tenantId: tenantA.id }, (ctx) =>
      candidateRepo.getById(ctx, bCandidate.id),
    );
    expect(row).toBeNull();
  });

  it("tenant A can read its own", async () => {
    const row = await withTenantTx({ tenantId: tenantA.id }, (ctx) =>
      candidateRepo.getById(ctx, aCandidate.id),
    );
    expect(row?.id).toBe(aCandidate.id);
  });
});

describe("TEN-01: cross-tenant update/delete is a no-op", () => {
  it("tenant A cannot update tenant B's candidate", async () => {
    const updated = await withTenantTx({ tenantId: tenantA.id }, (ctx) =>
      candidateRepo.update(ctx, bCandidate.id, { fullName: "HACKED" }),
    );
    expect(updated).toBeNull();
    // verify B's row is unchanged (read as B)
    const stillBob = await withTenantTx({ tenantId: tenantB.id }, (ctx) =>
      candidateRepo.getById(ctx, bCandidate.id),
    );
    expect(stillBob?.fullName).toBe("Bob (B)");
  });

  it("tenant A cannot delete tenant B's candidate", async () => {
    const removed = await withTenantTx({ tenantId: tenantA.id }, (ctx) =>
      candidateRepo.remove(ctx, bCandidate.id),
    );
    expect(removed).toBe(false);
  });
});

describe("TEN-09: created rows are stamped with the context tenant only", () => {
  it("create uses ctx tenant id", async () => {
    const created = await withTenantTx({ tenantId: tenantA.id }, (ctx) =>
      candidateRepo.create(ctx, { fullName: "New A", status: "ready" }),
    );
    expect(created.tenantId).toBe(tenantA.id);
  });
});

describe("WITH CHECK: cannot insert a row for another tenant", () => {
  it("inserting tenant B's id while scoped to A is rejected by RLS", async () => {
    await expect(
      withTenantTx({ tenantId: tenantA.id }, async (ctx) => {
        // bypass the repo to attack the RLS guard directly
        await ctx.tx.insert(candidates).values({
          tenantId: tenantB.id,
          status: "ready",
          fullName: "Smuggled",
        });
      }),
    ).rejects.toThrow();
  });
});

describe("TEN-06: raw RLS proof at the connection level", () => {
  it("with app.tenant_id=A, a raw SELECT returns only A's rows", async () => {
    const client = await appPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantA.id,
      ]);
      const res = await client.query("SELECT tenant_id FROM candidates");
      expect(res.rows.length).toBe(2);
      expect(res.rows.every((r) => r.tenant_id === tenantA.id)).toBe(true);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("fails closed: with NO app.tenant_id set, zero rows are visible", async () => {
    // fresh pooled connection, no tenant context, no transaction
    const res = await appPool().query("SELECT count(*)::int AS n FROM candidates");
    expect(res.rows[0].n).toBe(0);
  });
});

describe("sanity: the admin/superuser path is the only one that sees all", () => {
  it("drizzle app db (restricted) without context sees nothing", async () => {
    const res = await appPool().query(
      "SELECT count(*)::int AS n FROM candidates",
    );
    expect(res.rows[0].n).toBe(0);
  });
});

// Suppress unused import lint (sql used only if we extend); keep for future raw checks.
void sql;
