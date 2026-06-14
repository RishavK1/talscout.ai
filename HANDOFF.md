# TalScout — Project Handoff (continue from here)

> **Read this first.** This is a complete, self-contained handoff for a new AI coding agent (e.g. Antigravity) to continue building **TalScout** without the previous chat history. Last updated: 2026-06-14.

---

## 1. What TalScout is

**TalScout** ("Your AI talent scout") is a **bootstrapped, production-intent vertical SaaS**: AI résumé parsing + semantic candidate search for **staffing / recruiting agencies**.

- **Two core value props:** (1) drop in résumés → AI extracts structured candidate data (no more manual typing); (2) search your whole candidate database in **plain English** (semantic search), not dumb keywords.
- **Multi-tenant**, **per-seat pricing** ($99 / $199 / $399 per recruiter / mo: starter/growth/scale).
- **Domain:** talscout.ai (to be registered). Brand: TalScout.
- Owner: solo/lightly-technical founder. **Security is paramount** — résumés are personal data; one agency must never see another's.

**Design docs (read these — they are the source of truth):**
- `../SYSTEM_DESIGN.md` — product + high-level architecture, ERD, security, scalability, cost, roadmap.
- `docs/BACKEND_ARCHITECTURE.md` — the backend contract (layers, security, threat model, API surface, phases).
- `docs/EDGE_CASES.md` — the 90+ edge-case / abuse test matrix (auth, IDOR, validation, upload, AI, search, billing, etc.).

---

## 2. Current status (TL;DR)

| Area | Status |
|---|---|
| **Frontend** (Next.js) | ✅ Done — 25 pages, premium Clera-inspired landing (gradients + cursor-follow), responsive, all interactivity. **Not yet wired to the backend.** |
| **Backend B0–B6 (mocks-first)** | ✅ **Feature-complete & tested: 98/98 automated tests, tsc + eslint clean.** Auth, RBAC, tenant isolation (RLS), candidates CRUD, ingestion pipeline, semantic search, billing, team/seats. |
| **B7 go-real (real services)** | 🟡 **In progress.** Real adapters (Claude/Voyage/Stripe/Supabase Storage) built + compile. **Supabase DB (Stage 1) is provisioned** (schema + RLS + vector index + restricted role applied to the live project). Remaining: AI keys (Stage 2), Stripe (Stage 3), live smoke tests. |
| **Frontend ↔ backend wiring** | ⬜ Not started (was intentionally deferred until backend green — now unblocked). |
| **B8 hardening / deploy** | ⬜ Not started (rate limiting via Redis, Sentry, Inngest for jobs, CI, Vercel deploy). |

**Constraint the founder set:** mocks-first; **test every API + edge case in isolation before wiring the frontend.** Keep that discipline.

---

## 3. Tech stack

- **App:** Next.js 16.2.9 (App Router) + React 19 + TypeScript (strict) + Tailwind v4. Backend = Next.js **Route Handlers** under `src/app/api/**` (Node runtime).
- **DB:** PostgreSQL + **pgvector**. Local dev/test = Homebrew Postgres 16. Production = **Supabase** (project `ezciskkmeofgosliaitc`, region `ap-northeast-1`/Tokyo).
- **ORM:** Drizzle (`drizzle-orm`, `drizzle-kit`). **Auth:** Supabase Auth (JWT, HS256, verified server-side with `jose`). **Storage:** Supabase Storage.
- **AI:** Claude (Haiku 4.5 for extraction, Sonnet 4.6 fallback) via `@anthropic-ai/sdk`; **Voyage** (`voyage-3`, 1024-dim) for embeddings.
- **Billing:** Stripe. **Email:** Resend (not wired yet). **Jobs:** in-process now; **Inngest** planned for serverless.
- **Validation:** Zod (v4). **Logging:** pino. **Tests:** Vitest.

---

## 4. Architecture (how the backend is organized)

Hexagonal / ports-and-adapters. **Strict layering:** `app/api` (thin) → `services` → `repositories` → `db`. Only repositories touch the DB. External services sit behind **ports** with **mock** and **real** adapters chosen by `APP_MODE` in `src/server/container.ts`.

**Every authenticated route goes through ONE guard** — `withAuth()` in `src/server/http/with-api.ts`:
`security headers → (rate limit hook) → verify JWT → resolve session (tenant+role from DB, never the token) → RBAC → Zod validation → tenant-scoped DB transaction → safe response envelope`. Public routes (signup/webhook/health) use `withPublic()`.

**Tenant isolation = 3 layers** (the most important security property):
1. **Postgres RLS** — every tenant table has a `tenant_isolation` policy keyed on `app.tenant_id`.
2. **Session-derived tenant** — `app.tenant_id` is `SET LOCAL` per transaction from the verified session, never from client input.
3. **Scoped repositories** — every query also filters by `tenant_id`.

**Crucial mechanism (`src/server/db/tx.ts` → `withTenantTx`):** each request tx runs `SET LOCAL ROLE talscout_app` + `SET LOCAL search_path public, extensions` + `set_config('app.tenant_id', …)`. The restricted role `talscout_app` is **non-owner, non-BYPASSRLS**, so RLS is enforced for app queries. Admin/bootstrap/webhook paths use `adminDb()` (the owner/`postgres` role, which bypasses RLS by design — owner locally, `BYPASSRLS` on Supabase).

---

## 5. Repository layout (key files)

```
recruitiq/                      # the Next.js app (this folder). NOTE: folder is still named "recruitiq"; brand is TalScout.
├─ HANDOFF.md                   # <- you are here
├─ docs/BACKEND_ARCHITECTURE.md, docs/EDGE_CASES.md
├─ drizzle/                     # SQL migrations: 0000_init, 0001_search (HNSW idx), 0002_members (auth_user_id nullable)
├─ src/app/                     # FRONTEND pages + API routes
│  ├─ (marketing/app pages...) # 25 frontend routes (landing, dashboard, search, candidates, etc.) — see src/app/*/page.tsx
│  └─ api/                      # BACKEND routes:
│     ├─ health, auth/{signup,session}, candidates(+[id]), uploads(+complete),
│     └─ search, billing/checkout, webhooks/stripe, team(+[userId])
├─ src/server/
│  ├─ config/env.ts             # Zod-validated env, fail-fast, mock|live
│  ├─ http/{with-api,errors,response}.ts   # the guard + AppError + envelope
│  ├─ auth/{verify-jwt,session,rbac}.ts
│  ├─ db/{schema,client,tx,setup,rls.sql}.ts
│  ├─ repositories/*.repo.ts    # candidate, user, tenant, subscription, audit, resume-file, usage, webhook
│  ├─ services/*.service.ts     # auth, candidate, ingestion, search, billing, team
│  ├─ ports/index.ts            # Storage, ResumeExtractor, Embedder, JobQueue, PaymentProvider
│  ├─ adapters/                 # mock.* (used now) + real: claude.extractor, voyage.embedder, stripe.payment, supabase.storage
│  ├─ jobs/parse-resume.ts      # ingestion job (download→verify→extract→embed→save)
│  ├─ ingestion/file-type.ts    # magic-byte detection, size cap
│  ├─ validation/*.ts           # zod schemas per resource
│  └─ container.ts              # wires mock vs live adapters by APP_MODE
├─ scripts/setup-supabase.mjs   # applies schema+RLS+role to Supabase (pooler-robust, idempotent)
├─ tests/                       # vitest: integration/ + security/ + helpers/   (98 tests)
├─ .env.local                   # LOCAL dev (mock mode, local postgres)  [gitignored]
└─ .env.live                    # LIVE secrets (Supabase etc.)           [gitignored — DO NOT COMMIT]
```

---

## 6. How to run & test (do this first to confirm it works)

**Prereqs:** Node 22, local Postgres running (`brew services start postgresql@16`), pgvector for PG16 (built from source — see Gotchas if missing), then `npm install`.

```bash
cd recruitiq
npm install
npm test            # runs the full vitest suite against LOCAL postgres → expect 98 passing
npx tsc --noEmit    # type check → expect 0 errors
npm run lint        # → 0 errors
```
The test harness auto-creates a `talscout_test` database + `talscout_app` role on local Postgres (see `tests/helpers/global-setup.ts` + `src/server/db/setup.ts`). It mints HS256 JWTs to exercise the real auth path, and uses mock adapters (no cloud keys needed).

**Run the frontend** (mock backend): `PORT=3100 npm run dev` → http://localhost:3100.

---

## 7. Live / Supabase status (B7)

**Supabase project:** `ezciskkmeofgosliaitc` (Tokyo, `ap-northeast-1`), free tier. Connect via the **Session pooler** (IPv4): `aws-1-ap-northeast-1.pooler.supabase.com:5432`, user `postgres.ezciskkmeofgosliaitc`. (Direct connection is IPv6-only and unreachable from typical networks.)

**Done:** `scripts/setup-supabase.mjs` was run successfully → pgvector installed (in `public`), `talscout_app` role created + `GRANT talscout_app TO postgres`, all tables + indexes + the HNSW vector index created, RLS enabled + `tenant_isolation` policies on all 10 tenant tables, grants applied. Verified: **5/5 core tables, 10 RLS tables, postgres∈talscout_app = true.**

**Secrets** live in `recruitiq/.env.live` (gitignored). Currently set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (verified against the service_role token), `DATABASE_URL` + `DATABASE_ADMIN_URL` (session pooler), `SUPABASE_STORAGE_BUCKET=resumes`, `APP_MODE=live`, `APP_DB_ROLE=talscout_app`.
⚠️ **Rotate these secrets** (they were shared in a chat). Create a private Storage bucket named **`resumes`** if not already.

**Still needed to finish B7 (the founder must provide):**
- **Stage 2 — AI:** `ANTHROPIC_API_KEY` (console.anthropic.com, needs card), `VOYAGE_API_KEY` (voyageai.com, free tier).
- **Stage 3 — Stripe (test mode):** `STRIPE_SECRET_KEY` (sk_test_…), 3 per-seat recurring prices → `STRIPE_PRICE_STARTER/GROWTH/SCALE`, `STRIPE_WEBHOOK_SECRET` (whsec_…; use `stripe listen` locally).
- **Stage 4 — email (optional):** `RESEND_API_KEY`.

`env.ts` requires all Stage-2/3 keys when `APP_MODE=live`. To run live with only the DB so far, keep `APP_MODE=mock` but point `DATABASE_URL`/`DATABASE_ADMIN_URL`/`SUPABASE_JWT_SECRET` at Supabase (DB + auth paths work; AI/billing stay mocked).

---

## 8. What's left (priority order)

1. **B7 live smoke tests** (FIRST — verifies the foundation):
   - Verify the RLS-under-`SET ROLE` model on Supabase: as `postgres`, seed a tenant+candidate; in a tx do `SET LOCAL ROLE talscout_app` + `set_config('app.tenant_id',…)` → confirm you see only your tenant's rows and `WITH CHECK` blocks cross-tenant inserts. (This was prepared but NOT yet run on the live DB.)
   - End-to-end: mint a JWT with `SUPABASE_JWT_SECRET` → call `/api/auth/signup`, `/api/auth/session`, `/api/candidates` against Supabase.
2. **B7 Stage 2:** add Anthropic + Voyage keys, flip `APP_MODE=live`, smoke-test real upload → parse → embed → search.
3. **B7 Stage 3:** Stripe test keys + prices + webhook; smoke-test checkout + webhook → subscription sync + seat enforcement.
4. **Frontend ↔ backend wiring:** connect the existing Next.js pages to the API routes (Supabase Auth client for login/signup; fetch candidates/search/uploads/billing). The API surface is in `docs/BACKEND_ARCHITECTURE.md §7`.
5. **B8 hardening + deploy:** real rate limiting (Upstash Redis behind a `RateLimiter` port — port exists in design, adapter TODO), **Inngest** for the job queue (the in-process queue is frozen on Vercel after the response — MUST switch before serverless deploy), Sentry, security headers on pages, CI (lint+typecheck+test+`npm audit`), Vercel deploy. Register `talscout.ai`.
6. **Email:** wire Resend for team invites (Mailer port not built yet — add it).

---

## 9. Hard-won gotchas (don't rediscover these)

- **NEVER run `npm run build` while `npm run dev` is running** — they share `.next` and it corrupts the Turbopack cache (all routes 500). Fix: `pkill -f "next dev"; rm -rf .next; npm run dev`.
- **pgvector for Homebrew PG16** had to be **built from source** (the brew bottle only shipped PG17/18): `git clone --branch v0.8.0 pgvector && make PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config && make install …`.
- **Supabase direct DB connection is IPv6-only** → use the **Session pooler** (IPv4, port 5432, user `postgres.<ref>`). Transaction pooler (6543) won't work for migrations / `SET LOCAL`.
- **Supabase `postgres` has `BYPASSRLS`** and owns the tables → it bypasses RLS (good for admin paths). The runtime must `SET LOCAL ROLE talscout_app` (non-bypass) so RLS is enforced. This is already in `withTenantTx`.
- **Supavisor pooler drops the connection on some role/DO-block ops** (`EDBHANDLEREXITED`) → `setup-supabase.mjs` runs **one statement per fresh connection** and avoids DO blocks.
- **Remote Postgres needs SSL** → `src/server/db/client.ts` enables `ssl:{rejectUnauthorized:false}` for non-localhost URLs.
- **Don't put Chrome user-data-dirs inside the repo** (causes Turbopack panic + junk files) — use `/tmp`.
- **Zod v4** is in use (`z.email()`, `z.uuid()` top-level; objects strip unknown keys by default = mass-assignment defense).
- **In-process job queue** runs jobs inline (awaited) — fine for tests/staging, but **will not complete on Vercel** (function frozen post-response). Switch to Inngest before serverless prod.

---

## 10. ▶ PROMPT TO PASTE INTO THE NEXT AGENT (Antigravity)

```
You are continuing development of "TalScout", a multi-tenant SaaS (AI résumé
parsing + semantic candidate search for staffing agencies). The codebase is in
the `recruitiq/` folder (Next.js 16 + TypeScript + Drizzle + Postgres/pgvector +
Supabase). Brand is "TalScout"; the folder is still named recruitiq.

START HERE:
1. Read recruitiq/HANDOFF.md fully, then recruitiq/docs/BACKEND_ARCHITECTURE.md
   and recruitiq/docs/EDGE_CASES.md and ../SYSTEM_DESIGN.md.
2. Confirm the baseline works: `cd recruitiq && npm install && npm test`
   (expect 98 passing), `npx tsc --noEmit` (0 errors), `npm run lint` (0).

HARD RULES (the founder insists):
- This is a real, security-critical product. Tenant isolation is sacred — never
  weaken the 3-layer RLS model (RLS + session-derived tenant + scoped repos).
- Mocks-first: keep external services behind the ports in src/server/ports;
  build/verify with mock adapters and tests BEFORE wiring anything live.
- Every new endpoint must enforce auth→RBAC→Zod validation via withAuth/withPublic
  and ship with edge-case tests from docs/EDGE_CASES.md. No endpoint ships
  without its abuse-path tests passing. Keep tsc + eslint clean.
- Do not run `npm run build` while `npm run dev` is running.
- Ask the founder before any action that costs money or touches the live
  Supabase/Stripe/AI accounts.

CURRENT STATE: Backend B0–B6 are complete and tested (98 tests). B7 (go-real) is
in progress: real adapters are written; the Supabase database is provisioned
(schema + RLS + vector index + talscout_app role). Live secrets are in
recruitiq/.env.live (gitignored) — Supabase DB/auth/storage are set; Anthropic,
Voyage, and Stripe keys are still needed.

YOUR NEXT TASKS (in order), pausing for founder input where keys are needed:
1. Run the live Stage-1 smoke tests described in HANDOFF.md §8.1 (verify RLS
   under SET ROLE on Supabase, then signup/session/candidates against Supabase).
2. With the founder's Anthropic + Voyage keys, flip APP_MODE=live and smoke-test
   the real upload→parse→embed→search pipeline.
3. With Stripe test keys + prices + webhook secret, smoke-test billing.
4. Wire the existing frontend pages to the API (Supabase Auth on the client;
   fetch the API routes in docs/BACKEND_ARCHITECTURE.md §7).
5. Hardening + deploy (B8): Inngest for jobs (required before Vercel), rate
   limiting, Sentry, CI, deploy. Register talscout.ai.

Work in small, verified increments. After each change run the tests. Report what
you changed, what passed, and what you need from the founder.
```

---

## 11. Quick reference — commands

```bash
cd recruitiq
npm install
npm test                                  # full suite (local pg, mocks) → 98 passing
npx tsc --noEmit                          # type check
npm run lint                              # eslint
npm run db:generate                       # regenerate Drizzle migration from schema (rarely)
PORT=3100 npm run dev                     # run app (mock backend) at :3100
node --env-file=.env.live scripts/setup-supabase.mjs   # (re)apply schema to Supabase (idempotent)
```

Good luck — the foundation is solid and well-tested. Keep the security discipline and the mocks-first → verify-live rhythm.
