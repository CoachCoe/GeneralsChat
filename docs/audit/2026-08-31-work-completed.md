# Audit remediation — work completed — 2026-08-31

Branch `audit/2026-08-31`, cut from `dev` at `1352563`.
Findings: [`2026-08-31-findings.md`](./2026-08-31-findings.md).

## Verification

Run from a clean state — `rm -rf node_modules .next tsconfig.tsbuildinfo`, then
`npm ci`:

| Check | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | **PASS** (exit 0) |
| lint | `npm run lint` | **PASS** (0 errors, 7 warnings) |
| build | `npm run build` | **PASS** |
| test | `npm run test:e2e` | **NOT RUN — see below** |

Both `typecheck` and `lint` are new or repaired: there was no `typecheck` script
before, and `lint` reported 3362 problems / 80 errors from an untracked stray
directory.

### No suppressions were introduced

Verified across the whole diff against `dev`:

- `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`: **zero**, before and after.
- `.skip` / `.only` / `.fixme` in `e2e/`: **zero**, before and after.
- `eslint-disable`: 4 occurrences, all `react-hooks/exhaustive-deps`, all
  present unchanged on `dev`. None added.
- `any` in `src/` excluding generated code: **20 on `dev` → 17 on this branch.**
  Three removed, none added.
- `tsconfig.json`: **unchanged.**
- `eslint.config.mjs`: no rule changed. Only the `ignores` globs were made
  recursive, which is what made the lint script usable.
- `.github/workflows/`: **untouched**, per the audit's hard rules.

### Why the e2e suite was not run

`DATABASE_URL` points at a remote hosted Postgres (`db.prisma.io`), and the
suite is not read-only: `e2e/chat-flow.spec.ts:31-35` sends a real chat message,
creating `Incident` and `Conversation` rows and making billed Claude calls, and
`incident-management.spec.ts` clicks status-mutating controls. Running it
unattended would write test data into a possibly shared or production database
and spend real API budget.

This is also a finding in its own right (TEST-1, TEST-3, TEST-21, REPO-9): the
suite has no `webServer`, no CI job, no database isolation, and a mock that
cannot intercept the calls it targets, because they are made server-side. It is
not safely runnable by anyone in its current state.

## What was fixed

14 commits, 68 files, +3430 / −3787.

### Security

| Finding | Fix | Commit |
|---|---|---|
| SEC-2, SEC-3 (blocker) | Arbitrary file write on both upload paths. New `src/lib/uploads.ts`: server-generated basename (`randomUUID` + validated extension, never `file.name`) plus a `path.resolve` containment assertion. The admin route also wrote the file *before* checking its extension; validation now precedes the write. | `ebe2ae2` |
| SEC-4 (blocker) | SSRF in the policy URL fetch. New `src/lib/safe-fetch.ts`: https-only, DNS resolved and non-public addresses refused, redirects re-validated per hop, Content-Type and body-size caps, timeout. | `a002d2a` |
| SEC-5 (blocker, partial) | Attachment extension allowlist excluding `.html`/`.svg`, closing the stored-XSS vector. **The `public/` location is unchanged — see deferred.** | `ebe2ae2` |
| SEC-10, SPEC-30 (major, partial) | The documented 10MB limit was enforced nowhere. All three handlers now reject oversized files with 413. **This does not prevent memory exhaustion** — see the correction below. | `ebe2ae2` |
| SEC-12 (major) | Unbounded `parseInt` pagination reaching Prisma `skip`/`take`. New `paginationSchema` with `z.coerce` clamping. | `5c52034` |
| SEC-13 (major) | Six zod schemas existed and were imported nowhere. Wired into `POST /api/incidents` and `PATCH /api/incidents/[id]`. | `5c52034` |
| SEC-9 (major, partial) | Classifier output is now validated against a zod enum instead of a bare `JSON.parse` returning `any`. **Retrieved policy text still enters the system prompt — see deferred.** | `5c52034` |
| SEC-14 (major) | Production container ran `next dev`, making three "development only" error-detail guards live. Multi-stage build, `NODE_ENV=production`, `npm start`, non-root user, node:20. | `7a6e737` |
| SEC-15 (minor) | `/api/chat/summary` returned raw `error.message` with no `NODE_ENV` guard. Now uses the shared `createErrorResponse`. | `85b4638` |
| SEC-16 (minor) | `determineDataSensitivity`'s discarded result is recorded on message metadata, and `ollama.ts` — which advertised confidentiality handling the app does not have — is deleted. | `b33948a`, `7a6e737` |
| SEC-18, REPO-4 (minor) | Removed `eslint.ignoreDuringBuilds` from `next.config.ts`. | `85b4638` |

### Correctness — the chat and retrieval path

| Finding | Fix | Commit |
|---|---|---|
| FLOW-2, SPEC-11 (blocker) | History was `orderBy asc, take: 10` — the ten *oldest* messages, under a comment claiming the newest. This was the real cause of the context looping commit `413ad1d` targeted. Now newest-20, reversed. | `b33948a` |
| FLOW-3, SPEC-3 (blocker) | With zero retrieved policy, an empty context block was spliced in while the prompt still told the model to cite policy codes and exact deadlines. An explicit no-policy instruction block now replaces it. | `b33948a` |
| FLOW-1 (major) | The current message was appended by both the route and `claude-service`, sending it twice on every request. | `b33948a` |
| FLOW-18, SPEC-10 (major) | Classification was gated on `conversations.length === 0 && message.length > 50`, unsatisfiable after turn one — so a short opening message was never classified. Now gated on `!incident.incidentType`. | `b33948a` |
| FLOW-7, TEST-5 (major) | A failed model call was swallowed into apology text, persisted as assistant guidance at `confidence: 0.9`, behind an HTTP 200. Now throws `LLMUnavailableError` → 503, nothing persisted. | `b33948a` |
| FLOW-4, SPEC-6 (major) | Keyword fallback matched case-sensitively on Postgres under a stale "SQLite is case-insensitive" comment, so policy codes and capitalised terms never matched. Added `mode: 'insensitive'`. | `e18a918` |
| FLOW-5, SPEC-3 (major) | An empty Chroma result was treated as success and skipped the fallback. Now falls through. | `e18a918` |
| SPEC-5 (blocker) | The `isActive` filter was accepted and ignored, so deactivated policies were still cited. Threaded through with a join to `Policy`. | `e18a918` |
| SPEC-15 (major) | Deleting a policy left its Chroma entries, and orphaned vector hits were returned to the model anyway. DELETE now purges; orphans are dropped. | `e18a918` |
| FLOW-22, FLOW-23, SPEC-9, DEAD-11 (major) | Three admin paths chunked with `.{1,500}` — one match *per line*, newlines dropped, no overlap — and wrote rows directly, so `embedding` stayed null and Chroma was never touched. All now index through `ragSystem.addPolicyDocument`. Verified: 2500-word doc → 4 chunks, max 1000 words, exactly 200 words overlap, no content lost. | `2b240cb` |
| FLOW-21, SPEC-7 (blocker) | Admin upload returned 400 "PDF parsing not yet implemented" although `documentProcessor` has always handled PDF and DOCX — it was simply never called. | `ebe2ae2` |
| FLOW-6 (minor) | The retrieval context arg was `_context` and never read. Now includes incident type and recent turns. | `e18a918` |

### Correctness — incidents

| Finding | Fix | Commit |
|---|---|---|
| FLOW-13, DEAD-31 (blocker) | `/incidents/active` stored the `{ incidents, pagination }` envelope as the array, so `.map` threw on every successful response; and its interface declared four fields that do not exist on the model. | `d9c9231` |
| FLOW-12, SPEC-12, DEAD-10 (blocker, partial) | `?status=active` matched nothing. Now `?status=open`. **The `pending` half is deliberately unfixed — see open questions.** | `d9c9231` |
| FLOW-17 (major) | `requiredActions[idx]` was paired with `timeline[idx]` by index, so unmatched actions fell through to a hardcoded 3-day default — wrong for a 24-hour mandatory report. Each action now carries `dueInHours`. | `7ead572` |
| FLOW-15 (major) | `closedAt` was defined in the schema and never written by any code path. Now stamped on close, cleared on reopen. | `5c52034` |
| DEAD-8 (major, partial) | Both list pages read `incident.actions` while the API returns `complianceActions`, making the block unreachable. **The 95% duplication between the two pages remains.** | `d9c9231` |
| FLOW-19 (minor) | The title backfill's prefix predicate disagreed with the runtime's, so it would rewrite "Bullying Report" to "Bullying: Bullying Report". | `b33948a` |

### Repo, dependencies, docs

| Finding | Fix | Commit |
|---|---|---|
| DEAD-19 (major) | `@radix-ui/react-slot` was imported by `button.tsx` — on nearly every screen — but undeclared, resolving only through the five *unused* Radix packages. Declared at 1.2.3 **before** removing them, or the build would have broken. | `f169775` |
| DEAD-16, 17, 18, 35 | Removed 12 unused packages including all three NextAuth packages (two of which are competing generations of the same adapter, against a schema with no `Account`/`Session` models). `dotenv` moved to devDependencies. | `f169775` |
| DEAD-1 (major) | Deleted `src/lib/ai/ollama.ts` — zero imports, a third stubbed LLM layer. | `7a6e737` |
| DEAD-21, 22, 25 | Deleted six superseded scripts. Payloads preserved as commented entries in the batch uploader. | `f169775` |
| REPO-5, TEST-20 (major) | `lint` scoped and eslint ignores made recursive: 3362 problems → 7. Added the missing `typecheck` script plus `db:studio`, `db:seed-prompt`, `db:verify`, `policies:batch-upload`. | `85b4638` |
| REPO-3, SPEC-14 (blocker) | `.env.example` set a SQLite `DATABASE_URL` against a postgresql datasource — verified to fail `migrate deploy` with P1012, while `prisma generate` succeeds and masks it. | `85b4638` |
| REPO-15 (major) | `docker-compose.yml` could not start the app: SQLite URL, no database service at all, `ANTHROPIC_API_KEY` never passed in, an Ollama service for deleted code, and the repo bind-mounted over the build. Replaced. | `7a6e737` |
| REPO-2, DEAD-29 (blocker) | README was untouched `create-next-app` boilerplate. Rewritten. | `5988173` |
| REPO-6 (major) | Every quantitative claim in `BUILD_STATUS.md` was wrong. Corrected in place. | `5988173` |
| REPO-8, SPEC-22 | Nine documented URLs used :3002 or :3001; the app serves :3000. | `5988173` |
| REPO-7, SPEC-21 | Docs named a script that was never written and inlined a duplicate copy of it. | `5988173` |
| REPO-10, 12, 13; DEAD-15, 27, 34 | Untracked 15 committed Playwright failure artifacts; deleted `test-llm.js` (1 byte, a single space), `env.example`, and the stray `school-compliance-ai/` build tree. | `85b4638` |
| TEST-11, DEAD-30 (major) | `navigation.spec.ts` asserted a `/todos` route with zero presence in `src/`. Repointed at `/admin/prompt`, which had no coverage. | `b1c3b9d` |
| SPEC-1, 2, 24, 25; FLOW-11 | `LAWYER_PERSONA_UPDATE.md` now states plainly that it does not match the shipped prompt, without resolving which is authoritative. | `5988173` |

## Deferred, with reasons

### Requires a product decision (logged, not guessed)

| # | Question | Consequence of leaving it |
|---|---|---|
| SPEC-32 | Is the in-code persona authoritative, or the admin-editable `SystemPrompt` row? | Compliance-guidance tone and mandatory-question behavior are runtime-editable by any admin, with no audit trail. Blocks SPEC-1, SPEC-2, FLOW-11. |
| SPEC-33 | Is `policyType` provenance (4 values) or subject matter (20 categories)? | 16 of the 20 documented categories are unreachable in the UI and unrepresented in the type system. Blocks SPEC-8, part of SPEC-17. |
| SPEC-34 | Which policy-upload endpoint is canonical? | Two divergent implementations coexist; the docs cite one, the shipped UI calls the other. |
| SPEC-35 | Must a generated summary be persisted, and where? | `/api/incidents/[id]/summary` still discards a paid multi-thousand-token summary (FLOW-16). |
| FLOW-12b | Does `/incidents/pending` mean an incident status or incidents with open `ComplianceAction` rows? | That page still returns nothing. An explanatory comment was left at the fetch site instead of a guessed query. |

### Correction — SEC-10 is only partly fixed

The commit message for `ebe2ae2` claims the size check runs "before buffering
the body". That is wrong, and self-review caught it. All three handlers call
`await request.formData()` first, which fully parses and buffers the request
body into memory; `file.size` is only readable afterwards. So the limit does
reject oversized uploads — preventing disk fill and database bloat — but the
bytes are already resident by then, and the denial-of-service path in SEC-10
(POST a multi-gigabyte body, OOM the process) **is still open**.

Closing it properly requires rejecting on `Content-Length` before touching the
body, and streaming to disk with a hard ceiling rather than `arrayBuffer()`,
plus the same cap at the ingress. Recorded rather than claimed as done.

### Blocked on authentication (SEC-1)

**SEC-1 is the largest finding in this audit and is not fixed.** There is no
authentication or authorization anywhere in the application: no
`[...nextauth]` route, no `getServerSession` call, no middleware, and no role
check, so all 14 API routes are public. Building an auth system is a product
decision — identity provider, district SSO, tenancy model, session strategy —
not an audit fix, and inventing one unattended would have been the wrong call.

Depending on it: **SEC-6** (anyone can rewrite the system prompt that governs
mandated-reporting advice), **SEC-7** (IDOR on every entity), **SEC-8**
(client-supplied `userId` trusted as identity), **SEC-11** (no rate limiting on
unauthenticated LLM endpoints), **SEC-17** (`AuditLog` never written, so no
FERPA disclosure accounting), and the **SEC-5** relocation of attachments out of
`public/`, which needs an authenticated serving route to relocate *to*.

Recommended order: SEC-1 → SEC-6/SEC-7/SEC-8 together → SEC-5 relocation →
SEC-17 → SEC-11.

### Explicitly out of scope by the audit's own rules

**REPO-1 — CI verifies nothing.** Both workflows build a Python backend and a
`frontend/` directory that do not exist in this repo; confirmed
`requirements.txt` and `frontend/` are absent. No job runs `next build`, `tsc`,
`eslint`, `prisma` or `playwright`. Every push to `main` runs two workflows that
fail for reasons unrelated to this app.

The audit rules forbid editing CI workflows, so this was not applied. The
replacement is given below for deliberate application. Both existing workflow
files should be deleted — `deploy.yml` targets GitHub Pages, which cannot host a
server-rendered app with API routes and Prisma at all.

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, dev]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: generalschat_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/generalschat_test?schema=public
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
```

The e2e job is deliberately omitted until TEST-1 … TEST-11 are addressed:
adding it now would make CI green on a suite where several tests cannot fail.

### Recorded, not deleted — per the hard rule

The audit rule "do not delete code whose behavior is not covered by a test or
spec line" kept the following in place. Worth noting the recursion: with no
`CLAUDE.md` and no `docs/`, the five root markdown files *are* this repo's spec,
so a mention in them is what protects a module (DEAD-28). That is why
`BUILD_STATUS.md` was corrected rather than deleted — removing it would have
retroactively unprotected four scripts.

- **DEAD-20**: `chromadb`/`openai` and the Chroma service methods — documented
  as active-or-planned in four docs.
- **DEAD-23, DEAD-26**: `batch-upload-policies.ts`'s commented template (the
  docs instruct readers to uncomment it) and the two doc-named demo scripts.
- **DEAD-3, 4, 5, 6**: unused zod schemas, four error helpers, three logger
  exports, seven type exports. Most are dead *because* auth and rate limiting
  do not exist; they should be picked up with SEC-1, not removed now.
- **DEAD-2**: `llm-service.ts` is a pass-through wrapper over `claude-service`
  carrying a duplicate system prompt, but it is on the live `/api/chat` path.
- **FLOW-14 / SPEC-4 (blocker)**: `/incidents/new` has no `fetch` at all — it
  fabricates compliance determinations from hardcoded arrays via
  `Math.random()`, telling staff "Level 2 incident… parent notification within
  24 hours". **This is the most alarming thing left in the codebase.** Both
  candidate fixes — redirect to `/chat`, or rewrite it to call `/api/chat` — are
  product decisions about a user-facing route, so per the rules it is logged.
  **Recommendation: redirect `/incidents/new` to `/chat` immediately.** `/chat`
  is the real implementation of this journey.

### Larger workstreams, recorded

- **Test suite quality (TEST-2, 7, 8, 9, 10, 21, 22, 23).** Six of seven
  chat tests use selectors that cannot match (a case-sensitive substring against
  `"Message General..."`, and an icon-only send button with no accessible
  name); ten tests self-disable via `if (count > 0)`; several assertions are
  `expect(locator).toBeTruthy()`, always true; the loading test resolves `true`
  on a timer regardless of the UI; four use a regex inside `:has-text()`, which
  Playwright rejects at parse time. Fixing this needs app-side test ids, a
  seeded fixture, and a mock at the app's own boundary rather than
  `api.anthropic.com`. Half-doing it would leave the suite still misleading.
- **Unit test layer (TEST-4, 12–18, TEST-20).** There is no unit runner, so
  none of the pure functions can be tested: `cosineSimilarity`,
  `splitIntoChunks`, `cleanText`, `determineActionType`, `handlePrismaError`,
  the zod schemas. Recommend Vitest; these need no database, network, or server.
- **Consolidation (DEAD-8, 9, 12, 32).** `closed/` and `pending/` are 95%
  byte-identical; 11 of 14 routes hand-roll error handling instead of using the
  helpers; the two summary endpoints are two implementations of one feature;
  `getStatusColor` is copy-pasted four times and the copies have already
  drifted, so the same incident renders a different badge colour depending on
  which list you reached it from.

## Data migration required

**`PolicyChunk` rows created before this branch are stale.** They were written
by the 500-character regex chunker with no overlap and no embeddings. Retrieval
will work against them via the keyword fallback but with poor recall, and vector
search will not see them at all.

They need re-indexing by re-running each policy's `content` through
`ragSystem.addPolicyDocument`. This was **not** performed: it mutates live data
in a remote hosted database, which is not something to do unattended.

## Latent bugs found but not fixed

Noted here because they are cheap and a reviewer may want them in this PR:

- `documentProcessor.ts:83` collapses `\s+` to a single space *before* the
  `\n{3,}` rule at `:89`, so that rule can never fire (TEST-17).
- `documentProcessor.ts:65` reports `wordCount: 1` for empty content, because
  `''.split(/\s+/)` yields `['']` (TEST-17).
- `embeddings.ts:117` `getEmbeddingDimension` returns 1536 for every model
  (`this.model === 'text-embedding-3-small' ? 1536 : 1536`), so
  `validateEmbedding` silently passes wrong-sized vectors whenever
  `OPENAI_EMBEDDING_MODEL` is overridden (TEST-15).
- `errors.ts:144-166` decides HTTP status by substring-matching upstream error
  text, and `claude-service.ts:122` wraps every failure as
  `` `Failed to generate Claude response: ${error}` `` — so any Anthropic error
  mentioning "API key" becomes a 503 `CONFIG_ERROR` regardless of cause
  (TEST-13).
- `prisma/migrations`: `add_system_prompts` (11:54) sorts *before*
  `initial_postgres_schema` (14:30), and the "initial" migration omits the
  `SystemPrompt` table the earlier one creates. Not a functional break — a fresh
  `migrate deploy` produces all 9 tables — but the history reads backwards
  (REPO-11).

---

# Addendum — follow-up round

After review, the three items the maintainer prioritised were completed in this
same PR: authentication, `/incidents/new`, and a runnable e2e suite.

## Verification (second round)

| Check | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | **PASS** |
| lint | `npm run lint` | **PASS** — 0 errors, 2 warnings (was 7) |
| build | `npm run build` | **PASS** |
| test | `npm test` | **PASS — 18/18**, exits 0 |

The e2e suite now runs unattended against a dedicated local Postgres with a
local Claude stub, so it makes no billed API calls and needs no hand-started
server. Auth behaviour was additionally verified against a live server with a
26-check probe covering unauthenticated access, role enforcement, IDOR, and
identity binding.

## SEC-1 — authentication (closed)

NextAuth v5, Credentials provider, JWT sessions, single tenant. Passwords are
bcrypt hashes in `User.passwordHash`. The config is split so `middleware.ts`
stays Edge-safe (no Prisma, no bcrypt). Middleware denies by default and every
handler re-checks independently. Roles: `admin`, `investigator`, `reporter`.

This closed SEC-6, SEC-7 and SEC-8 with it: admin routes require the admin
role; every by-id lookup and mutation is scoped, returning 404 rather than 403
for out-of-scope rows; and identity is never read from the request body again.

SEC-5 was closed as a consequence — attachments moved out of `public/` and are
served by `GET /api/attachments/[id]`, which re-checks session and ownership
and sets `Content-Disposition: attachment` plus `nosniff`.

SEC-17 was closed too: `AuditLog` is finally written, recording incident
create/view/update and attachment downloads with the acting user.

## FLOW-14 — `/incidents/new` (closed)

Now posts to `/api/chat`, the same endpoint `/chat` uses, so guidance comes
from the real classify → retrieve → Claude path and the incident is persisted.
The step indicator reflects what the server returned rather than message
length. The layout is unchanged.

## Two bugs found by the new tests

Both were invisible to the read-only audit and only surfaced once assertions
could fail:

1. **The first message of every new conversation returned 400.**
   `chatMessageSchema` used `incidentId: z.string().optional()`, which accepts
   `undefined` but not `null` — and the chat page holds `incidentId` in state
   initialised to `null`, which `JSON.stringify` emits. The opening turn of the
   primary journey was broken. Now `.nullish()`.

2. **Chroma was dead in every environment.** `getOrCreateCollection` was called
   with no `embeddingFunction`, so chromadb fell back to
   `DefaultEmbeddingFunction` and threw `Cannot find module
   '@chroma-core/default-embed'` before any network call. Separately the client
   was built with `{ path }`, which chromadb v3 ignores in favour of
   host/port/ssl — so `CHROMA_URL` never took effect. Both fixed; verified the
   failure mode changed to a genuine `ChromaConnectionError`, proving the
   client now attempts the connection. **A successful vector round-trip is
   still unverified** — that needs a running Chroma server.

## Still open after this round

| # | Item | Why |
|---|---|---|
| SEC-11 | No rate limiting on LLM endpoints | Now authenticated, so it is a cost/abuse concern rather than an open door. Needs a Redis-backed limiter to survive multi-instance. |
| SEC-4 (partial) | DNS rebinding in the policy URL fetch | Needs a hostname allowlist, which is a product decision about permitted sources. |
| SEC-10 (partial) | Upload OOM path | Needs `Content-Length` rejection and streaming to disk; `request.formData()` buffers first. |
| REPO-1 | CI | Still not applied — the audit rules forbade editing workflows. The `ci.yml` above should now also run `npm test` with a `postgres:16` service. |
| SPEC-32..35 | Product questions | Unchanged; still need answers. |
| FLOW-12b | `/incidents/pending` semantics | Unchanged. |
| — | `PolicyChunk` re-index | Unchanged; existing rows still have old-chunker granularity and no embeddings. |
| DEAD-8, 9, 12, 32 | Consolidation | Unchanged. |

The unit-test layer (TEST-4, TEST-12 … TEST-18) is also still absent. The e2e
suite now covers the primary journeys and access control, but the pure
functions — `cosineSimilarity`, `splitIntoChunks`, `cleanText`,
`handlePrismaError`, the zod schemas — still have no tests and need no
database, network, or server to get them.

---

# Addendum 2 — policy model (SPEC-33 resolved)

**Answer: both.** Jurisdiction and category are independent facets, now two
columns.

The maintainer described the domain: policies come from federal government,
state government, the district, and the individual school; they are not meant
to be at odds, with local policy supporting the federal and state floor; and
the workflow is that an administrator describes an incident and the system
diagnoses which policies apply and what the response and reporting
requirements are.

That makes the single `policyType` column untenable — a bullying incident
implicates a federal rule, a state statute and a district policy
simultaneously, and each of those is a different jurisdiction *and* the same
category.

## What changed

- Migration `20260901010000` adds `jurisdiction` and `category`, backfills each
  existing row by which vocabulary its old value belonged to, drops
  `policyType`. No drift.
- Retrieval filters by the categories the incident classification implicates,
  always including `mandatory_reporting`.
- **Classification moved before retrieval.** It ran after, so the opening turn
  always retrieved with `incidentType` null and the category filter matched
  nothing.
- Context is grouped by jurisdiction in the prompt so the model can tell a
  statute from a handbook.
- `ensureCategoryRepresentation` guarantees each implicated category appears,
  because relevance ranking alone cannot surface a mandatory-reporting policy
  for a disclosure that shares no vocabulary with it.
- Coverage gaps are computed **per category, from the policy library**, not
  from retrieval results. Any implicated category without a district or school
  policy is flagged, and the prompt tells the model to say so rather than pass
  a statute off as local procedure.

## Two design errors caught during this round

Recorded because both were mine, and both were the silent kind:

1. **Category filtering killed first-turn retrieval.** Classification ran after
   retrieval, so `categoriesForIncidentType(null)` narrowed every opening turn
   to `mandatory_reporting` and nothing matched. Fixed by reordering, and
   `categoriesForIncidentType` now returns `[]` (no filter) for an unknown type
   as a safety net.

2. **Gap detection reported the worst case as no gap.** Deriving coverage from
   retrieved chunks meant a category with *no policy at all* produced no
   chunks, hence no evidence of absence. Coverage is now queried from the
   policy library directly.

## Closed

FLOW-8 — citations carry title, jurisdiction and category and are rendered in
the chat UI, with an explicit "no matching district policy was found" when
empty.

The `PolicyChunk` re-index item is now actionable rather than a note:
`npm run policies:reindex` (dry run) / `-- --apply`. Still not run against the
remote production database — that is the maintainer's call.

## Verification

typecheck PASS · lint PASS (0 errors, 2 warnings) · build PASS ·
**`npm test` 23/23, exit 0**.
