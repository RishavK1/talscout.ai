# TalScout — Backend Architecture

> Production-grade, multi-tenant, security-first backend for TalScout (AI résumé parsing + semantic candidate search for staffing agencies).
> This document is the contract we build to. Status: **design — for approval before coding.** Last updated 2026-06-14.

Companion docs: [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md) (product + high-level architecture) · [EDGE_CASES.md](./EDGE_CASES.md) (the test matrix).

---

## 0. Non-negotiable principles

1. **Tenant isolation is sacred.** The worst possible bug is Agency A seeing Agency B's candidates. We defend it at **three independent layers** (RLS, session-derived tenant, scoped repositories). Any one failing must not breach data.
2. **Never trust the client.** Tenant, user, and role come from a **verified server-side session**, never from the request body, params, or headers the client controls.
3. **Validate everything at the edge.** Every request body/query/param is parsed with **Zod** before any logic runs. Reject by default.
4. **Secrets never leave the server.** Service keys (DB, AI, Stripe, JWT secret) live in env/secret manager, never in the client bundle or logs.
5. **Test in isolation, with the adversary in mind.** Every endpoint has happy-path **and** abuse-path tests (see [EDGE_CASES.md](./EDGE_CASES.md)) before any frontend wiring.
6. **Fail closed.** On any auth/validation/ownership ambiguity, deny. Errors return safe, generic messages (no stack traces, no internal IDs leaked).
7. **Mocks-first.** All external services (AI, embeddings, payments, email, storage) sit behind interfaces with mock adapters, so the whole backend runs and is tested with **zero paid keys**. Real adapters drop in later, one at a time.

---

## 1. Threat model (who we defend against)

| Adversary | Goal | Primary defenses |
|---|---|---|
| **Malicious tenant user** | Read/modify another tenant's data (IDOR) | RLS + session-derived tenant + scoped repos |
| **Privilege escalation** | A `viewer`/`recruiter` doing admin actions | Server-side RBAC on every route |
| **Credential thief** | Hijack sessions / brute force login | Supabase Auth (hashing, MFA, breach detection), short-lived JWTs, rate limits |
| **Injection attacker** | SQLi / XSS / prompt injection | Parameterized queries (Drizzle), Zod, output encoding, CSP, résumé-as-data isolation |
| **Abusive uploader** | Malware, zip bombs, oversized files, quota exhaustion | Magic-byte checks, size caps, per-tenant quotas, presigned direct upload |
| **Billing fraud** | Use without paying / forge webhooks | Stripe signature verification, idempotency, server-side entitlement checks |
| **Scraper / DoS** | Mass-export data, run up our AI bill | Per-IP + per-tenant rate limits, AI usage quotas, pagination caps |
| **Insider / leaked key** | Broad data access | Least-privilege DB roles, audit log, secret rotation, field-level encryption (PII) later |

---

## 2. Runtime & stack (locked)

| Concern | Choice | Notes |
|---|---|---|
| API runtime | **Next.js 16 Route Handlers** (`src/app/api/**`) | Same repo as frontend; Node runtime (not Edge) for crypto + pg. Extractable to a standalone service later. |
| Language | TypeScript (strict) | |
| DB | **PostgreSQL + pgvector** | Local Homebrew PG for dev/test; Supabase (managed) for staging/prod. |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Type-safe, SQL-first, plays well with RLS. |
| Auth | **Supabase Auth** (GoTrue) | Issues JWTs we verify server-side with the project JWT secret. Orgs/seats in our own tables. |
| Validation | **Zod** | One schema per endpoint; shared types. |
| File storage | **Supabase Storage** | Presigned uploads; `tenants/{id}/...` key prefix. |
| Background jobs | **Inngest** (prod) / **in-process runner** (dev/test) | Behind a `JobQueue` interface so tests run jobs synchronously. |
| AI extraction | **Claude (Haiku 4.5)** behind `ResumeExtractor` iface | Mock adapter for dev/test. |
| Embeddings | **Voyage AI** behind `Embedder` iface | Mock adapter returns deterministic vectors for tests. |
| Billing | **Stripe** behind `PaymentProvider` iface | Stripe test-mode + mock for unit tests. |
| Email | **Resend** behind `Mailer` iface | Mock captures sent mail in tests. |
| Rate limiting | Token bucket; **in-memory (dev)** / **Upstash Redis (prod)** behind `RateLimiter` iface | |
| Tests | **Vitest** + **Supertest-style** route invocation, real local Postgres | Plus security/abuse suites. |
| Logging | **pino** (structured, PII-scrubbed) | Request IDs, no secrets. |

---

## 3. Request lifecycle (every API call passes through this)

```
Client ─▶ [1 Security headers]            (CSP, HSTS, no-sniff — set in middleware)
      ─▶ [2 Rate limit]                   per-IP always; per-tenant after auth
      ─▶ [3 Authenticate]                 verify Supabase JWT → userId
      ─▶ [4 Resolve tenant + role]        load USER row → tenantId + role (server truth)
      ─▶ [5 Authorize (RBAC)]             route requires role ≥ X, else 403
      ─▶ [6 Validate input (Zod)]         body/query/params; reject on fail (422)
      ─▶ [7 Open tenant-scoped tx]        SET LOCAL app.tenant_id = <tenantId>  (RLS engages)
      ─▶ [8 Service layer]                business logic; calls repositories + ports
      ─▶ [9 Repository layer]             tenant-scoped queries via Drizzle (params only)
      ─▶ [10 Audit (if sensitive)]        write AUDIT_LOG row in same tx
      ─▶ [11 Response envelope]           typed JSON; safe errors; request id
```

A single composable wrapper — `withApi(handler, { role, bodySchema, querySchema, rateLimit })` — enforces steps 1–7 and 11 so no route can forget a control. **Forgetting a control should be impossible, not just discouraged.**

---

## 4. Layered architecture & folder structure

```
recruitiq/
├─ src/
│  ├─ app/api/                      # HTTP layer — thin; parse → call service → respond
│  │  ├─ auth/{signup,session}/route.ts
│  │  ├─ candidates/route.ts        # GET list, POST create
│  │  ├─ candidates/[id]/route.ts   # GET, PATCH, DELETE
│  │  ├─ uploads/route.ts           # POST → presigned URL + draft
│  │  ├─ uploads/complete/route.ts  # POST → enqueue parse job
│  │  ├─ search/route.ts            # POST semantic search
│  │  ├─ shortlists/**              # CRUD
│  │  ├─ team/**                    # members + seats (admin)
│  │  ├─ billing/checkout/route.ts  # create Stripe checkout
│  │  ├─ webhooks/stripe/route.ts   # signed webhook (no auth, sig-verified)
│  │  └─ health/route.ts
│  ├─ server/
│  │  ├─ http/
│  │  │  ├─ with-api.ts             # the composable guard (steps 1–7,11)
│  │  │  ├─ errors.ts               # AppError hierarchy + safe mapping
│  │  │  └─ response.ts             # ok()/fail() envelope helpers
│  │  ├─ auth/
│  │  │  ├─ verify-jwt.ts           # Supabase JWT verification (jose)
│  │  │  ├─ session.ts              # resolve user → {userId,tenantId,role}
│  │  │  └─ rbac.ts                 # role hierarchy + assertRole()
│  │  ├─ db/
│  │  │  ├─ client.ts               # pg pool + drizzle
│  │  │  ├─ schema.ts               # Drizzle tables (matches ERD)
│  │  │  ├─ rls.sql                 # RLS policies (applied via migration)
│  │  │  └─ tx.ts                   # withTenantTx(tenantId, fn) — SET LOCAL
│  │  ├─ repositories/              # ONLY place that touches the DB
│  │  │  ├─ candidate.repo.ts
│  │  │  ├─ tenant.repo.ts
│  │  │  ├─ user.repo.ts
│  │  │  ├─ shortlist.repo.ts
│  │  │  ├─ subscription.repo.ts
│  │  │  └─ audit.repo.ts
│  │  ├─ services/                  # business logic, orchestration
│  │  │  ├─ candidate.service.ts
│  │  │  ├─ ingestion.service.ts    # upload → parse → embed → save
│  │  │  ├─ search.service.ts       # hybrid search
│  │  │  ├─ billing.service.ts      # entitlements, seats, webhooks
│  │  │  └─ team.service.ts
│  │  ├─ ports/                     # interfaces (hexagonal)
│  │  │  ├─ resume-extractor.ts
│  │  │  ├─ embedder.ts
│  │  │  ├─ payment-provider.ts
│  │  │  ├─ mailer.ts
│  │  │  ├─ storage.ts
│  │  │  ├─ job-queue.ts
│  │  │  └─ rate-limiter.ts
│  │  ├─ adapters/                  # implementations
│  │  │  ├─ claude.extractor.ts     +  mock.extractor.ts
│  │  │  ├─ voyage.embedder.ts      +  mock.embedder.ts
│  │  │  ├─ stripe.payment.ts       +  mock.payment.ts
│  │  │  ├─ resend.mailer.ts        +  mock.mailer.ts
│  │  │  ├─ supabase.storage.ts     +  local.storage.ts
│  │  │  ├─ inngest.queue.ts        +  inprocess.queue.ts
│  │  │  └─ redis.ratelimit.ts      +  memory.ratelimit.ts
│  │  ├─ validation/                # Zod schemas per resource
│  │  ├─ jobs/                      # job handlers (parseResume, embedCandidate)
│  │  ├─ config/env.ts              # Zod-validated env; fails fast if missing
│  │  └─ container.ts               # wires real vs mock adapters by env
│  └─ ...frontend (untouched for now)
├─ drizzle/                         # generated migrations
├─ tests/
│  ├─ integration/                  # real local PG, minted JWTs, mock adapters
│  ├─ security/                     # IDOR, RBAC, injection, rate-limit suites
│  └─ helpers/                      # test db reset, jwt minting, fixtures
└─ docs/  (this folder)
```

**Strict dependency rule:** `app/api` → `services` → `repositories` → `db`. Routes never touch the DB directly; services never build SQL. A lint rule + review forbids importing `db` outside `repositories`.

---

## 5. Security design (defense-in-depth)

### 5.1 Authentication
- Client authenticates with **Supabase Auth**; receives a JWT.
- Server **verifies the JWT signature** (jose) against the Supabase JWT secret on every request — never decodes-without-verify.
- Expired/invalid/missing token → **401**, generic message.
- We map `auth.users.id` → our `USER` row to get tenant + role. No tenant/role is ever read from the token claims the client could influence beyond the verified `sub`.

### 5.2 Authorization (RBAC)
- Roles: **admin** > **recruiter** > **viewer** (hierarchy).
- `withApi(handler, { role: "recruiter" })` rejects anything below the bar with **403** before the handler runs.
- Sensitive mutations (billing, member management, deletes) require **admin**.
- Authorization is **server-side only**; the frontend hiding a button is UX, not security.

### 5.3 Tenant isolation — the 3 layers
1. **Postgres RLS (DB-enforced).** Every tenant table has `ENABLE ROW LEVEL SECURITY` + policy `tenant_id = current_setting('app.tenant_id')::uuid`. We connect as a **non-superuser app role** (RLS is not bypassed). Even a buggy query can't return another tenant's rows.
2. **Session-derived tenant.** `app.tenant_id` is `SET LOCAL` inside the request transaction from the **verified session**, never from input.
3. **Scoped repositories.** Every repo function takes the tenant context and filters by `tenant_id` too (belt-and-suspenders), and is the only code allowed to query.
- Storage keys are `tenants/{tenant_id}/...`; signed-URL access only. Cache keys namespaced by tenant.

### 5.4 Input validation & injection defense
- **Zod** parses every input; unknown keys stripped; lengths/formats/enums enforced; numeric ranges clamped.
- **Drizzle parameterized queries only** — no string-concatenated SQL, ever.
- **XSS:** API returns JSON; any rendered text is React-escaped; strict **CSP**, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- **Prompt injection:** résumé text is wrapped as clearly-delimited **untrusted data** in the extraction prompt; the model is instructed to *extract, never follow* embedded instructions; output is **schema-constrained** so a malicious résumé can't change behavior.

### 5.5 File upload security
- Client requests a **presigned URL**; file uploads **directly to storage**, never through our server.
- Before issuing the URL: validate declared type + size cap (e.g. 10 MB) + **per-tenant quota**.
- After upload: worker re-checks **magic bytes** (real type ≠ extension), computes **sha256** (dedup + integrity), rejects mismatches. Random storage keys.
- Defenses against zip/decompression bombs and pathological PDFs (page/size limits, timeouts).

### 5.6 Rate limiting & abuse
- Per-IP limits on `auth`, `signup`, `upload`, `search` (token bucket).
- Per-tenant limits + **AI usage quotas** tied to plan → caps our Claude/Voyage spend if a tenant goes rogue.
- Pagination is **mandatory and capped** (e.g. max `limit=100`) — no unbounded list endpoints.

### 5.7 Payments & webhooks
- Stripe **Checkout** for card capture (we never touch card data → PCI scope minimized).
- Webhooks: **verify Stripe signature**, reject unsigned/replayed, process **idempotently** (store processed event ids).
- **Entitlements are server-truth:** seat count / plan / status read from our `SUBSCRIPTION` table (synced from Stripe), enforced before privileged actions — never trust the client's claim of "I'm paid."

### 5.8 Secrets, headers, logging
- `config/env.ts` Zod-validates required secrets at boot; **fails fast** if missing. Server-only keys never imported into client code.
- Security headers set globally (CSP, HSTS, nosniff, frame-ancestors none).
- **pino** structured logs with a **PII/secret scrubber**; every request gets a request id; errors logged server-side, generic to client.
- **Audit log** for sensitive actions (view/export/delete candidate, member/billing changes) written in the same transaction.

### 5.9 OWASP Top 10 → control map
| Risk | Control |
|---|---|
| Broken Access Control | RLS + session tenant + scoped repos + server RBAC |
| Cryptographic Failures | TLS, encryption at rest, secrets manager, (field-level PII enc later) |
| Injection | Zod + Drizzle params + prompt-injection isolation |
| Insecure Design | this doc + threat model + edge-case suite |
| Security Misconfig | env validation, hardened headers/CSP, least-privilege DB role |
| Vulnerable Components | `npm audit` / Dependabot in CI |
| Auth Failures | Supabase Auth (MFA, breach detection) + rate limits |
| Integrity Failures | signed webhooks, idempotency, file hashing |
| Logging/Monitoring | pino + audit log + (Sentry later) |
| SSRF | no user-supplied URLs fetched server-side; outbound allow-list |

---

## 6. Data layer & RLS mechanics

- Schema mirrors the ERD in SYSTEM_DESIGN.md (`tenant`, `user`, `candidate`, `resume_file`, `candidate_tag`, `shortlist`, `shortlist_item`, `subscription`, `audit_log`, `processed_webhook`, `usage_counter`).
- `candidate.embedding vector(1024)` with an **HNSW** index for fast ANN search; plus btree indexes on `(tenant_id, status)`, `(tenant_id, created_at)`.
- **`withTenantTx(tenantId, fn)`** opens a transaction, runs `SELECT set_config('app.tenant_id', $1, true)`, executes `fn`, commits/rolls back. All tenant-scoped repo calls run inside it.
- Two DB roles: migration/owner role (DDL) and a restricted **app role** used at runtime (no DDL, can't disable RLS, can't read other schemas).

---

## 7. API surface (v1)

| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | none | — | liveness/readiness |
| POST | `/api/auth/signup` | none | — | create tenant + admin user (post Supabase signup) |
| GET | `/api/auth/session` | yes | any | current user/tenant/role |
| GET | `/api/candidates` | yes | viewer | list (filter, paginate) |
| POST | `/api/candidates` | yes | recruiter | create draft (manual) |
| GET | `/api/candidates/:id` | yes | viewer | read one (tenant-scoped) |
| PATCH | `/api/candidates/:id` | yes | recruiter | update / approve extraction |
| DELETE | `/api/candidates/:id` | yes | admin | delete (audited) |
| POST | `/api/uploads` | yes | recruiter | presigned URL + draft + quota check |
| POST | `/api/uploads/complete` | yes | recruiter | confirm → enqueue parse job |
| POST | `/api/search` | yes | viewer | semantic + filter hybrid search |
| GET/POST | `/api/shortlists` | yes | recruiter | list/create |
| POST | `/api/shortlists/:id/items` | yes | recruiter | add candidate |
| GET/POST | `/api/team` | yes | admin | list/invite members (seat check) |
| DELETE | `/api/team/:userId` | yes | admin | remove member (free seat) |
| POST | `/api/billing/checkout` | yes | admin | Stripe checkout session |
| POST | `/api/webhooks/stripe` | sig | — | subscription sync (idempotent) |

Every endpoint: typed response envelope `{ ok, data | error }`, explicit status codes, and a row in the edge-case test matrix.

---

## 8. Async ingestion pipeline

```
POST /uploads ─▶ validate type/size/quota ─▶ presign ─▶ client uploads to storage
POST /uploads/complete ─▶ create candidate{status:processing} ─▶ enqueue parseResume job
parseResume job ─▶ download ─▶ magic-byte+hash check ─▶ extract text
               ─▶ ResumeExtractor (Claude/mock) → structured profile (schema-validated)
               ─▶ Embedder (Voyage/mock) → vector(1024)
               ─▶ save profile+vector, status:ready  (or status:error with reason + retry/backoff)
```
- In **dev/test** the `JobQueue` is the **in-process runner**, so a test can enqueue and `await` completion deterministically. In **prod** it's Inngest (retries, DLQ, observability).
- Jobs are **idempotent** (safe to retry); failures set `status:error` with a reason and bounded retries.

---

## 9. Local dev & test setup (no cloud keys needed)

- **DB:** local Postgres 16 (already running). A throwaway `talscout_test` database is created/reset per test run; `drizzle-kit` applies migrations + `rls.sql`. Requires **pgvector** (`brew install pgvector`) — *your one setup step for the search phase.*
- **Auth:** tests **mint Supabase-style JWTs** with a known test secret and feed them to `withApi`, exercising the real verify/RBAC/tenant path — no hosted Auth needed.
- **External services:** `container.ts` wires **mock adapters** under `NODE_ENV=test`/`APP_MODE=mock`. Tests assert on captured calls (emails sent, jobs run, charges created).
- **Optional later:** full **local Supabase stack** (`supabase start`, needs Docker running) for end-to-end Auth/Storage integration tests.

---

## 10. Testing strategy (the heart of "test all APIs yourself")

Layers, each gating the next:
1. **Unit** — services & pure logic (RBAC hierarchy, quota math, hybrid-rank, validation schemas).
2. **Integration** — real route handler invoked over real local Postgres with minted JWT + mock adapters. Asserts status, envelope, DB side-effects, audit rows.
3. **Security/abuse suite** — the [EDGE_CASES.md](./EDGE_CASES.md) matrix: cross-tenant IDOR, role escalation, malformed/oversized/oversigned input, injection strings, replayed webhooks, expired tokens, quota breaches, pagination abuse, concurrency/idempotency.
4. **Pipeline tests** — upload→parse→embed→search end-to-end with mock AI, including failure/retry paths.

CI gate: lint + typecheck + `npm audit` + all suites green. **No endpoint ships without its edge-case rows passing.**

---

## 11. Build phases (mocks-first; I'll ask for what's needed at each)

| Phase | Deliverable | Needs from you |
|---|---|---|
| **B0** | Tooling: deps (drizzle, zod, pino, jose, vitest…), env schema, `withApi` skeleton, test harness, CI script | nothing |
| **B1** | DB schema + migrations + **RLS** + repositories + `withTenantTx` + isolation tests | `brew install pgvector` (or I run it w/ your ok) |
| **B2** | Auth + session + RBAC + `/auth/*` + security suite (IDOR/RBAC/JWT) | nothing |
| **B3** | Candidates CRUD + validation + pagination/filter + audit + edge-case suite | nothing |
| **B4** | Ingestion pipeline (uploads, jobs, **mock** extractor+embedder+storage) + pipeline tests | nothing |
| **B5** | Semantic search (pgvector + hybrid rank, **mock** embeddings) + search edge cases | pgvector |
| **B6** | Billing (Stripe **test mode**/mock) + webhooks + entitlements + seat logic + tests | Stripe test keys (later) |
| **B7** | Go-real: swap mocks → Supabase + Anthropic + Voyage + Stripe; staging | all real keys |
| **B8** | Hardening: rate limits (Redis), Sentry, secret rotation, pen-test pass | Upstash + Sentry |

Frontend wiring happens **after** B6 is green — exactly as you asked.

---

## 12. Open items to confirm before B1
1. **pgvector install** locally (`brew install pgvector`) — ok to run?
2. Region/data-residency target (US-first?) — affects later Supabase project, not the code.
3. Anything you want added to the API surface in §7 before we lock it.
