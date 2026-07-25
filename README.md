<div align="center">

# TalScout

### AI that finds your next customer — and your next hire.

Two AI engines in one multi-tenant SaaS: **Outreach** discovers businesses that fit what you
sell and writes each of them a personal cold email; **Talent** turns a pile of résumés into a
database you can search in plain English.

[Architecture](#-architecture) · [Quick start](#-quick-start) · [Configuration](#-configuration) · [Testing](#-testing) · [Project layout](#-project-layout)

</div>

---

## Overview

TalScout runs two independent product engines that share a workspace, a login, and the same
hexagonal backend. They deliberately never cross wires — no résumé feeds an outreach campaign,
and no discovered lead lands in the candidate database.

### 🚀 Outreach — win new business

**AI Automated Outreach** is the flagship pipeline. Set a campaign once (what you sell, who you
want, where they are) and a cron-driven job repeats the whole loop on its own:

```
Blueprint ──► Discover ──► Find email ──► Qualify ──► Write ──► Send (Day 0/3/7) ──► Reply drafts
```

1. **Blueprint** — we read your website, research your company live on the web (Perplexity Sonar),
   and turn your confirmed answers into a structured brief every email is grounded in.
2. **Discover** — real businesses from OpenStreetMap/Overpass (free), topped up by Geoapify and
   optionally Google Places.
3. **Find email** — a waterfall (site scrape → Firecrawl → Hunter → Snov → Apollo). No email
   found means the lead never enters the send pipeline.
4. **Qualify** — free rule-based checks resolve most leads; only genuinely ambiguous ones cost an
   LLM call, judged against the blueprint's `leadQualification` criteria.
5. **Write & send** — per-lead copy grounded strictly in the blueprint, sent from the customer's
   **own** Gmail/SMTP mailbox on a block+jitter schedule, threaded so Day 3/7 reply into Day 0.
6. **Replies** — inbound replies are detected and an AI draft is queued for **human approval**.
   There is no code path that sends an AI-written reply without a person approving it.

**Bulk Fire** is the manual counterpart: bring your own contact list, build a sequence once, and
fire it across multiple rotating mailboxes — plus a WhatsApp Business channel on Scale.

### 🔍 Talent — place the right people

AI résumé extraction into structured, human-reviewed profiles, then a **two-stage retrieve →
rerank** search: vector ANN narrows thousands of candidates to a shortlist, then an LLM *reads*
each profile and scores true fit — so a full-stack engineer with one incidental "video editing"
certification doesn't surface for a "video editor" search.

### Highlights

- 🧠 **Grounded AI everywhere** — every writing prompt is anti-hallucination hardened; untrusted
  input (websites, inbound replies) is tagged as data and never followed as instructions.
- 🏢 **Multi-tenant by design** — isolation enforced at **three** layers (Postgres RLS,
  session-derived tenant context, scoped repositories).
- 🔐 **Security-first** — server-verified JWTs, RBAC, Zod at every edge, signed Stripe/Meta
  webhooks, rate limiting, audit log. Mailbox credentials are AES-256-GCM encrypted at rest.
- 💳 **Plan-based entitlements** — server-enforced quotas and capability gates (Starter/Growth/Scale).
- ⚙️ **Durable background jobs** — Inngest with step checkpointing; a crash mid-tick resumes from
  the next unfinished batch instead of redoing costly work.
- 🧪 **Mocks-first** — every external service has a mock adapter, so the whole backend runs and is
  tested with **zero paid keys**.

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
   ┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
 Extractor      Embedder      Reranker    BlueprintGen/     LeadDiscovery
(Gemini/Claude) (Voyage)      (Gemini)    Researcher        (Overpass/Geoapify/
                                          WebResearcher      Google Places)
                                          (Perplexity)
   ├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
 EmailFinder   LeadQualifier  Copywriter    ReplyDrafter   OutreachMailer
(scrape/Hunter/ (Gemini/       (Gemini/      (Gemini/       (Gmail API / SMTP)
 Snov/Apollo)    OpenRouter)    OpenRouter)   OpenRouter)
   └──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
              Storage (Supabase) · Payments (Stripe) · Queue (Inngest) · WhatsApp (Meta)
                            every port ships a mock adapter
```

| Layer        | Technology |
|--------------|------------|
| Framework    | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Database     | PostgreSQL + pgvector, Drizzle ORM + drizzle-kit |
| Auth         | Supabase Auth (GoTrue); JWTs verified server-side with `jose` |
| AI (primary) | Gemini (`gemini-2.5-flash`) — extraction, reranking, blueprints, copy, replies |
| AI (fallback)| OpenRouter free models — tried only after Gemini's primary + fallback both fail |
| AI (research)| Perplexity Sonar — live web research, once per blueprint generation |
| Embeddings   | Voyage AI (`voyage-3`, 1024-dim) |
| Lead data    | OpenStreetMap/Overpass (free) → Geoapify → Google Places (optional, paid) |
| Email finding| Site scrape → Firecrawl → Hunter → Snov → Apollo (all key-gated, free tiers) |
| Sending      | Gmail API (server-side OAuth, offline) or SMTP via nodemailer |
| Storage      | Supabase Storage (presigned direct uploads) |
| Billing      | Stripe Checkout + signed webhooks |
| Jobs         | Inngest (prod) / in-process runner (dev/test) |
| Validation   | Zod |
| Tests        | Vitest against real local Postgres |

> Deeper design notes live in [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md)
> and the edge-case matrix in [`docs/EDGE_CASES.md`](docs/EDGE_CASES.md).

### Background jobs

Registered in [`src/app/api/inngest/route.ts`](src/app/api/inngest/route.ts):

| Job | Trigger |
|---|---|
| `parse-resume`, `parse-leads-docx` | Event (upload completed) |
| `run-automated-campaigns` | Cron `0 0,6,12,18 * * *` (every 6h) |
| `run-automated-campaign-now` | Event (fired on campaign activation) |
| `send-automated-email`, `send-outreach-email` | Event + `step.sleepUntil` for paced sending |
| `poll-automated-replies`, `poll-outreach-replies` | Cron `*/20 * * * *` |
| `fire-scheduled-campaign` | Cron `*/30 * * * *` |
| `send-outreach-whatsapp`, `sync-whatsapp-templates` | Event / cron |

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

Open **http://localhost:3000**.

**Background jobs.** Outreach depends on scheduled work, so run the Inngest dev
server alongside `npm run dev` when working on campaigns:

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Its dashboard is at **http://localhost:8288**.

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

### Required when `APP_MODE=live`

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` *or* `ANTHROPIC_API_KEY` | AI extraction, reranking, blueprints, copy, replies |
| `VOYAGE_API_KEY` | Embeddings |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | File storage (server-only) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Billing |
| `RESEND_API_KEY` | Transactional email |

### Outreach (opt-in — the feature degrades gracefully without each)

| Variable | Purpose | Notes |
|---|---|---|
| `OUTREACH_ENCRYPTION_KEY` | AES-256-GCM key for mailbox secrets | **Required to connect any sender.** `openssl rand -base64 32` |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | Server-side "Connect Gmail" (offline access) | Required for Gmail senders |
| `PERPLEXITY_API_KEY` | Live web research during blueprint generation | **Metered.** Called once per blueprint, never per lead |
| `OPENROUTER_API_KEY` | Last-resort fallback for all AI writing ports | Free tier; only after Gemini fails |
| `GEOAPIFY_API_KEY` | Lead-discovery top-up | Free 3k/day |
| `GOOGLE_PLACES_API_KEY` | Lead-discovery last resort | **Not free** — only constructed when set |
| `FIRECRAWL_API_KEY` | JS-rendering scrape for email finding | Free 1k/mo |
| `HUNTER_API_KEY`, `SNOV_CLIENT_ID`/`_SECRET`, `APOLLO_API_KEY` | Email-finder waterfall rungs | Free tiers |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | WhatsApp Business channel | Scale plan only |

> `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` are read directly from the environment by the
> Inngest SDK rather than through `env.ts`, so they aren't validated at boot — set them in
> production or jobs will fail to register. Locally, `INNGEST_DEV=1` is enough.

> **mock vs live:** In `mock` mode the container wires deterministic adapters
> (no network, no cost) — ideal for local dev and CI. Flip to `live` only once
> the corresponding keys are present. Lead discovery and email scraping need
> **no** keys at all; the paid rungs are pure top-ups.

---

## 💳 Plans & entitlements

Single source of truth: [`src/lib/plans.ts`](src/lib/plans.ts). Quotas are enforced
**server-side** via `billingService.assertCapability` and per-plan limit checks —
never in the UI alone.

| | Starter $99 | Growth $199 | Scale $399 |
|---|---|---|---|
| **Automated emails / day** | 25 | 150 | 500 |
| Blueprints | 1 | 5 | Unlimited |
| Active campaigns | 1 | 5 | Unlimited |
| Sender mailboxes | 1 | 3 | 10 |
| Live web research | — | ✓ | ✓ |
| **Bulk Fire** | — | 100/day | Unlimited |
| Scheduled sends / WhatsApp | — | — | ✓ |
| **Résumés / month** | 200 | 1,500 | Unlimited |
| Bulk upload, filters, ATS export | — | ✓ | ✓ |
| API access, SSO, audit log | — | — | ✓ |

The automated daily cap is deliberately **never `Infinity`** on any plan: uncapped cold
email wrecks the customer's own sending reputation and is unbounded cost per lead.

---

## 🧪 Testing

Tests run against a **real local Postgres** (a throwaway `talscout_test` DB is
created and reset automatically) with `APP_MODE=mock`, so no paid keys are needed.

```bash
npm test            # run the full suite once
npm run test:watch  # watch mode
```

**281 tests across 30 files.** Coverage spans the outreach pipeline (discovery,
qualification, copy generation, paced sending, reply polling, tracking pixel),
blueprints and their plan gating, Bulk Fire, billing/entitlements, ingestion and
search — plus dedicated security/abuse suites (tenant isolation/IDOR, RBAC, auth,
rate limiting). The test database connection is configured in `vitest.config.ts`.

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Run the test suite |
| `npm run db:setup` | Bootstrap the local dev DB (role, schema, RLS) |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |

---

## 📂 Project layout

```
src/
├─ app/                     # Next.js App Router
│  ├─ api/                  # Route handlers (thin: parse → service → respond)
│  ├─ automated-outreach/   # AI campaigns, leads, reply review queue
│  ├─ blueprints/           # Blueprint wizard + detail
│  ├─ outreach/bulk-fire/   # Bring-your-own-list campaigns
│  └─ (pages)               # dashboard, search, candidates, upload, billing, team…
├─ components/              # React UI (app shell, ui primitives, marketing)
├─ lib/                     # client helpers (api client, plans catalog, supabase)
└─ server/
   ├─ http/                 # withApi guard, error hierarchy, response envelope
   ├─ auth/                 # JWT verify, session resolution, RBAC
   ├─ db/                   # drizzle client, schema, RLS, tenant-scoped tx
   ├─ repositories/         # the only layer that touches the DB
   ├─ services/             # business logic (outreach, blueprint, search, billing…)
   ├─ ports/                # hexagonal interfaces (one per external concern)
   ├─ adapters/             # implementations (real + mock) per port
   ├─ ingestion/            # text extraction, file-type, profile normalization
   ├─ jobs/                 # Inngest job handlers (see Background jobs above)
   ├─ lib/                  # safe-fetch (SSRF-guarded), secret-box, spintax, tracking
   └─ validation/           # Zod schemas per resource
drizzle/                    # generated SQL migrations
tests/                      # integration + security suites, helpers
docs/                       # architecture & edge-case docs
```

**Dependency rule:** `app/api → services → repositories → db`. Routes never query
the DB directly; services never build SQL.

---

## 🔍 How the AI pipelines work

### Outreach copy

Every email is written from the **blueprint** — a structured brief generated once from your
website, live web research, and your confirmed answers (including a free-text box that
outranks everything else). The copywriter never receives your signature; it's appended
deterministically so a real name/title can't be hallucinated. Generated subject/body are
**snapshotted** into the send row, so regenerating a blueprint later never rewrites emails
already scheduled.

Untrusted input is handled explicitly: scraped website text and inbound replies are wrapped in
tagged blocks with instructions to extract facts only, never to follow instructions found
inside them.

### Candidate search

1. **Retrieve** — the query is embedded (query-side) and matched against candidate
   vectors via pgvector's HNSW index, scoped to the tenant's `ready` candidates.
2. **Rerank** — the shortlist is handed to an LLM that scores genuine relevance and
   returns a one-line reason per candidate; incidental keyword hits are demoted.
3. **Respond** — top results with match scores and "why matched" explanations. Fails safe to
   pure vector order if the reranker is unavailable.

Résumé extraction feeds this: each profile is schema-validated and then
**deterministically normalized** (canonical skill names, deduped contacts,
derived years of experience) so embeddings and filters stay clean and comparable.

---

## 🤝 Contributing

1. Branch from `main`.
2. Keep the layering intact (`app → services → repositories → db`) and add a Zod
   schema for any new input.
3. New external concerns go behind a **port** with a mock adapter, so the suite keeps
   running with zero paid keys.
4. Every endpoint ships with happy-path **and** abuse-path tests.
5. `npm run lint && npm test` must be green before opening a PR.

---

<div align="center">
<sub>Two engines. One workspace. Find the customer, find the hire.</sub>
</div>
