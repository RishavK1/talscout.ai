/**
 * TalScout — Stage-2 Live Smoke Tests
 *
 * Verifies the full live AI pipeline:
 *  1. POST /api/auth/signup -> create tenant/workspace.
 *  2. POST /api/uploads -> get presigned upload URL + file key.
 *  3. PUT file content to the presigned upload URL on Supabase Storage.
 *  4. POST /api/uploads/complete -> verify file exists, trigger parse job,
 *     extract candidate profile via Gemini, embed profile via Voyage, and
 *     save candidate status as 'ready' with 1024-dim embedding in live DB.
 *  5. GET /api/candidates/:id -> assert candidate fields and active embedding.
 *  6. POST /api/search -> verify candidate is returned in semantic search results.
 *  7. Clean up tenant and candidate.
 *
 * Run:
 *   node --env-file=.env.live scripts/smoke-test-stage2.mjs
 *
 * Pre-conditions:
 *  - Dev server running on port 3100 with APP_MODE=live and live DB/Storage/AI keys loaded.
 */

import pg from "pg";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";

let passed = 0;
let failed = 0;

function ok(label) {
  console.log("  ✓", label);
  passed++;
}

function fail(label, err) {
  console.error("  ✗", label, "->", err?.message ?? err);
  failed++;
}

async function expect(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (e) {
    fail(label, e);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? "assertion failed");
}

const ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const JWT_SECRET_RAW = process.env.SUPABASE_JWT_SECRET;
const NEXT_APP_URL = process.env.APP_URL ?? "http://localhost:3100";

if (!ADMIN_URL) throw new Error("DATABASE_ADMIN_URL (or DATABASE_URL) required");
if (!JWT_SECRET_RAW) throw new Error("SUPABASE_JWT_SECRET required");

const ssl = { rejectUnauthorized: false };

async function mintJwt(sub, email, ttlSec = 3600) {
  const secret = new TextEncoder().encode(JWT_SECRET_RAW);
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSec)
    .sign(secret);
}

async function query(url, sql, params = []) {
  const c = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 15000 });
  await c.connect();
  try {
    const res = await c.query(sql, params);
    return res;
  } finally {
    try { await c.end(); } catch {}
  }
}

async function runStage2Tests() {
  console.log("\n═══ Stage 2 E2E AI Pipeline Smoke Test ═══");
  
  const authUserId = randomUUID();
  const email = `smoke-stage2-${Date.now()}@talscout-test.dev`;
  let tenantId = null;
  let candidateId = null;
  let fileKey = null;
  let uploadUrl = null;

  // 1. Signup / Provision Workspace
  await expect("POST /api/auth/signup → 200, workspace provisioned", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ workspaceName: `Stage-2 Agency ${Date.now()}` }),
    });
    const body = await res.json();
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, "ok != true");
    assert(body.data?.tenantId, "No tenantId returned");
    tenantId = body.data.tenantId;
    console.log("    Tenant ID:", tenantId);
  });

  if (!tenantId) {
    fail("Cannot continue without tenantId");
    return;
  }

  // 2. Request Upload
  const resumeText = `Name: Jane Gemini
Title: Senior Software Engineer
Skills: React, TypeScript, Node.js, Python, PostgreSQL, Next.js, Docker
Summary: Experienced full-stack software engineer with a track record of building reliable web applications and microservices.
Email: jane.gemini@example.com`;

  await expect("POST /api/uploads → 201, presigned URL obtained", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({
        filename: "cv.txt",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(resumeText),
      }),
    });
    const body = await res.json();
    assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, "ok != true");
    assert(body.data?.candidateId, "No candidateId returned");
    assert(body.data?.fileKey, "No fileKey returned");
    assert(body.data?.uploadUrl, "No uploadUrl returned");
    
    candidateId = body.data.candidateId;
    fileKey = body.data.fileKey;
    uploadUrl = body.data.uploadUrl;
    console.log("    Candidate ID:", candidateId);
    console.log("    File Key:", fileKey);
  });

  if (!candidateId || !fileKey || !uploadUrl) {
    fail("Cannot continue without upload details");
    return;
  }

  // 3. Upload File directly to Storage via Presigned URL
  await expect("PUT file content to Supabase Storage uploadUrl", async () => {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
      },
      body: resumeText,
    });
    assert(res.status === 200 || res.status === 201, `Upload failed: status ${res.status}`);
  });

  // 4. Complete Upload -> triggering ingestion job, Gemini parser & Voyage embedder
  await expect("POST /api/uploads/complete → 202, job triggered successfully", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/uploads/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ candidateId, fileKey }),
    });
    const body = await res.json();
    assert(res.status === 202, `Expected 202, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, "ok != true");
    assert(body.data?.status === "queued", "Expected status queued");
  });

  // 5. Poll candidate details to see if status transitions to 'ready'
  await expect("Poll candidate status until 'ready' (verifies Gemini extractor + Voyage embedder success)", async () => {
    const jwt = await mintJwt(authUserId, email);
    let ready = false;
    let candidate = null;

    // Retry up to 10 times with 2-second sleep since API calls take a moment
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const res = await fetch(`${NEXT_APP_URL}/api/candidates/${candidateId}`, {
        headers: { "Authorization": `Bearer ${jwt}` },
      });
      if (res.status !== 200) continue;
      const body = await res.json();
      candidate = body.data;
      if (candidate?.status === "ready") {
        ready = true;
        break;
      }
      if (candidate?.status === "error") {
        throw new Error(`Candidate ingestion ended in error status: ${candidate.errorReason}`);
      }
      console.log(`    Ingestion status on attempt ${i + 1}: ${candidate?.status}`);
    }

    assert(ready, "Candidate ingestion did not complete as 'ready' in time");
    assert(candidate.fullName === "Jane Gemini", `Expected name 'Jane Gemini', got '${candidate.fullName}'`);
    assert(candidate.currentTitle === "Senior Software Engineer", `Expected title 'Senior Software Engineer', got '${candidate.currentTitle}'`);
    assert(candidate.skills.includes("React") && candidate.skills.includes("TypeScript"), "Skills missing in extraction");
    assert(Array.isArray(candidate.embedding) && candidate.embedding.length === 1024, "Missing or invalid 1024-dim embedding vector");
    console.log("    Ingestion successful. Candidate status: ready. Embedding populated (1024 dim).");
  });

  // 6. Test Semantic Search
  await expect("POST /api/search → returns candidate via Voyage embeddings + pgvector hybrid search", async () => {
    const jwt = await mintJwt(authUserId, email);
    const res = await fetch(`${NEXT_APP_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({
        q: "Looking for an expert developer who knows React and PostgreSQL databases",
        limit: 10,
      }),
    });
    const body = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, "ok != true");
    const results = body.data?.results ?? [];
    assert(results.length > 0, "No search results returned");
    const matching = results.find(c => c.id === candidateId);
    assert(matching, "Our candidate was not found in semantic search results");
    assert(typeof matching.score === "number" && matching.score > 0, `Expected numeric score, got ${matching.score}`);
    console.log(`    Found candidate in search. Match similarity score: ${matching.score}`);
  });

  // 7. Cleanup DB
  if (tenantId) {
    await expect("Clean up test tenant from DB", async () => {
      await query(ADMIN_URL, "DELETE FROM tenants WHERE id = $1", [tenantId]);
    });
  }
}

console.log("TalScout — Stage-2 Smoke Tests");
console.log("================================");
console.log("Admin URL:", ADMIN_URL?.replace(/:[^:@]+@/, ":***@"));
console.log("App URL:", NEXT_APP_URL);
console.log("JWT Secret length:", JWT_SECRET_RAW?.length, "chars");
console.log();

try {
  await runStage2Tests();
} catch (e) {
  fail("Stage 2 tests failed with exception", e);
}

console.log("\n════════════════════════════════");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("❌ Stage 2 tests failed — see above");
  process.exit(1);
} else {
  console.log("✅ All Stage 2 tests passed");
  process.exit(0);
}
