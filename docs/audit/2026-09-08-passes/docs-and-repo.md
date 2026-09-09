# Audit pass: repo organization and documentation accuracy

Branch `audit/2026-09-08`. Read-only; no source changed, no database touched.
Every claim below was checked against a real line in the code.

`npm run test:unit` was run (it connects to nothing and makes no billed calls):
11 files, 151 tests, all passing.

Counts: **0 blockers, 6 major, 13 minor** (19 findings; DOC-21..DOC-33,
REPO-23..REPO-30 — REPO-30 is minor, DOC-33 is minor).

---

## Doc findings

### DOC-21 — README names a model id the code no longer uses

**Severity** major
**Location** doc `README.md:20`; code `src/lib/ai/claude-service.ts:291`
**Claim** README's Stack table: `| LLM | Anthropic Claude (\`claude-sonnet-4-20250514\`) |`
**Reality** `this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';`
(`src/lib/ai/claude-service.ts:291`). The comment two lines above says why the
change was forced: *"a retired id fails as a 404 not_found_error at request
time, which surfaces to the administrator as a generic 503"*
(`claude-service.ts:288-290`). Commit `ce9eb1d` (2026-09-07, "Migrate off the
retired model") changed `claude-service.ts`, `scripts/test-claude.ts` and
`e2e/support/claude-stub.ts` and touched no documentation.
`scripts/test-claude.ts:28` also defaults to `claude-sonnet-5`. The README value
is therefore the exact id that now fails at request time — a maintainer
"restoring" it from the README would take chat down with a 503.
**Proposed fix** `README.md:20` → `| LLM | Anthropic Claude (\`claude-sonnet-5\`,
override with \`ANTHROPIC_MODEL\`) |`.

---

### DOC-22 — Three docs recommend `policies:batch-upload`, which POSTs to the route OQ-2 deleted

**Severity** major
**Location** docs `README.md:161-169`, `QUICK_START_POLICY_UPLOAD.md:3,5,24`,
`POLICY_MAPPING.md:119-121`; code `scripts/batch-upload-policies.ts:235`,
`src/app/api/policies/route.ts:56-63`
**Claim** README:161-169:

> Guidance quality depends entirely on having district policies indexed. **Three
> paths exist**; see `QUICK_START_POLICY_UPLOAD.md` for detail.
>
> 1. `npm run policies:batch-upload` — edit the `policies` array in
>    `scripts/batch-upload-policies.ts` first […]
> 2. The admin UI at `/admin/policies` […]
>
> All three now index through the same chunker (1000 words, 200-word overlap)

and `QUICK_START_POLICY_UPLOAD.md:5` — `### Method 1: Batch Upload Script (RECOMMENDED)`.

**Reality** Three separate problems, one root cause:

1. `scripts/batch-upload-policies.ts:235` still calls
   `fetch(\`${BASE_URL}/api/policies\`, { method: 'POST', body: form })`.
   `src/app/api/policies/route.ts` exports **only `GET`** (line 6); its
   lines 56-63 are the tombstone: *"POST is gone. […] The canonical path is
   POST /api/admin/policies/upload […] (OQ-2)"*. A POST to a Next route handler
   with no POST export returns 405, so `npm run policies:batch-upload` cannot
   write a policy at all. It is the path two docs mark RECOMMENDED.
2. README enumerates **two** paths under the words "Three paths exist", then
   asserts "All three now index through the same chunker". `docs/roadmap.md:246,250`
   recorded that this was expected: *"It is documented in README, so this needs a
   doc change — that is the decision, not an obstacle."* The route reference was
   removed from the README; the count and the enumeration were not.
3. The chunker claim itself is *true* for the paths that work — every live
   ingestion path funnels into `RAGSystem.addPolicyDocument`, which calls
   `splitPolicyIntoSectionedChunks(content, sections, 1000, 200)`
   (`src/lib/ai/rag.ts:60`), from `src/app/api/admin/policies/route.ts:103`,
   `.../[id]/route.ts:119`, `.../upload/route.ts:172` and
   `scripts/load-policy.ts:122`. The batch script never reaches it, because it
   goes over HTTP to a dead route.

**Proposed fix** Fix the script (`/api/policies` → `/api/admin/policies/upload`,
plus the session cookie that prefix now requires) *or* retire it. Until then, in
`README.md:161-169` change "Three paths exist" → "Two paths exist", delete the
`policies:batch-upload` bullet or mark it broken, and change "All three" → "Both".
In `QUICK_START_POLICY_UPLOAD.md:5` drop `(RECOMMENDED)` from Method 1 and point
at Method 2 (`policies:load`), which its own line 35 already calls "the path that
actually works today". In `POLICY_MAPPING.md:119-121` replace the batch-uploader
recommendation with `npm run policies:load`.

---

### DOC-23 — `docs/deploy-azure.md` says rate limiting is still open; it shipped 2026-09-02

**Severity** major
**Location** doc `docs/deploy-azure.md:129-132`; code `middleware.ts:40-55`,
`src/lib/rate-limit.ts`
**Claim** Under "What this does not set up":

> - **Rate limiting.** Still open from the audit (SEC-11/SEC-23). The credentials
>   endpoint is public and unthrottled, and `bcrypt` at cost 12 blocks the event
>   loop for ~0.25s per attempt. Worth closing before this is reachable from the
>   open internet by anyone who knows the hostname.

**Reality** It is closed. `middleware.ts:41-54` rate-limits the credentials
callback before auth runs:

```
if (isCredentialsSignIn(request)) {
  const { limit, windowMs } = RATE_LIMITS.SIGN_IN;
  const result = checkRateLimit(`signin:${clientAddress(request)}`, limit, windowMs);
  if (!result.allowed) { … status: 429, headers: { 'Retry-After': … } }
```

`isCredentialsSignIn` (`middleware.ts:33-38`) matches
`POST /api/auth/callback/credentials`. `docs/roadmap.md:306-334` records the work
as done 2026-09-02 with seven unit tests plus an e2e flood test, and
`README.md:309-314` already carries the *correct* successor statement (in-process
counters, exact at one replica). Only `deploy-azure.md` still says "unthrottled" —
which is the document an operator reads immediately before exposing the app to the
internet, and it invites them to either delay the deploy or re-implement what
exists.
**Proposed fix** Replace `docs/deploy-azure.md:129-132` with the surviving
caveat, which is real: sign-in is limited by client address in `middleware.ts`
and chat/summaries/uploads by user id in their handlers, but the counters are
per-process, so they must move to a shared store before `maxReplicas` is raised
above the 1 that `deploy/azure/containerapp.template.yaml:85` pins.

---

### DOC-24 — CLAUDE.md's production-write warning list omits the repo's most destructive script

**Severity** major
**Location** doc `CLAUDE.md` ("`.env` points at production" paragraph); code
`scripts/clear-incidents.ts:1-32`
**Claim**

> **`.env` points at production.** […] `npm test` is safe by construction (its
> setup refuses a database whose name lacks `test`), but the `policies:*` and
> `prisma` commands are not, and neither are `scripts/test-phase3.ts` and
> `scripts/test-rag.ts`, which create and delete `User`, `Incident`,
> `Conversation` and `Policy` rows despite the `test-` prefix.

The list reads as exhaustive — it names the two scripts whose `test-` prefix
makes them *look* safe, precisely so that nothing dangerous is left unnamed.

**Reality** `scripts/clear-incidents.ts` is not named, and it is strictly worse
than either script that is. It takes no arguments, has no dry run, no
confirmation prompt, and no database-name guard, and unconditionally issues five
unfiltered `deleteMany({})` calls in dependency order (lines 9, 12, 15, 18, 21):
`auditLog`, `complianceAction`, `attachment`, `conversation`, `incident`. It
imports `prisma` from `../src/lib/db` (line 1), so it takes whatever
`DATABASE_URL` gives it — and `.env`'s `DATABASE_URL` points at
`postgres://…@db.prisma.io:5432/postgres`, the hosted pilot. `npx tsx
scripts/clear-incidents.ts` erases every incident, obligation, attachment record
**and the audit log** for the pilot, with no recovery path in the repo.
`scripts/migrate-chat-titles.ts` is the same shape one tier down: an unguarded
`UPDATE`-style backfill over every classified incident, also unnamed by the doc.
Neither is wired into `package.json`, so neither appears in README's script table
either — the two most dangerous scripts in `scripts/` are the two that no
document mentions at all.
**Proposed fix** Add both to the CLAUDE.md sentence:
"…and neither are `scripts/test-phase3.ts`, `scripts/test-rag.ts`,
`scripts/clear-incidents.ts` (which deletes **every** incident, obligation,
attachment and audit-log row with no confirmation and no dry run) or
`scripts/migrate-chat-titles.ts`." See REPO-23 for the structural fix.

---

### DOC-25 — `deploy/azure/env.example` advertises an OPENAI_API_KEY the deployment never passes to the app

**Severity** major
**Location** doc `deploy/azure/env.example:33-34`; code
`deploy/azure/containerapp.template.yaml:36-53`, `deploy/azure/deploy.sh:78-79`
**Claim** `deploy/azure/env.example:33-34`:

```
# Optional: enables vector search instead of the keyword fallback.
export OPENAI_API_KEY=""
```

**Reality** Setting it does nothing. The container's env block
(`containerapp.template.yaml:36-53`) declares exactly seven variables —
`DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `NEXTAUTH_URL`,
`AUTH_TRUST_HOST`, `UPLOADS_DIR`, `NODE_ENV` — and neither `OPENAI_API_KEY` nor
`CHROMA_URL` is among them. `deploy.sh:78-79`'s `render()` exports only
`LOCATION ENVIRONMENT_ID ACR_SERVER ACR_USER ACR_PASS DATABASE_URL AUTH_SECRET
ANTHROPIC_API_KEY APP_IMAGE APP_FQDN STORAGE_MOUNT_NAME` before `envsubst`, so
the variable never reaches the template even as a substitution. The code that
would consume it gates on exactly that name — `src/lib/ai/embeddings.ts:15,33,56`
and `src/lib/ai/rag.ts:63-64` — so on Azure retrieval silently stays on the
keyword fallback while the operator's env file says vector search is enabled.
This is the failure mode `docs/roadmap.md:432` already flags as unverified
("Vector search […] Needs `OPENAI_API_KEY` **and** a running Chroma server"), made
harder to diagnose by an env file that claims the first half is wired.
**Proposed fix** Either add `OPENAI_API_KEY` (as a secret) and `CHROMA_URL` to
`containerapp.template.yaml`'s env block and to `deploy.sh:78-79`'s export list,
or change `deploy/azure/env.example:33-34` to
`# Not wired into the Container App yet — see docs/deploy-azure.md. Vector search
is off in this deployment; retrieval uses the keyword fallback.`

---

### DOC-26 — `POLICY_MAPPING.md` and `QUICK_START_POLICY_UPLOAD.md` claim a deactivated synthetic policy is loaded

**Severity** major
**Location** docs `POLICY_MAPPING.md:149-159`,
`QUICK_START_POLICY_UPLOAD.md:238-250`; contradicted by `docs/roadmap.md:41-58,100`
**Claim** `QUICK_START_POLICY_UPLOAD.md:240-250`:

> **Policies Loaded:** 3 main policies (7 total records)
> - ✅ DISC-001 - Bullying Prevention
> - ✅ JICC - Student Conduct on School Buses
> - ✅ ACAC - Title IX Policy Update 2025
>
> **Policies Pending:** 17+ categories […]
> **System Ready:** ✅ Yes / **RAG Working:** ✅ Yes / **Chat Working:** ✅ Yes

and `POLICY_MAPPING.md:151-154` (same list), plus its three inline
`✅ Already uploaded` markers at lines 20, 38 and 51.

**Reality** `DISC-001` was deliberately removed from retrieval.
`docs/roadmap.md:55-58`: *"The old 'School District Bullying Prevention and
Intervention Policy' was **deactivated**. Its own text calls it `Policy Number:
DISC-001`, a code that does not exist — it was synthetic sample data, and it
would have competed with the real JICK for every bullying query."* The real
state, recorded at `docs/roadmap.md:100`, is *"4 retrievable policies, 16 chunks,
0 embedded. 2 of 20 categories have a local policy"* — and `roadmap.md:94-98`
records that `mandatory_reporting`, retrieved for **every** incident, has nothing
loaded at all. So both root docs assert bullying coverage from a policy that was
withdrawn for being fabricated, and both assert "System Ready ✅ / RAG Working ✅"
over a library the roadmap describes as having a hole in its single
always-retrieved category.

These are also, structurally, the fifth and sixth status file of the kind
`docs/roadmap.md:5-6` exists to prevent: *"This repo previously accumulated four
status files that all drifted out of date, so keep this one current or delete
it."* Their drift is the demonstration.
**Proposed fix** Delete the "System Status" section from `POLICY_MAPPING.md:149-159`
and the "Current System Status" section from `QUICK_START_POLICY_UPLOAD.md:238-250`,
replacing each with a one-line pointer: *"For what is actually loaded, run
`npm run policies:coverage` — it derives from the same `categoriesForIncidentType`
retrieval uses, so it cannot drift."* Drop the three `✅ Already uploaded` markers
at `POLICY_MAPPING.md:20,38,51` for the same reason. See REPO-25 for where these
files should live.

---

### DOC-27 — CLAUDE.md describes `npm test` as Playwright only

**Severity** minor
**Location** doc `CLAUDE.md` ("Commands that define 'clean'"); code
`package.json:13-16`, `.github/workflows/ci.yml:60-78`
**Claim**

> ```
> npm test              # Playwright; starts its own server and stub
> ```

**Reality** `package.json:13` is `"test": "npm run test:unit && npm run test:e2e"`
— vitest (`package.json:14`) runs first and Playwright (`package.json:16`) second.
So `npm test` failing does not imply a Playwright failure, and the first thing it
runs neither starts a server nor needs the Postgres the surrounding paragraph
insists on. The four-gate list is otherwise exact and matches CI: `ci.yml:61`
`npm run typecheck`, `:64` `npm run lint`, `:67` `npm run build`, then `:72`
`npm run test:unit` and `:78` `npm run test:e2e` — CI splits `npm test` into its
two halves (deliberately, per the comment at `ci.yml:69-70`) rather than diverging
from it, so "CI runs exactly these" holds.
**Proposed fix** In CLAUDE.md's fenced block, change the comment to
`# vitest, then Playwright (which starts its own server and stub)`, and note in
the sentence below it that CI runs the two halves separately so a unit failure
does not pay for a browser download.

---

### DOC-28 — CLAUDE.md: `.eyebrow` is not the only uppercase in the UI

**Severity** minor
**Location** doc `CLAUDE.md` (Design rules, last bullet); code
`src/components/design/AuthorityChip.tsx:25`,
`src/components/design/SourceLadder.tsx:73`, `src/app/incidents/page.tsx:223`,
`src/app/incidents/[id]/page.tsx:234,238`
**Claim** "The `.eyebrow` class is the only uppercase in the UI."
**Reality** `src/app/theme.css:65-71` does declare `.eyebrow` as *"The only
uppercase in the UI"* with `text-transform: uppercase`, but five component sites
apply Tailwind's `uppercase` utility directly, all with the same
`text-[10px] font-medium … tracking-[0.1em]` treatment — `AuthorityChip.tsx:25`,
`SourceLadder.tsx:73`, `incidents/page.tsx:223`, and two status pills at
`incidents/[id]/page.tsx:234` and `:238`. The rule as written is false; the intent
(one uppercase *treatment*) is what the code follows.
**Proposed fix** Either widen the rule — "Uppercase is reserved for the eyebrow
treatment: the `.eyebrow` class and the 10px tracked chip labels that share it
(`AuthorityChip`, `SourceLadder`, the segment and status pills). Nothing else." —
or hoist the utility strings into `.eyebrow`/an `.eyebrow-chip` class in
`theme.css` and keep the rule literal. The doc and the code should not disagree
about which.

---

### DOC-29 — README's list of unauthenticated routes omits `/api/health`

**Severity** minor
**Location** doc `README.md:277-278`; code `src/auth.config.ts:20`
**Claim** "`middleware.ts` denies by default: only `/login`, `/about` and
`/api/auth/*` are reachable without a session."
**Reality** `src/auth.config.ts:20` is
`const PUBLIC_PATHS = ['/login', '/about', '/api/health'];`, plus the
`pathname.startsWith('/api/auth')` branch at line 25. `/api/health` is public by
design and the code says why (`auth.config.ts:17-18`: *"a container platform's
probe has no session"*), and it must stay public —
`deploy/azure/containerapp.template.yaml:61-78` points both the liveness and
readiness probes at it. The word "only" makes the README's list wrong in the one
direction that matters: a maintainer tightening the list to match the doc would
break both probes.
**Proposed fix** `README.md:277` → "only `/login`, `/about`, `/api/health` (the
container liveness/readiness probe, which returns a fixed `{status:'ok'}` and
reads nothing) and `/api/auth/*` are reachable without a session."

---

### DOC-30 — `.env.example` omits three variables the code reads

**Severity** minor
**Location** doc `.env.example` (32 lines, 12 variables); code
`src/lib/ai/claude-service.ts:291,314`, `src/lib/logger.ts:39`
**Claim** `.env.example` presents itself as the complete template — `README.md:38-39`
says `cp .env.example .env` and "Set DATABASE_URL, ANTHROPIC_API_KEY and
AUTH_SECRET at minimum."
**Reality** Nothing in `.env.example` is stale (all 12 entries are read — see the
Env var matrix) and nothing secret-shaped is committed: every value is a visible
placeholder (`"your-anthropic-api-key-here"`,
`"change-me-generate-with-openssl-rand-base64-32"`,
`postgres:postgres@localhost`). But three read variables are absent:
- `ANTHROPIC_MODEL` (`claude-service.ts:291`, also `scripts/test-claude.ts:28`) —
  the documented escape hatch for a retired model id (DOC-21), and it appears in
  no doc at all, only in a code comment.
- `ANTHROPIC_BASE_URL` (`claude-service.ts:314-315`) — README:227 explains it,
  `.env.example` does not list it.
- `LOG_LEVEL` (`src/lib/logger.ts:39`) — undocumented everywhere.

`APP_BASE_URL` and `APP_SESSION_COOKIE` (`scripts/test-*.ts`) are correctly
documented at `README.md:98-100` and are per-invocation, not `.env` material.
**Proposed fix** Append to `.env.example`:

```
# Model override. The default is claude-sonnet-5; pin an older snapshot here
# only if you have a reason. A retired id fails as a 404 at request time.
# ANTHROPIC_MODEL="claude-sonnet-5"
# Route model calls at a gateway, proxy or stub. Unset = the real API.
# ANTHROPIC_BASE_URL=""
# Log level. Defaults to debug in development, info otherwise.
# LOG_LEVEL="info"
```

---

### DOC-31 — `docs/roadmap.md` is six days and six commits stale

**Severity** minor
**Location** doc `docs/roadmap.md:8,411`; code/history `git log --since=2026-09-02`,
`vitest run`
**Claim** `docs/roadmap.md:8` — "Last reviewed: 2026-09-02." and `:411` —
"**Done 2026-09-01.** Vitest, **79 tests** over the pure logic".
**Reality** Today is 2026-09-08 and six commits have landed since the review
date, none of them reflected: `ce9eb1d` (2026-09-07, "Migrate off the retired
model, and off three assumptions that went with it" — the substantive change
behind DOC-21, and it also raised `maxTokens` to 16384 at
`claude-service.ts:296`), `a575986`, `335412d`, `b1d94a9` (2026-09-07), and the
merges `fe7b160`/`7565f5a` (2026-09-08). The test count has nearly doubled:
`npm run test:unit` reports **11 files, 151 tests** (11 tracked `*.test.ts` files,
including `src/auth.config.test.ts`), against the 79 recorded. Everything the
roadmap marks done that this pass could check *is* in fact done — rate limiting
(`middleware.ts:41-54`), the upload bound (`readCappedFormData` in
`src/lib/uploads.ts`), `policyId`/`citation`/`deadlineSource` provenance
(`src/lib/obligation-provenance.ts` + migration
`prisma/migrations/20260902090000_add_obligation_provenance/`), the coverage
report (`scripts/policy-coverage.ts:28` implements `--check`), the
`/policies` split (`src/app/policies/page.tsx:90`), `abuse_neglect` as a
first-class type (`src/types/index.ts:33`) — so this is staleness, not falsehood.
The one item it lists as open and which is genuinely open is "Vector search"
(`:432`), corroborated by DOC-25.
**Proposed fix** Bump `:8` to "Last reviewed: 2026-09-08", correct `:411` to
"151 tests", and add a short entry for the model migration under `## Done`
recording that the id moved to `claude-sonnet-5`, `maxTokens` to 16384, and that
`ANTHROPIC_MODEL` is the pin — so the next reader does not rediscover DOC-21.

---

### DOC-32 — CLAUDE.md's "no local database in this checkout" sends a developer at production

**Severity** minor
**Location** doc `CLAUDE.md` ("`.env` points at production."); local state
`.env` `DATABASE_URL`
**Claim** "**`.env` points at production.** There is no local database in this
checkout — `DATABASE_URL` in `.env` is the hosted Postgres the pilot runs on."
**Reality** The second half is exactly right: `.env`'s `DATABASE_URL` resolves to
`postgres://…@db.prisma.io:5432/postgres`. But "there is no local database" is
false of this machine — a local `generalschat_dev` exists and is the correct
target for `npm run dev` (recorded in the project memory note
`local-dev-database.md`, which exists precisely because the two statements
conflict; as of 2026-09-07 it holds `admin@example.test`, `reporter@example.test`
and three policies loaded from `sample-policies/`). The absolutism is what makes
this worth fixing: a developer who believes no local option exists runs the app
on whatever `.env` gives them, which is production data about real minors — the
outcome the paragraph is written to prevent.
**Proposed fix** Change to: "**`.env` points at production.** `DATABASE_URL` in
`.env` is the hosted Postgres the pilot runs on. Never run the app or any script
against it. A local `generalschat_dev` is the right target; pass it explicitly and
never edit `.env`:
`DATABASE_URL=\"postgresql://$USER@localhost:5432/generalschat_dev?schema=public\" npm run dev`."
Note this is the one finding whose contradicting evidence is machine state rather
than a repo file, so confirm the local database before editing.

---

### DOC-33 — QUICK_START Method 3 sends the user to a page with no upload UI

**Severity** minor
**Location** doc `QUICK_START_POLICY_UPLOAD.md:69-88`; code
`src/app/policies/page.tsx:29-33,90`, `src/app/api/admin/policies/upload/route.ts:27`
**Claim**

> ### Method 3: Web UI Upload
> 2. Navigate to: http://localhost:3000/policies
> 3. Click **"Upload Policy"** button

**Reality** `/policies` is the read-only library. `src/app/policies/page.tsx` has
no upload control at all — its only reference to management is a link out at line
90 (`href="/admin/policies"`), and the comment at lines 29-33 records the
decision: *"the duplicate […] /admin/policies stays admin-only for management."*
`README.md:167` has it right ("The admin UI at `/admin/policies`"). Two smaller
inaccuracies in the same doc: the accepted extensions are
`['.txt', '.md', '.pdf', '.docx', '.doc']`
(`src/app/api/admin/policies/upload/route.ts:27`), so both `.md` and `.doc` are
missing from `QUICK_START…:143-147` and `.doc` from `README.md:167`; and
`QUICK_START…:262` says the snapshots in `docs/history/` are "from November 2025"
when `docs/history/2026-08-31-design-brief.md` is from August 2026. The 10MB
limit at `:149` is correct (`src/lib/uploads.ts:16`,
`DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024`).
**Proposed fix** `QUICK_START_POLICY_UPLOAD.md:78` → `http://localhost:3000/admin/policies`
(admin role required; `/policies` is the read-only library for every other role).
Add `.md` and `.doc` to `:143-147` and `.doc` to `README.md:167`. Reword `:262` to
"Dated snapshots are in `docs/history/`."

---

## Organization findings

### REPO-23 — `scripts/clear-incidents.ts`: unwired, undocumented, unguarded mass delete

**Severity** major
**Location** `scripts/clear-incidents.ts:1-32`; contrast
`e2e/global-setup.ts:18-23`, `scripts/reindex-policies.ts:28`,
`scripts/load-policy.ts:30`
**Reality** Every other destructive path in this repo carries a guard.
`e2e/global-setup.ts:18-23` refuses a database whose name lacks `test`.
`reindex-policies.ts:28` and `load-policy.ts:30` are dry-run by default and
require `--apply`. `clear-incidents.ts` has none of it: no arguments, no
`--apply`, no prompt, no database-name check, and five unfiltered
`deleteMany({})` calls (lines 9, 12, 15, 18, 21) covering `auditLog`,
`complianceAction`, `attachment`, `conversation` and `incident`. It resolves its
connection from `../src/lib/db` (line 1), i.e. from `.env`, i.e. production. It
is in no `package.json` script (so it is absent from README's script table) and
in no doc — invisible right up to the moment someone runs it. Deleting the audit
log is the part with no recovery: it is the record of who read which student
record.
**Proposed fix** Give it the guards its siblings have: refuse a `DATABASE_URL`
whose database name does not contain `test` or `dev`, require `--apply`, print the
target host and the row counts it would delete first, and never delete `auditLog`
(pass `--include-audit` if that is ever wanted). Then wire it in as
`"db:clear-incidents"` so it is visible in `package.json` and can be documented.
If it was a one-off for `docs/roadmap.md:14-16`, delete it — the roadmap already
records what it did.

---

### REPO-24 — `scripts/migrate-chat-titles.ts`: unwired one-off backfill, still runnable against production

**Severity** minor
**Location** `scripts/migrate-chat-titles.ts:1-25`
**Reality** A backfill that rewrites the title of every incident with a non-null
`incidentType` (query at lines 19-25), described in its own header as a
"Migration script to enhance existing chat titles". Same exposure as REPO-23 —
`prisma` from `../src/lib/db` at line 1, no dry run, no guard — with a far smaller
blast radius (titles, not rows). It is in no `package.json` script and no doc. It
does at least import `INCIDENT_TYPE_LABELS` from `../src/types` (line 2) with a
comment noting that this stops it drifting from the runtime, so it is not rotten,
just orphaned.
**Proposed fix** If the backfill has run everywhere it needed to, delete it — a
completed data migration is history, and `prisma/migrations/` is where migrations
live. If it must stay, wire it in as `"db:migrate-chat-titles"` and add the
dry-run default.

---

### REPO-25 — Two policy-upload docs sit at the repo root, against CLAUDE.md's own filing rule

**Severity** minor
**Location** `POLICY_MAPPING.md` (159 lines), `QUICK_START_POLICY_UPLOAD.md`
(262 lines) at the repo root; rule in CLAUDE.md ("Where things are written down")
**Reality** CLAUDE.md names four documentation homes — `docs/roadmap.md`,
`docs/audit/`, `docs/history/`, and (implicitly) `README.md` — and these two files
are in none of them. `git ls-files` confirms both are tracked at the top level,
where they sit beside `README.md` and `CLAUDE.md` as if they were peers.
`README.md:162` treats them as a subordinate reference ("see
`QUICK_START_POLICY_UPLOAD.md` for detail"), which is what they are. Both are
also the least accurate documents in the repo (DOC-22, DOC-26, DOC-33), and being
unfiled is part of why: nothing about their location says who owns them or when
they were last true. `SCREAMING_SNAKE.md` also breaks the naming of everything
under `docs/` (`deploy-azure.md`, `roadmap.md`, dated audit files).
**Proposed fix** `git mv POLICY_MAPPING.md docs/policy-mapping.md` and
`git mv QUICK_START_POLICY_UPLOAD.md docs/policy-upload.md`; update the four
references (`README.md:162`, `README.md`'s policy section,
`QUICK_START_POLICY_UPLOAD.md:261` → README, `POLICY_MAPPING.md`'s pointer) and
add both to CLAUDE.md's "Where things are written down" with a line saying what
each is for. Consider merging them — they overlap on the category table, the
upload methods and the (stale) status section.

---

### REPO-26 — `.gitignore` does not ignore `.claude/`, though `.dockerignore` does

**Severity** minor
**Location** `.gitignore:28-32` (IDE section); `.dockerignore:23`
**Reality** `.claude/` exists in the working tree and is untracked, but nothing
ignores it: `git check-ignore -v .claude` reports NOT IGNORED, `.git/info/exclude`
is stock, and `git config core.excludesfile` is empty. It stays out of the repo
only because nobody has run `git add -A`. `.dockerignore:23` already lists
`.claude/` alongside `.git/` and `.github/`, so the two ignore files disagree
about the same directory. It holds agent settings and, depending on
configuration, local permission grants — not secrets, but not source either.
**Proposed fix** Add `.claude/` to the IDE block at `.gitignore:28-32`. Keep
`.claude/settings.json` tracked with `!.claude/settings.json` if the project ever
wants to share settings; today there is nothing to share.

---

### REPO-27 — `sample-policies/` carries a 9.8MB tracked PDF and a 34-byte empty stub

**Severity** minor
**Location** `sample-policies/` (5 tracked files);
`QUICK_START_POLICY_UPLOAD.md:9`, `POLICY_MAPPING.md:8`, `README.md:166`
**Reality** `sample-policies/sexual-harassment-policy.pdf` is 9,835,015 bytes and
tracked in git — it is ~99% of the repo's committed content and it is a document
that would be re-downloaded from the district, not authored here.
`sample-policies/sexual-harassment-policy.txt` is 34 bytes of nothing but blank
lines: a failed text extraction of that PDF, committed and left. The project
memory note records the consequence — "`sample-policies/sexual-harassment-policy.txt`
is a 34-byte stub; the loader refuses it, correctly", which is
`scripts/load-policy.ts:75-76` (`if (words < 50)`) doing its job on a file that
should not exist. The directory is otherwise legitimately in use: three docs point
users at it as the drop point and `scripts/batch-upload-policies.ts:205` resolves
against it. `.dockerignore:28` correctly excludes it from images. Nothing here is
a student record — all five files are policy documents.
**Proposed fix** `git rm sample-policies/sexual-harassment-policy.txt` (it is an
extraction artifact, not a sample). Decide deliberately whether the 9.8MB PDF
belongs in git; if the answer is "it is the one PDF fixture that proves PDF
extraction works", say so in a `sample-policies/README.md` so the next person does
not add four more.

---

### REPO-28 — Unreferenced assets in `public/`

**Severity** minor
**Location** `public/` (9 tracked files)
**Reality** Five are `create-next-app` boilerplate referenced from nowhere in
`src/` or `e2e/`: `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`,
`window.svg`. Two more are unreferenced project assets: `sau24-logo.png` and
`sau24-logo.svg`. Only three are live — `General.jpeg`
(`src/app/chat/page.tsx`, `src/app/login/page.tsx`), `logo.png`
(`src/components/Navbar.tsx`), and `src/app/favicon.ico` (which is in `src/app/`,
not `public/`, and is picked up by Next's convention). Everything in `public/` is
copied into the runtime image at `Dockerfile:65`.
**Proposed fix** `git rm public/{next,vercel,file,globe,window}.svg`. Ask before
removing the two `sau24-logo` files — they look like a pending district rebrand
rather than boilerplate.

---

### REPO-29 — Single-file subdirectories under `src/lib/` and `src/components/`

**Severity** minor
**Location** `src/lib/utils/`, `src/components/ui/`
**Reality** `src/lib/` holds 15 modules flat (`session.ts`, `uploads.ts`,
`deadline.ts`, `rate-limit.ts`, …) plus `src/lib/ai/` (7 modules, a coherent
grouping) plus `src/lib/utils/`, which contains exactly one module,
`documentProcessor.ts`, and its test. There is also a flat `src/lib/utils.ts`
alongside the `src/lib/utils/` directory — a name collision that is legal but
reads as a mistake. Similarly `src/components/design/` holds ten components and
`src/components/ui/` holds one, `button.tsx`, with four components sitting flat
in `src/components/`. Tests are consistently colocated as `*.test.ts` next to
their subject (10 under `src/lib/**`, 1 at `src/types/`, 1 at
`src/auth.config.test.ts`) — that convention is uniform and worth keeping.
**Proposed fix** Move `src/lib/utils/documentProcessor.ts` (+ its test) to
`src/lib/documentProcessor.ts` and delete the directory, or fold it into
`src/lib/ai/` since retrieval is its only consumer (`src/lib/ai/rag.ts:15`).
Either way, remove the `utils.ts` / `utils/` ambiguity. Leave
`src/components/ui/button.tsx` where it is if it is a shadcn-convention shim
(`@radix-ui/react-slot` and `class-variance-authority` are dependencies, which
suggests it is); otherwise flatten it.

---

### REPO-30 — Local `data/` holds an empty SQLite remnant from the pre-Postgres era

**Severity** minor
**Location** `data/` (untracked, ignored at `.gitignore:21`); `.dockerignore:13`
**Reality** Correctly untracked and correctly ignored in both ignore files, so
this is hygiene rather than exposure. `data/compliance.db` is 0 bytes, dated
2025-11-01, and `data/chroma/` is empty. Both predate the Postgres migration
(`prisma/migrations/20251102143047_initial_postgres_schema/`), and
`docker-compose.yml:3-8` records that the SQLite `DATABASE_URL` was one of the
things that made this file unable to start the app. No code reads either path —
`src/lib/ai/chroma.ts:45` uses `CHROMA_URL` over HTTP, not a local directory. The
only cost is that a fresh clone plus a stale checkout look different for no
reason.
**Proposed fix** Delete `data/` locally. Keep `data/` in `.gitignore:21` and
`.dockerignore:13` — the entries are cheap insurance against the SQLite path
coming back.

---

## Tracked-file audit

`git ls-files` — 177 files. Nothing that should not be tracked is tracked.

```
$ git ls-files | grep -Ei '(^|/)\.DS_Store$|^\.next/|tsconfig\.tsbuildinfo|^playwright-report/|^test-results/|^uploads/|^src/generated/|(^|/)\.env$|(^|/)\.env\.|^e2e/\.auth/|\.log$'
.env.example
```

`.env.example` is the only hit and is intended — 32 lines, 12 variables, every
value a visible placeholder (`"your-anthropic-api-key-here"`,
`"change-me-generate-with-openssl-rand-base64-32"`,
`postgres:postgres@localhost:5432/generalschat`). **No committed secret.**

History, not just HEAD:

```
$ git log --all --oneline -- .env                 → (empty)
$ git log --all --oneline -- uploads              → (empty)
$ git log --all --oneline -- src/generated        → (empty)
$ git log --all --oneline -- '*.DS_Store'         → (empty)
$ git log --all --oneline -- e2e/.auth            → (empty)
$ git log --all --oneline -- test-results playwright-report
85b4638 chore: unbreak the checks and clear stray artifacts
cf35631 Add Playwright e2e testing infrastructure
```

**No `.env` and no `uploads/` has ever been committed on any ref** — so no
student record has ever entered git history. Playwright output was committed
once (`cf35631`) and removed in `85b4638`; `.gitignore:41-45` now carries the
reason in a comment. Screenshots of the app's own seeded fixtures are not student
records.

Present in the working tree and correctly untracked/ignored: `.DS_Store`,
`.next/`, `tsconfig.tsbuildinfo`, `playwright-report/`, `test-results/`,
`uploads/` (6 real policy files + a `policies/` subdirectory), `data/`, `.env`,
`node_modules/`. `git status --porcelain` is clean apart from
`?? docs/audit/2026-09-08-findings.md`, which is this audit session's own
in-progress output, not a pre-existing condition.

`.gitignore` (57 lines) vs `.dockerignore` (36 lines): both cover `.env*`
(`.dockerignore:6-8` keeps `.env.example`), `uploads/`, `data/`, `node_modules/`,
`.next/`, `src/generated/`, `test-results/`, `playwright-report/`, `.DS_Store`,
`*.tsbuildinfo`, `.vscode/`, `.idea/`. `.dockerignore` additionally strips
`.git/`, `.github/`, `.claude/`, `docs/`, `e2e/`, `sample-policies/` and `*.md`
except `README.md` — correct for an image. The one asymmetry is `.claude/`
(REPO-26). `.gitignore:56-57` correctly protects
`deploy/azure/.env` and `deploy/azure/.provisioned`, the latter being what
`deploy/azure/provision.sh:66-70` writes `chmod 600` as the only copy of the
database password.

Broken intra-doc links across `README.md`, `CLAUDE.md`, `POLICY_MAPPING.md`,
`QUICK_START_POLICY_UPLOAD.md`, `docs/roadmap.md`, `docs/deploy-azure.md`,
`docs/history/README.md` and `docs/audit/*.md`: **none** (the single reported miss
is a forward reference inside this session's own untracked audit file).

`docs/history/README.md` is accurate: all four files are correctly marked
superseded, each with a stated reason (lines 16-19), and lines 3-5 state plainly
that none describes the current system. `README.md:261-262` independently flags
`docs/history/2025-11-02-lawyer-persona.md` as superseded on the specific point a
reader might otherwise trust. `docs/audit/` holds five dated files, unmodified
since 2026-09-01 — consistent with CLAUDE.md's "do not rewrite".

`LICENSE` / `package.json`: `LICENSE` is MIT, "Copyright (c) 2024 CoachCoe".
`package.json` has **no `license` field and no `repository` field**, and its
`name` is `school-compliance-ai` while the repo, the README title, and the clone
URL at `README.md:34` are all `GeneralsChat`. Nothing depends on either name:
`grep` finds no consumer of `package.json`'s `name` — the Azure deployment names
come from `deploy/azure/env.example:5` (`APP_NAME="generalschat"`) and the image
tags from `deploy/azure/deploy.sh:25-26`, the Docker image is built from a path
not a package name, and `"private": true` means the name is never published. It
surfaces only in npm's own output (`> school-compliance-ai@0.1.0 test:unit`).
Cosmetic; worth one commit to add `"license": "MIT"` and `"repository"` and to
rename to `generalschat`, but nothing breaks either way.

---

## Env var matrix

Read from tracked sources only (`src/generated/` is gitignored Prisma output and
its `DEBUG`/`PRISMA_*`/`DOTENV_*` reads are excluded). `AUTH_SECRET` and
`AUTH_TRUST_HOST` are consumed by NextAuth itself rather than by a
`process.env` read of ours.

| Variable | Read where | In `.env.example`? | In README? | Required? |
|---|---|---|---|---|
| `DATABASE_URL` | `e2e/global-setup.ts:18,21,23`; Prisma datasource `prisma/schema.prisma`; every script via `src/lib/db.ts` | yes (:4) | yes (:39,:54-57) | **yes** |
| `AUTH_SECRET` | NextAuth (`src/auth.ts` / `src/auth.config.ts`); `docker-compose.yml:47` fails without it | yes (:7) | yes (:39,:282-283) | **yes** |
| `ANTHROPIC_API_KEY` | `src/lib/ai/claude-service.ts:304,309`; `scripts/test-phase3.ts:32,36`; `scripts/test-claude.ts:11,16,25` | yes (:15) | yes (:39) | **yes** |
| `NEXTAUTH_URL` | `src/auth.config.ts:52` (decides the `__Secure-` cookie) | yes (:9) | yes (:282-283) | yes in production |
| `AUTH_TRUST_HOST` | NextAuth; set at `ci.yml:40`, `playwright.config.ts:71`, `containerapp.template.yaml:48` | yes (:11) | no | behind a proxy/container |
| `AUTH_URL` | `src/auth.config.ts:52` (fallback for `NEXTAUTH_URL`) | no | no | no |
| `OPENAI_API_KEY` | `src/lib/ai/embeddings.ts:15,33,56`; `src/lib/ai/rag.ts:63-64`; `scripts/reindex-policies.ts:200`; `scripts/test-rag.ts:27-29` | yes (:19) | yes (:61-68) | no (keyword fallback) |
| `OPENAI_EMBEDDING_MODEL` | `src/lib/ai/embeddings.ts:26` | yes (:20) | no | no |
| `CHROMA_URL` | `src/lib/ai/chroma.ts:45` | yes (:24) | yes (:61-68) | no |
| `CHROMA_COLLECTION` | `src/lib/ai/chroma.ts:39` | yes (:25) | no | no |
| `UPLOADS_DIR` | `src/lib/uploads.ts:202` | yes (:28) | no | no (defaults `./uploads`) |
| `MAX_FILE_SIZE` | `src/lib/uploads.ts:19` | yes (:29) | no | no (defaults 10MB) |
| `NODE_ENV` | `src/lib/db.ts:9`, `src/lib/logger.ts:4`, `src/lib/errors.ts:182`, `src/app/error.tsx:49`, `src/app/global-error.tsx:93`, `src/components/ErrorBoundary.tsx:86` | yes (:32) | no | set by the toolchain |
| `ANTHROPIC_MODEL` | `src/lib/ai/claude-service.ts:291`; `scripts/test-claude.ts:28` | **no** (DOC-30) | **no** | no (defaults `claude-sonnet-5`) |
| `ANTHROPIC_BASE_URL` | `src/lib/ai/claude-service.ts:314-315`; set by `playwright.config.ts:69` | **no** (DOC-30) | yes (:227) | no |
| `LOG_LEVEL` | `src/lib/logger.ts:39` | **no** (DOC-30) | **no** | no |
| `APP_BASE_URL` | `scripts/test-chat-behavior.ts:7`, `test-complete-rag.ts:8`, `test-lawyer-persona.ts:7`, `batch-upload-policies.ts:55` | no (per-invocation) | yes (:98-99) | no |
| `APP_SESSION_COOKIE` | `scripts/test-chat-behavior.ts:14`, `test-complete-rag.ts:15`, `test-lawyer-persona.ts:14` | no (per-invocation) | yes (:100) | for those scripts |
| `PLAYWRIGHT_PORT` | `playwright.config.ts:11` | no (test knob) | no | no (defaults 3100) |
| `CLAUDE_STUB_PORT` | `playwright.config.ts:69` | no (test knob) | no | no (defaults 3999) |
| `CI` | `playwright.config.ts:22-23` | no | yes (:230-235) | set by CI |

**Nothing documented in `.env.example` is unread** — all 12 entries resolve to a
live read. Three read variables are undocumented (DOC-30). Nothing
secret-shaped is committed.

Local drift worth knowing, not a repo finding: the untracked `.env` sets
`NEXTAUTH_SECRET`, not the `AUTH_SECRET` that `.env.example:7` and
`README.md:39` specify.

---

## Script inventory

| Script | Wired into package.json? | Safe against production? | Documented? |
|---|---|---|---|
| `scripts/seed-prompt.ts` | yes — `db:seed-prompt` | writes to `$DATABASE_URL`; idempotent seed | README:85 |
| `scripts/verify-db.ts` | yes — `db:verify` | read-only | README:86, QUICK_START:157 |
| `scripts/create-user.ts` | yes — `user:create` | writes one user row; args validated (`:28-34`) | README:88, deploy-azure:58 |
| `scripts/load-policy.ts` | yes — `policies:load` | **dry run by default** (`:30`), `--apply` to write, refuses <50 words (`:75`) | README:172-180, QUICK_START:33-60 |
| `scripts/reindex-policies.ts` | yes — `policies:reindex` | **dry run by default** (`:28`); schema preflight before deleting chunks | README:189-199, CLAUDE.md, deploy-azure:61 |
| `scripts/policy-coverage.ts` | yes — `policies:coverage` | read-only; `--check` (`:28`) exits non-zero | README:182-187, roadmap:82-102 |
| `scripts/batch-upload-policies.ts` | yes — `policies:batch-upload` | **broken** — POSTs to the deleted `POST /api/policies` (`:235`) | README:164, QUICK_START:5, POLICY_MAPPING:119 — all as working (DOC-22) |
| `scripts/clear-incidents.ts` | **no** | **no** — five unguarded `deleteMany({})` incl. `auditLog`; no dry run, no confirmation, no db-name guard | **nowhere** (DOC-24, REPO-23) |
| `scripts/migrate-chat-titles.ts` | **no** | **no** — unguarded backfill over every classified incident | **nowhere** (DOC-24, REPO-24) |
| `scripts/test-phase3.ts` | no (by design) | **no** — creates/deletes `User`/`Incident`/`Conversation`/`Policy` | README:101-110, CLAUDE.md — both warn explicitly |
| `scripts/test-rag.ts` | no (by design) | **no** — same | README:101-110, CLAUDE.md — both warn explicitly |
| `scripts/test-chat-behavior.ts` | no (by design) | needs a server + `APP_SESSION_COOKIE`; no direct DB write | README:97-100 |
| `scripts/test-complete-rag.ts` | no (by design) | same | README:97-100 |
| `scripts/test-lawyer-persona.ts` | no (by design) | same | README:97-100 |
| `scripts/test-claude.ts` | no (by design) | no DB; makes a **billed** Anthropic call | README:112 |

Reverse direction — `package.json` scripts with no doc entry: `postinstall`,
`test:unit:watch`, `test:e2e:headed`. All three are unremarkable; README's table
(`:72-91`) covers the 15 that matter. No `package.json` script points at a
missing file.

---

## What holds

- **No blocker.** No secret and no student record is committed, on any ref. The
  two paths that could have produced one — `.env` and `uploads/` — have no
  history at all, and `.env.example` carries only placeholders.
- **The gate story is exact.** CLAUDE.md's four commands match `package.json`
  (`:9,10,7,13`) and `.github/workflows/ci.yml:61,64,67,72,78`, which splits
  `npm test` into its halves deliberately rather than diverging. `npm run
  test:unit` passes: 11 files, 151 tests, 450ms, no database, no billed call.
- **Every test contract in CLAUDE.md is real and still where it says.**
  `chat-input` (`src/app/chat/page.tsx:661`), `chat-send` (`:690`),
  `chat-loading` (`:568`), `chat-sources` (`:528`), `obligation-queue`
  (`src/app/page.tsx:154`), `aria-label="Send message"` (`chat/page.tsx:692`),
  `nav[aria-label="Main"]` (`src/components/Navbar.tsx:27`), `Close Incident` /
  `Reopen Incident` (`src/app/incidents/[id]/page.tsx:277`), `Generate Summary`
  (`:269`), `Sign in` (`src/app/login/page.tsx:104`), `Sign out`
  (`Navbar.tsx:117`), `Mark done` (`src/components/design/ObligationRow.tsx`).
  The e2e suite exercises them by test id, not by guesswork.
- **Every invariant in CLAUDE.md describes real code.** Session-derived identity
  (`requireUser`/`requireRole` in `src/lib/session.ts`, re-checked in each
  handler on top of `middleware.ts`); `incidentScope` on every by-id lookup —
  including `incidents/[id]/summary`, which delegates to
  `src/lib/ai/incident-summary.ts:37` rather than skipping it — returning
  **404 not 403** (`src/lib/errors.ts:222-230`, with the reasoning spelled out
  at `src/app/api/attachments/[id]/route.ts:41`); the empty-retrieval prompt
  guard (`src/lib/ai/claude-service.ts:436-448`, branch in `buildSystemPrompt`);
  coverage gaps surfaced rather than hidden (`src/lib/policy-coverage.ts`,
  `CoverageGapCard`); attachments served only through
  `GET /api/attachments/[id]` with nothing under `public/`; and `useMounted()`
  on all six time-rendering surfaces plus `DeadlineClock.tsx:36`.
- **The design rules match `src/app/theme.css`.** Three colour tokens and only
  three — `--color-overdue` (`:30`), `--color-attention` (`:31`, commented "due
  soon, or a coverage gap", the OQ-1 widening), `--color-met` (`:32`); three font
  roles (`:35-37`) with `.tabular` forcing `font-variant-numeric: tabular-nums`
  (`:60-62`); the primary button deliberately neutral (`:85-86`); no
  `globals.css` anywhere in `git ls-files`. The single exception is the literal
  uppercase claim (DOC-28).
- **README's route and screen inventory is correct.** Every documented route
  exists with the documented method — `GET /api/obligations`, `PATCH
  /api/obligations/[id]` (`src/app/api/obligations/[id]/route.ts`, PATCH only,
  matching "that is the only state change"), `POST /api/chat`, the `/api/admin/*`
  set — and `POST /api/policies` is gone from both the code and the README. The
  redirects are real: `/incidents/new` → `/chat`
  (`src/app/incidents/new/page.tsx:9`), `active|closed|pending` → the segmented
  list. The four segments are `open`/`pending`/`closed`/`all`
  (`src/app/incidents/page.tsx:50-62`), the chunker is 1000/200
  (`src/lib/utils/documentProcessor.ts:141`, `src/lib/ai/rag.ts:60`), the
  10MB limit is 10MB (`src/lib/uploads.ts:16`), and every `--flag` README
  documents exists in the script that claims it.
- **`docs/deploy-azure.md` matches the config it describes**, on everything but
  DOC-23 and DOC-25: one replica is genuinely pinned (`minReplicas: 1` /
  `maxReplicas: 1`, `containerapp.template.yaml:84-85`), which is what makes the
  roadmap's per-process rate-limit caveat honest; port 3000 agrees across
  `targetPort` (`:13`), the probes (`:68,:77`), `Dockerfile:57,78` and
  `docker-compose.yml:41`; `/app/uploads` is mounted from Azure Files
  (`:50-51,:59-60,:86-89`) and `UPLOADS_DIR` is passed as the absolute path the
  DEAD-62 fix requires; `Standard_B1ms`, `--public-access 0.0.0.0`, the Basic
  registry and the 64GB share all match `provision.sh:38-51`; and
  `sslmode=require` is in the assembled URL (`provision.sh:68`).
- **`docs/history/` and `docs/audit/` are filed as CLAUDE.md says.** Four
  snapshots, each marked superseded with a reason; five dated audit files,
  unmodified.
