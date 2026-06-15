<div align="center">

# TalScout

### Stop typing résumés. Start finding talent.

AI résumé parsing + semantic candidate search for high-volume recruitment teams.
Turn chaotic PDFs into a structured, searchable candidate database in seconds.

[Architecture](#-architecture) · [Quick start](#-quick-start) · [Configuration](#-configuration) · [Testing](#-testing) · [Project layout](#-project-layout)

</div>

---

## Overview

TalScout is a multi-tenant SaaS where staffing agencies upload résumés, an LLM extracts a
structured profile from each one, and recruiters find candidates with **semantic search** —
describe the person you want in plain English and get a ranked shortlist, not a keyword match.

The product's defining feature is a **two-stage retrieve → rerank** search pipeline: vector
ANN narrows thousands of candidates to a shortlist, then an LLM *reads* each profile and scores
true fit — so a full-stack engineer with one incidental "video editing" certification doesn't
surface for a "video editor" search.

### Highlights

- 🔍 **Semantic search** — vector retrieval (pgvector/HNSW) + LLM reranking with "why matched" reasons.
- 🧠 **AI résumé extraction** — Gemini or Claude behind a common port; output is schema-validated and deterministically normalized.
- 🏢 **Multi-tenant by design** — tenant isolation enforced at **three** layers (Postgres RLS, session-derived tenant context, scoped repositories).
- 🔐 **Security-first** — server-verified JWTs, RBAC, Zod validation at every edge, signed Stripe webhooks, rate limiting, audit log.
- 💳 **Plan-based entitlements** — server-enforced quotas and capability gating (Starter / Growth / Scale).
- 🧪 **Mocks-first** — every external service has a mock adapter, so the whole backend runs and is tested with **zero paid keys**.

---

## 🏗 Architecture

```
 Browser (Next.js App Router, React 19)
    │  Supabase JWT (Bearer)
    ▼
 Route handlers  ──►  withApi guard  ──►  Services  ──►  Repositories  ──►  Postgres + pgvector
 (src/app/api)        (authn, RBAC,        (business        (only layer        (RLS-enforced
                       Zod, rate limit,     logic)           that touches DB)    per tenant)
                       tenant tx)
                                │
                                ▼
                          Ports / Adapters (hexagonal)
              ┌───────────────┬───────────────┬───────────────┬──────────────┐
           Extractor        Embedder        Reranker         Storage        Payments / Queue
        (Gemini/Claude)   (Voyage)        (Gemini)         (Supabase)       (Stripe / Inngest)
           + mock           + mock          + mock           + mock           + mocks
```

| Layer        | Technology |
|--------------|------------|
| Framework    | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Database     | PostgreSQL + pgvector, Drizzle ORM + drizzle-kit |
| Auth         | Supabase Auth (GoTrue); JWTs verified server-side with `jose` |
| AI           | Gemini (`gemini-2.5-flash`) or Claude (Haiku) — extraction **and** reranking |
| Embeddings   | Voyage AI (`voyage-3`, 1024-dim) |
| Storage      | Supabase Storage (presigned direct uploads) |
| Billing      | Stripe Checkout + signed webhooks |
| Jobs         | Inngest (prod) / in-process runner (dev/test) |
| Validation   | Zod | 
| Tests        | Vitest against real local Postgres |

> Deeper design notes live in [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md)
> and the edge-case matrix in [`docs/EDGE_CASES.md`](docs/EDGE_CASES.md).

---

## 🚀 Quick start

### Prerequisites

- **Node.js ≥ 20** (developed on 22)
- **PostgreSQL 16** with the **pgvector** extension
  ```bash
  # macOS (Homebrew)
  brew install postgresql@16 pgvector
  brew services start postgresql@16
  ```
- An npm-compatible package manager

### 1. Clone & install

```bash
git clone https://github.com/RishavK1/talscout.ai.git
cd talscout.ai          # repo dir is `recruitiq`
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

For the **fastest** start, leave `APP_MODE=mock` and only set:
`DATABASE_URL`, `DATABASE_ADMIN_URL`, `APP_DB_ROLE`, `SUPABASE_JWT_SECRET`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
See [Configuration](#-configuration) for the full reference.

### 3. Create the database

**Local Postgres (recommended for dev).** Point `DATABASE_ADMIN_URL` at a local
database, create it, then bootstrap schema + RLS + the restricted role:

```bash
createdb talscout_dev
npm run db:setup        # reads .env.local
```

`db:setup` installs pgvector, applies every migration in `drizzle/`, applies
`src/server/db/rls.sql`, and creates the `talscout_app` runtime role. It targets
whatever database `DATABASE_ADMIN_URL` names, so make sure that URL points at your
**local** `talscout_dev`, e.g.
`postgresql://<you>@localhost:5432/talscout_dev`.

**Supabase (staging/prod).** When your `DATABASE_*` URLs point at a Supabase
project, use the pooler-robust, fully idempotent provisioner instead:

```bash
node --env-file=.env.local scripts/setup-supabase.mjs
```

### 4. Run

```bash
npm run dev
```

Open **http://localhost:3000**. Sign up to create a workspace and start uploading résumés.

---

## ⚙️ Configuration

All variables are validated at boot ([`src/server/config/env.ts`](src/server/config/env.ts)) —
the app **fails fast** if a required one is missing. `.env.example` is the canonical list.

### Always required

| Variable | Description |
|---|---|
| `APP_MODE` | `mock` (no external keys) or `live` (real providers) |
| `DATABASE_URL` | Runtime connection — the **restricted** role (RLS enforced) |
| `DATABASE_ADMIN_URL` | Owner/superuser connection for migrations & `db:setup` |
| `APP_DB_ROLE` | Restricted runtime role name (default `talscout_app`) |
| `SUPABASE_JWT_SECRET` | Secret used to verify session JWTs (≥ 16 chars) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client |

### Required only when `APP_MODE=live`

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` *or* `ANTHROPIC_API_KEY` | AI extraction + reranking |
| `VOYAGE_API_KEY` | Embeddings |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | File storage (server-only) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Billing |
| `RESEND_API_KEY` | Transactional email |

> **mock vs live:** In `mock` mode the container wires deterministic adapters
> (no network, no cost) — ideal for local dev and CI. Flip to `live` only once
> the corresponding keys are present.

---

## 🧪 Testing

Tests run against a **real local Postgres** (a throwaway `talscout_test` DB is
created and reset automatically) with `APP_MODE=mock`, so no paid keys are needed.

```bash
npm test            # run the full suite once
npm run test:watch  # watch mode
```

Suites cover integration (candidates, search, ingestion, billing, team,
entitlements) and security/abuse (tenant isolation/IDOR, RBAC, auth, rate
limiting). The test database connection is configured in `vitest.config.ts`.

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite |
| `npm run db:setup` | Bootstrap the local dev DB (role, schema, RLS) |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |

---

## 📂 Project layout

```
src/
├─ app/                     # Next.js App Router
│  ├─ api/                  # Route handlers (thin: parse → service → respond)
│  └─ (pages)               # dashboard, search, candidates, upload, billing, team…
├─ components/              # React UI (app shell, candidate, marketing, …)
├─ lib/                     # client helpers (api client, plans catalog, supabase)
└─ server/
   ├─ http/                 # withApi guard, error hierarchy, response envelope
   ├─ auth/                 # JWT verify, session resolution, RBAC
   ├─ db/                   # drizzle client, schema, RLS, tenant-scoped tx
   ├─ repositories/         # the only layer that touches the DB
   ├─ services/             # business logic (search, ingestion, billing, …)
   ├─ ports/                # hexagonal interfaces
   ├─ adapters/             # implementations (real + mock) per port
   ├─ ingestion/            # text extraction, file-type, profile normalization
   ├─ jobs/                 # parseResume pipeline
   └─ validation/           # Zod schemas per resource
drizzle/                    # generated SQL migrations
tests/                      # integration + security suites, helpers
docs/                       # architecture & edge-case docs
```

**Dependency rule:** `app/api → services → repositories → db`. Routes never query
the DB directly; services never build SQL.

---

## 🔍 How search works

1. **Retrieve** — the query is embedded (query-side) and matched against candidate
   vectors via pgvector's HNSW index, scoped to the tenant's `ready` candidates.
2. **Rerank** — the shortlist is handed to an LLM that scores genuine relevance and
   returns a one-line reason per candidate; incidental keyword hits are demoted.
3. **Respond** — the top results are returned with match scores and "why matched"
   explanations. The stage fails safe to pure vector order if the reranker is unavailable.

Résumé extraction feeds this: each profile is schema-validated and then
**deterministically normalized** (canonical skill names, deduped contacts,
derived years of experience) so embeddings and filters stay clean and comparable.

---

## 🤝 Contributing

1. Branch from `main`.
2. Keep the layering intact (`app → services → repositories → db`) and add a Zod
   schema for any new input.
3. Every endpoint ships with happy-path **and** abuse-path tests.
4. `npm run lint && npm test` must be green before opening a PR.

---

<div align="center">
<sub>Built for recruiters who'd rather find talent than retype it.</sub>
</div>
