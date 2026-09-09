# Audit pass: dead code and duplication — 2026-09-08

Branch `audit/2026-09-08`, read-only. Nothing was changed. Numbering continues
from DEAD-80.

Remediation rule applied throughout: **code whose behaviour is not covered by a
test or a spec line is recorded, not deleted.** For this repo the spec sources
are `CLAUDE.md`, `docs/roadmap.md`, `README.md`, `QUICK_START_POLICY_UPLOAD.md`,
`POLICY_MAPPING.md` and the design/audit records under `docs/`. A mention in
those is what protects a module (the DEAD-28 recursion). `docs/history/` is
excluded from that protection where noted, because `docs/history/README.md`
declares those files no longer describe the system.

Findings already filed and *deliberately* left by an earlier pass are **not
re-filed**; they are listed under "Still open from prior passes" with verified
current line numbers, because several have moved or grown since.

---

# Summary table

| # | Item | Verdict | Covered by test/spec? | Action |
|---|---|---|---|---|
| DEAD-81 | "Overdue" computed four ways; incident page paints an unverified deadline red | blocker | canonical path yes; the three reimplementations no | needs a decision (fix, don't delete) |
| DEAD-82 | "Policy-backed" is `=== 'policy'` server-side and `!== 'model'` client-side | major | server rule only | needs a decision |
| DEAD-83 | Keyword extraction implemented twice; the tested copy has no caller | major | `extractKeywords` yes (test-only); `fallbackSearch`'s copy no | needs a decision |
| DEAD-84 | Two policy-ingestion routes still duplicate create→audit→index→count, now diverged on rate limiting | major | partially (e2e admin upload) | needs a decision |
| DEAD-85 | Three client-feedback conventions; admin pages use `window.alert()` ×17 | major | no | needs a decision |
| DEAD-86 | Jurisdiction brightness map duplicated, already inconsistent | minor | spec line only (`CLAUDE.md` design rule) | needs a decision |
| DEAD-87 | 401/403/429 response bodies shaped twice; wire strings already diverge | minor | no | needs a decision (deliberate split, undocumented divergence) |
| DEAD-88 | `Incident.timeline` is write-only; `buildTimeline` is a fifth deadline bucketing that fabricates milestones | major | no | needs a decision |
| DEAD-89 | `policies:batch-upload` POSTs to an endpoint that was deleted | major | spec (README/QUICK_START/POLICY_MAPPING document it as the bulk path) | needs a decision |
| DEAD-90 | `scripts/clear-incidents.ts`: unwired, ungated, wipes all incident data from `.env` | major | no; absent from `CLAUDE.md`'s unsafe-script list | needs a decision |
| DEAD-91 | Three unused `EmbeddingsService` methods, one a tautological conditional | minor | no | safe to delete (`cosineSimilarity`, `validateEmbedding`, `getEmbeddingDimension`) |
| DEAD-92 | `@prisma/client` declared, imported by nothing | minor | no | needs a decision |
| DEAD-93 | `@types/pdf-parse` in `dependencies`, superseded by a local `.d.ts` | minor | no | safe to delete |
| DEAD-94 | Four new over-exports (`buttonVariants`, `logger` default, `ProcessedDocument`, `SectionedChunk`) | minor | no | safe to delete (downgrade to non-exported) |
| DEAD-95 | Orphaned doc comment: `classifier.ts:4-11` documents a function 12 lines below the class it sits on | minor | no | safe to delete (move it) |

**Counts:** 1 blocker, 6 major, 8 minor.
**Safe to delete:** 4 (DEAD-91, 93, 94, 95). **Needs a decision:** 11.

---

# Duplication

### DEAD-81 — "Is this overdue?" has four implementations, and one of them paints a model-guessed deadline red

- **Severity**: **blocker**. Divergent safety-critical output: the same screen
  shows a deliberately dimmed, unverified countdown next to a red count that
  includes it.
- **Location**:
  - canonical: `src/lib/deadline.ts:96` (`msRemaining < 0`), suppressed for
    unverified deadlines at `src/components/design/DeadlineClock.tsx:38`
  - `src/app/api/obligations/route.ts:76` — `backed.filter(… < now)`
  - `src/app/page.tsx:74` — `verified.filter(… < now)`
  - `src/app/incidents/[id]/page.tsx:182` — `open.filter(a => a.dueDate && new Date(a.dueDate).getTime() < Date.now())`, **no provenance filter at all**
- **Evidence of deadness / divergence**:
  `grep -rn "getTime()\|Date.now()\|new Date(" src --include="*.ts" --include="*.tsx"`
  returns the four sites above and no others that decide lateness. Verified by
  reading each:
  - `incidents/[id]/page.tsx:182` feeds a red pill at `:233-235`
    (`border-overdue/50 … text-overdue`, `{overdue.length} overdue`) and a red
    stamp bar at `:282` → `:380` (`tone: overdue > 0 ? 'text-overdue'`).
  - 35 lines further down, **the same function** asks the same question the
    right way: `:212` `describeDeadline(a.dueDate, a.status, a.completedAt)`
    and `:217` `info.state === 'overdue'`. So the file is internally
    inconsistent about which implementation is authoritative.
  - The obligations rendered in the aside at `:328-330` are passed to
    `ObligationRow`, which dims an unverified clock
    (`ObligationRow.tsx:64` → `DeadlineClock.tsx:38`). The count above them does
    not. `docs/roadmap.md` (OQ-5) states the decided rule verbatim: *"A
    model-sourced deadline gets no red or amber countdown."* This site breaks it.
  - Contributing factor: the page's local `Action` interface
    (`src/app/incidents/[id]/page.tsx:28-35`) omits `deadlineSource`, and the
    row is constructed with a cast — `:330`
    `obligation={{ ...a, incidentId: incident.id } as Obligation}` — so the
    compiler cannot see that the field the count should filter on is available.
- **Covered by a test/spec?** The canonical path is covered
  (`src/lib/deadline.test.ts`, and `e2e/incident-management.spec.ts:242-247`
  pins the server `counts.unverified` rule). **The three reimplementations are
  not.** `e2e/incident-management.spec.ts:283` only asserts the h1 does *not*
  contain "late" in the empty state, which passes under every variant. The rule
  being broken is a spec line: `docs/roadmap.md`, OQ-5.
- **Deliberately retained?** No. DEAD-61 (2026-09-01) filed three of these and
  `docs/audit/2026-09-01-work-completed.md:218` lists DEAD-61 among the
  *deferred* items, not the accepted ones. The fourth consequence — red on an
  unverified deadline — post-dates that filing and contradicts a decision the
  roadmap records as shipped.
- **Classification**: **needs a decision** — but the decision is which single
  implementation survives, not whether to keep three. Nothing here should be
  deleted blind: `incidents/[id]/page.tsx:182` is load-bearing for two rendered
  elements.
- **Proposed fix**: make `describeDeadline` the only answer. Replace `:182` with
  a filter on `describeDeadline(...).state === 'overdue'`, add `deadlineSource`
  to the page's `Action` interface and drop the `as Obligation` cast, and
  exclude model-sourced rows from the red pill and stamp bar the way
  `DeadlineClock` already does. Assert it: an incident fixture with one
  model-sourced overdue obligation must show no red count.

### DEAD-82 — "Policy-backed" is a different predicate on the server and the client, over a free-text column

- **Severity**: major.
- **Location**: `src/app/api/obligations/route.ts:69`
  (`open.filter(o => o.deadlineSource === 'policy')`) vs `src/app/page.tsx:72`
  (`open.filter(o => o.deadlineSource !== 'model')`).
- **Evidence of deadness / divergence**:
  `grep -rn "deadlineSource" src e2e scripts` returns 8 production sites. The
  two above are the only ones that aggregate, and they are complements of each
  other only while exactly two values exist. `prisma/schema.prisma:149` declares
  `deadlineSource String @default("model")` — a free-text column, no enum, no
  CHECK constraint; `src/lib/obligation-provenance.ts:4` narrows it to
  `'policy' | 'model'` in TypeScript only, and the row is written by three
  different code paths (`src/app/api/chat/route.ts:335` hardcodes `'model'`,
  `:311` spreads `resolveProvenance`'s result, and the migration default fills
  legacy rows). Any third value, or a null arriving from a hand-written row, is
  counted as *late* by the home-page headline and *unverified* by the API tally
  — on the same screen, from the same response.
  The comment at `src/app/page.tsx:67-70` asserts the two are the same rule
  ("the same rule /api/obligations applies to its tallies"). They are not.
- **Covered by a test/spec?** The server rule only:
  `e2e/incident-management.spec.ts:242-247` asserts
  `counts.unverified === obligations.filter(o => o.deadlineSource === 'model' && …).length`.
  Nothing asserts the client rule, and no test constructs a row with a third
  value. Substituting `!== 'model'` for `=== 'policy'` in the route leaves the
  suite green.
- **Deliberately retained?** No. This is the unfixed half of DEAD-60 (two
  clocks, two tallies), deferred per
  `docs/audit/2026-09-01-work-completed.md:218`; the *predicate* mismatch is new
  since that filing.
- **Classification**: needs a decision (which predicate is canonical, and
  whether `deadlineSource` should be constrained at the database).
- **Proposed fix**: have the home page render `counts` from the API and delete
  its own arithmetic (`src/app/page.tsx:60-78`), which closes DEAD-60 at the
  same time; or export one predicate from `src/lib/obligation-provenance.ts` and
  use it on both sides. Either way, add a CHECK or enum on `deadlineSource` so a
  third value cannot exist, and correct the comment at `:67-70`.

### DEAD-83 — Keyword extraction is implemented twice; the implementation with a unit test has no caller

- **Severity**: major (retrieval-quality logic that can drift, and the tested
  copy is not the one that runs).
- **Location**: `src/lib/utils/documentProcessor.ts:162-180`
  (`extractKeywords`) vs `src/lib/ai/rag.ts:214-224` (inline, inside
  `fallbackSearch`).
- **Evidence of deadness / divergence**:
  `grep -rn "\bextractKeywords\b" src e2e scripts` returns exactly five hits:
  the declaration at `documentProcessor.ts:162` and four in
  `src/lib/utils/documentProcessor.test.ts` (`:5`, `:120`, `:122`, `:129`).
  **Zero production callers.** Meanwhile `fallbackSearch` — which
  `docs/roadmap.md` names as the retrieval path that actually runs ("The keyword
  fallback works and is category-filtered") — rolls its own:
  `.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(word => word.length >= 4).slice(0, 5)`.
  Same normalisation, different selection: `extractKeywords` filters
  `length > 3` (identical predicate) but then ranks by frequency and returns the
  top 20; `fallbackSearch` takes the first 5 in document order with no ranking.
  A change to one has no effect on the other, and the unit test pins the copy
  that is never executed.
- **Covered by a test/spec?** `extractKeywords`: yes — but only by a test of
  itself. `fallbackSearch`'s copy: no; TEST-37 (2026-09-01) already recorded
  that `fallbackSearch` is untested, and that is still true.
- **Deliberately retained?** No comment or doc mentions either as intentional.
  `extractKeywords` carries `// Simple keyword extraction - in production, use
  more sophisticated NLP` (`:163`), which reads as unfinished rather than
  deliberate.
- **Classification**: needs a decision — **not safe to delete**, because
  deleting `extractKeywords` also deletes the only test of keyword extraction in
  the repo, and the surviving copy has none. This is the DEAD-7 shape: promote
  the dead export to canonical rather than remove it.
- **Proposed fix**: make `extractKeywords` the single implementation, give it the
  parameters `fallbackSearch` needs (max keywords, min length), and have
  `fallbackSearch` call it — which moves the existing test onto the code path
  that runs. Then add the `mode: 'insensitive'` and `isActive` assertions
  TEST-37 asked for.

### DEAD-84 — The two remaining policy-ingestion routes still duplicate one sequence, and have diverged on rate limiting

- **Severity**: major.
- **Location**: `src/app/api/admin/policies/route.ts:41-125` (paste text) vs
  `src/app/api/admin/policies/upload/route.ts:30-204` (file or URL).
- **Evidence of deadness / divergence**: OQ-2 (`docs/roadmap.md`) decided the
  canonical ingestion path and deleted the third route — confirmed:
  `src/app/api/policies/route.ts` now exports only `GET` (`:6`), with the
  deletion recorded in a comment at `:56-63`. The remaining two still run the
  same four-step sequence independently:
  `prisma.policy.create` (`route.ts:70` / `upload/route.ts:137`) →
  `recordAudit` (`:85` / `:154`) → `ragSystem.addPolicyDocument` (`:103` /
  `:172`) → `prisma.policyChunk.count` (`:111` / `:180`), including a
  **verbatim ten-line comment duplicated in both files** (`route.ts:93-102` and
  `upload/route.ts:162-171`). Divergences verified by reading both:
  - `upload/route.ts:37-38` applies `enforceRateLimit(…, RATE_LIMITS.UPLOAD)`.
    `route.ts` has **no rate limit at all** — `grep -n "enforceRateLimit"
    src/app/api/admin/policies/route.ts` returns nothing — so the paste path is
    an unbounded ingestion route, and each POST triggers chunking plus (with
    `OPENAI_API_KEY` set) one embedding call per chunk.
  - Response shapes differ: `route.ts:115` returns the whole `policy` row
    (including `content`); `upload/route.ts:184-194` returns five projected
    fields under a `success` flag. A client cannot treat them interchangeably.
  - `upload/route.ts` writes `filePath` and `metadata.uploadedVia`/
    `originalSource`; `route.ts` writes neither, so a pasted policy has no
    provenance and `policies:reindex` cannot re-extract it from source.
  - The 2026-09-01 report noted `ALLOWED_POLICY_EXTENSIONS` was declared twice;
    that is now resolved — `grep -rn "ALLOWED_POLICY_EXTENSIONS" src` returns
    only `upload/route.ts:27` and `:84`.
  There are two further ingestion implementations outside the API:
  `scripts/load-policy.ts:110-122` and `scripts/reindex-policies.ts:141-142`.
- **Covered by a test/spec?** The upload route is exercised by the admin e2e
  path; the paste route's rate-limit absence is covered by nothing. DEAD-58
  (2026-09-01) proposed `src/lib/policy-ingest.ts`; that file does not exist
  (`git ls-files src/lib` confirms).
- **Deliberately retained?** Partly. OQ-2 explicitly decided to *keep* both
  routes ("keep `POST /api/admin/policies` for the paste-text path the admin UI
  uses"), so the two endpoints are deliberate. The shared-implementation half of
  DEAD-58 was deferred, not accepted; the missing rate limit is new.
- **Classification**: needs a decision (both endpoints are wanted; the shared
  core is what is missing).
- **Proposed fix**: extract `createPolicyFromText(text, facets, provenance, user)`
  into `src/lib/policy-ingest.ts` and make both routes thin adapters — the shape
  that closed DEAD-12 for the summary endpoints. Apply `RATE_LIMITS.UPLOAD` to
  the paste route in the same commit, and settle one response shape.

### DEAD-85 — Client feedback is implemented three ways, and the two admin pages use `window.alert()`

- **Severity**: major (duplication that has already drifted, and one branch
  bypasses the design system entirely).
- **Location**:
  - `StateBlock` + `useState<string | null>` error: `src/app/page.tsx:29,36-39`,
    `src/app/incidents/page.tsx:54,69-73`,
    `src/app/incidents/[id]/page.tsx:73,86-89`,
    `src/app/policies/page.tsx:45,57-60`
  - `react-hot-toast`: `src/app/chat/page.tsx:7` and five `toast.*` calls
  - `window.alert()` + `console.error`: `src/app/admin/policies/page.tsx:39,42,87,96,122,148,183,199,203`
    and `src/app/admin/prompt/page.tsx:76,91,110,123,127,148,151,174,177`
- **Evidence of deadness / divergence**: a per-file survey of `await fetch(` vs
  error state vs `toast.` gives:
  `admin/policies` 5 fetches / 0 error state / 0 toast;
  `admin/prompt` 6 / 0 / 0;
  `chat` 4 / 1 / 5;
  `incidents/[id]` 5 / 4 / 0; `incidents` 1 / 3 / 0; `page.tsx` 2 / 3 / 0;
  `policies` 1 / 3 / 0.
  Seventeen `alert(...)` calls carry every success and failure message on the
  two admin surfaces — including destructive ones (`admin/policies:199`
  "Policy deleted successfully", `:203` "Failed to delete policy"). A browser
  alert is unstyled, blocking, untestable through the design-system locators the
  rest of the suite uses, and `StateBlock`'s own doc comment
  (`src/components/design/StateBlock.tsx:1-6`) states the reason it exists:
  *"Every page previously rolled its own, so the three states looked different
  depending on where you hit them."* Two pages never migrated.
- **Covered by a test/spec?** No. No e2e handles a dialog on either admin page
  (`grep -rn "on('dialog'\|alert" e2e` returns nothing), so the admin mutation
  feedback is asserted nowhere. The spec line is `CLAUDE.md`'s design rules and
  the `StateBlock` doc comment.
- **Deliberately retained?** No. `docs/audit/2026-09-01-ux-redesign.md` and the
  design components record the opposite intent. This is distinct from DEAD-63,
  which is about the three error *pages* (`error.tsx`, `global-error.tsx`,
  `ErrorBoundary.tsx`) — that one is still open too, see below.
- **Classification**: needs a decision (which of toast or `StateBlock` is the
  mutation-feedback convention).
- **Proposed fix**: pick one — `react-hot-toast` is already installed and
  wired through `ToastProvider` in `src/app/layout.tsx:47`, so it is the
  cheapest single convention for transient mutation results, with `StateBlock`
  kept for page-level load/empty/error. Replace all 17 `alert()` calls, and add
  one e2e per admin page asserting the failure message is rendered in the DOM.

### DEAD-86 — Jurisdiction brightness is encoded twice, and the two maps already disagree

- **Severity**: minor.
- **Location**: `src/components/design/AuthorityChip.tsx:11-16` and
  `src/components/design/SourceLadder.tsx:21-26`.
- **Evidence of deadness / divergence**: `CLAUDE.md` states the invariant:
  *"Authority is carried by brightness, federal brightest to school dimmest,
  consistently. Not by colour."* Two independent maps encode it. They agree on
  the label tone (`text-text` → `text-text-secondary` → `text-text-tertiary` →
  `text-text-muted`) and disagree elsewhere:
  - `SourceLadder.tsx:22-25` `title` tone is `text-text-secondary` for
    **federal, state and district alike**, dropping to `text-text-tertiary` only
    for school — so three of the four rungs are indistinguishable on the line the
    reader actually reads.
  - `SourceLadder.tsx:25` `school.dot` is `bg-line-strong`, a border token,
    where the other three use `bg-text*`. The ordering is preserved by accident.
  Nothing links the two maps, so editing one leaves the other stale.
- **Covered by a test/spec?** Spec line only (`CLAUDE.md`, and
  `docs/history/2026-08-31-design-brief.md`). No test asserts brightness
  ordering; TEST-46 (2026-09-01) already recorded that SourceLadder ordering is
  unasserted, and that is still true.
- **Deliberately retained?** No. Both components' doc comments claim to
  implement the same single rule.
- **Classification**: needs a decision (the fix changes rendered output on the
  ladder, which is a design call, not a refactor).
- **Proposed fix**: one exported `AUTHORITY_TONE` record in `src/types/index.ts`
  beside `JURISDICTION_LABELS`, consumed by both components, with the ladder's
  `title` and `dot` derived from it. Assert the ordering in a unit test so
  "consistently" is checkable.

### DEAD-87 — 401/403/429 bodies are shaped twice, and the wire strings already differ

- **Severity**: minor.
- **Location**: `src/lib/errors.ts:237-247` (`unauthorizedError`), `:252-262`
  (`forbiddenError`), `:283-292` (`rateLimitError`) vs
  `src/auth.config.ts:101-104`, `:110-113` and `middleware.ts:46-53`.
- **Evidence of deadness / divergence**: the same three statuses are produced by
  two sets of literals. `errors.ts` emits `{ error: 'Unauthorized', code:
  'UNAUTHORIZED' }` and `{ error: 'Access forbidden', code: 'FORBIDDEN' }`;
  `auth.config.ts` emits `{ error: 'Authentication required', code:
  'UNAUTHORIZED' }` and `{ error: 'Admin role required', code: 'FORBIDDEN' }`.
  `middleware.ts:46-53` reproduces `rateLimitError()`'s three fields inline and
  adds a fourth message. Which body a caller receives depends on whether the
  middleware gate or the handler guard fired first — the codes match, the `error`
  strings do not.
- **Covered by a test/spec?** The status codes are covered by the e2e
  authorization tests; the body shapes are not (`grep -rn "Authentication
  required\|Access forbidden" e2e` returns nothing).
- **Deliberately retained?** **Yes, the split is** — and this is why it is minor
  rather than major. `docs/roadmap.md` records the constraint explicitly:
  *"`src/lib/rate-limit.ts` deliberately imports nothing. `middleware.ts` runs
  on the Edge runtime, and an early version had it import `errors.ts`, which
  pulled Prisma into that bundle and failed the build."* `errors.ts:2` imports
  `Prisma` from `@/generated/prisma`, so it genuinely cannot be imported by
  middleware. What is *not* deliberate is that the strings diverge.
- **Classification**: needs a decision.
- **Proposed fix**: put the three plain objects in a dependency-free module
  (`src/lib/api-errors.ts`, importing nothing — the pattern `rate-limit.ts`
  already follows) and have both `errors.ts` and `auth.config.ts`/`middleware.ts`
  build their responses from it. Do **not** move the `NextResponse` helpers;
  only the payload literals.

---

# Dead code

### DEAD-88 — `Incident.timeline` is written and never read; `buildTimeline` is a fifth deadline bucketing that fabricates milestones

- **Severity**: major (an unused subsystem that persists invented dates into an
  incident record).
- **Location**: `src/lib/ai/classifier.ts:88-120` (`buildTimeline`), invoked at
  `:63`, persisted at `src/app/api/chat/route.ts:162`
  (`timeline: JSON.stringify(classification.timeline)`), column at
  `prisma/schema.prisma:66`, type at `src/types/index.ts:78-84`.
- **Evidence of deadness**:
  `grep -rn "timeline" src e2e --include="*.ts" --include="*.tsx"` (excluding
  `src/generated`) returns 20 hits. Every one is either the write path above, the
  type definition, an unrelated prose comment, the incident page's *own*
  chronology (`src/app/incidents/[id]/page.tsx:66`, which its doc comment
  describes as *"a timeline built from what actually exists"*), or the model's
  separate `timeline: z.array(z.string())` prompt field in `claude-service.ts:50`.
  **No reader of the persisted `Incident.timeline` column exists** — no page, no
  API projection, no script. `grep -rn "immediateActions\|shortTermActions\|investigationPhase\|reportingDeadlines\|reviewMilestones" src e2e scripts`
  returns only the type declaration (`types/index.ts:79-83`) and the producer
  (`classifier.ts:108-117`).
  It is also a fifth bucketing of "when is this due", with thresholds that match
  none of the other four: 24h / 5d / >5d (`:96`, `:100-101`, `:104`), against
  `ATTENTION_WINDOW_HOURS = 24` in `deadline.ts:21` and today/this-week in
  `api/obligations/route.ts:76-85`.
  Worse than unused: `:114-118` writes
  `reviewMilestones: [now+7d, now+14d, now+30d]` — three dates derived from
  nothing, persisted into an incident record, in a product whose stated premise
  (`CLAUDE.md`) is that *"a confidently wrong statutory deadline is worse than no
  answer."* They are unread today, which is the only reason they are harmless.
- **Covered by a test/spec?** No. No unit or e2e test touches `timeline`;
  `e2e/support/claude-stub.ts:33` supplies a `timeline` array to the *prompt*
  schema, not to this structure. `docs/audit/2026-08-31-findings.md:663-664`
  records `buildTimeline` bucketing as *untested* and asked for a test; none was
  added. No doc claims the column is used.
- **Deliberately retained?** No. `docs/roadmap.md`'s "Deliberately not doing"
  table does not list it. `prisma/schema.prisma:66` carries only
  `// JSON: ComplianceTimeline`.
- **Classification**: needs a decision — **not safe to delete**, for two
  reasons: dropping the column is a migration, and existing production rows hold
  this JSON, so a decision is needed on whether that history is worth keeping.
- **Proposed fix**: stop producing it. Delete `buildTimeline`, `ComplianceTimeline`
  and the `timeline` field from `IncidentClassification`, and stop writing
  `src/app/api/chat/route.ts:162`. Keep or drop the column in a follow-up
  migration once someone confirms nothing external reads it. If any part of it is
  wanted, it should be derived on read from `ComplianceAction` rows — which
  carry real deadlines and provenance — rather than snapshotted at
  classification time from the model's guess.

### DEAD-89 — `policies:batch-upload` POSTs to an endpoint that no longer exists, and three docs still recommend it

- **Severity**: major.
- **Location**: `scripts/batch-upload-policies.ts:235`
  (`await fetch(\`${BASE_URL}/api/policies\`, { method: 'POST', body: form })`),
  wired at `package.json:22`.
- **Evidence of deadness**:
  `POST /api/policies` was deleted by OQ-2. Verified:
  `grep -n "^export async function\|^export function" src/app/api/policies/route.ts`
  returns only `GET` at `:6`, and the deletion is recorded in a comment at
  `:56-63`. So the script's only request now returns **405 Method Not Allowed**,
  not the 401 DEAD-59 described. Independently, the script cannot succeed anyway:
  - its `policies` array (`:56` onward) is **entirely commented out**, so it
    iterates zero entries and prints "Total: 0";
  - it sends no session cookie, and every surviving ingestion route is behind
    `requireRole('admin')`;
  - its multipart field set (`title`, `jurisdiction`, `category`,
    `effectiveDate`, `file` — `:216-233`) matches
    `POST /api/admin/policies/upload`'s contract, not the paste-text route's, so
    the fix is a one-line URL change plus auth.
  Meanwhile three spec documents still present it as the bulk path:
  `README.md:87` (*"Bulk-upload policy documents"*), `README.md:164-165`,
  `QUICK_START_POLICY_UPLOAD.md:18-24`, `POLICY_MAPPING.md:119-120`. And
  `QUICK_START_POLICY_UPLOAD.md:62` states in the same file that
  `POST /api/policies` *"is gone"* — while `:18-24` recommends the script that
  posts to it.
- **Covered by a test/spec?** Covered by a spec line in the sense that protects
  it from deletion (README, QUICK_START, POLICY_MAPPING all name it). Not
  covered by any test — nothing executes it.
- **Deliberately retained?** The script is; its target is not. DEAD-59
  (2026-09-01) filed it as unable to authenticate and
  `docs/audit/2026-09-01-work-completed.md` records the docs findings as
  untouched. The endpoint deletion happened afterwards and made it worse.
- **Classification**: needs a decision (repair or retire — retiring means
  editing three documents, which OQ-2 already established is the decision, not
  an obstacle).
- **Proposed fix**: repoint `:235` at `/api/admin/policies/upload`, pass an
  admin session (`APP_SESSION_COOKIE`, the mechanism `README.md:97-100` already
  documents for the other server-dependent scripts), and either populate the
  `policies` array or make it read a manifest file. If instead it is retired,
  remove the `policies:batch-upload` script from `package.json:22` and the four
  doc references in the same commit.

### DEAD-90 — `scripts/clear-incidents.ts` is unwired, ungated, and deletes every incident row from whatever `.env` points at

- **Severity**: major.
- **Location**: `scripts/clear-incidents.ts:1-32`.
- **Evidence of deadness**:
  `grep -c "scripts/clear-incidents.ts" package.json` → **0**. Not in
  `README.md`'s script table (`:70-91`), not in `docs/roadmap.md`'s commands, not
  in `.github/workflows/ci.yml`, not in `deploy/`. The only references anywhere
  are three lines in `docs/audit/2026-08-31-findings.md` (`:205`, `:207`,
  `:1063`), one of which asks for it to be *gated*, not kept as-is.
  What it does, unconditionally, on `npx tsx scripts/clear-incidents.ts` with no
  argument and no prompt: `prisma.auditLog.deleteMany({})` (`:9`),
  `complianceAction` (`:12`), `attachment` (`:15`), `conversation` (`:18`),
  `incident` (`:21`). It imports `../src/lib/db` (`:1`), which takes
  `DATABASE_URL` from `.env` — and `CLAUDE.md` states *"`.env` points at
  production."*
  It has none of the guards its siblings have: no dry-run default (contrast
  `policies:reindex`, dry-run unless `--apply`), no database-name check
  (contrast `e2e/global-setup.ts:21-25`, which refuses a database whose name lacks
  `test`), no confirmation. And `CLAUDE.md`'s list of scripts that write real
  data — *"the `policies:*` and `prisma` commands … and `scripts/test-phase3.ts`
  and `scripts/test-rag.ts`"* — **does not include it**, so an operator reading
  the safety documentation would not know it exists or what it does.
- **Covered by a test/spec?** No test. Its only "spec" mention is an audit
  finding recommending it be gated, and `docs/roadmap.md`'s completed item 1
  ("Cleared: 6 incidents, 12 conversations, 32 obligations"), which is
  presumably what it was used for and is now done.
- **Deliberately retained?** Not stated anywhere. It is not in the
  "Deliberately not doing" table and no comment in the file explains it.
- **Classification**: needs a decision — **do not delete without one.** This is
  the DEAD-24 rule: a data-maintenance script's absence is not recoverable from
  source, and one destructive script that a maintainer knows about is safer than
  an ad-hoc `deleteMany` typed into a REPL when the need next arises.
- **Proposed fix**: whichever way it goes, do it explicitly. Either (a) delete
  it, since the roadmap task it served is complete, or (b) keep it and give it
  the guards the rest of the repo has: refuse a `DATABASE_URL` whose database
  name lacks `test` unless `--i-know-this-is-production` is passed, dry-run by
  default, print counts before deleting, and add it to `CLAUDE.md`'s list of
  scripts that write real data. Note separately that it wipes `AuditLog`, which
  is the FERPA disclosure-accounting table — that alone argues for (b) with a
  hard guard rather than (a).

### DEAD-91 — Three unused `EmbeddingsService` methods, one of them a tautological conditional

- **Severity**: minor.
- **Location**: `src/lib/ai/embeddings.ts:88-111` (`cosineSimilarity`),
  `:117-119` (`getEmbeddingDimension`), `:124-126` (`validateEmbedding`).
- **Evidence of deadness**:
  `grep -rn "\bcosineSimilarity\b" src e2e scripts` → one hit, the declaration.
  `grep -rn "\bvalidateEmbedding\b" src e2e scripts` → one hit, the declaration.
  `grep -rn "\bgetEmbeddingDimension\b" src e2e scripts` → two hits, the
  declaration and `validateEmbedding:125`, which is itself unreferenced — so all
  three are unreachable from any entry point, including
  `scripts/test-rag.ts`, which exercises the rest of the service
  (`:61` calls `generateEmbedding`).
  `getEmbeddingDimension` is additionally a dead conditional:
  `return this.model === 'text-embedding-3-small' ? 1536 : 1536;` — both
  branches return the same value, so the predicate cannot affect the result.
- **Covered by a test/spec?** No. There is no `embeddings.test.ts`
  (`git ls-files src/lib/ai` confirms), and no doc names these three methods.
  The vector *subsystem* is protected — `docs/roadmap.md`'s "Deliberately not
  doing" table has *"Vector search | Needs `OPENAI_API_KEY` **and** a running
  Chroma server. The keyword fallback works…"* — but that protects
  `embeddings.ts` and `chroma.ts` as files, not methods that nothing in the
  subsystem calls either.
- **Deliberately retained?** The files are; these three methods are not
  individually mentioned in any doc or comment beyond their own JSDoc.
  For contrast, `ChromaService.deleteCollection` (`chroma.ts:245`) and
  `updateChunk` (`:263`) are also uncalled but **were** already filed as DEAD-20
  and retained — they are not re-filed here.
- **Classification**: **safe to delete** (all three: unreferenced, uncovered, not
  named by any spec line). The lowest-risk subset is
  `cosineSimilarity` + `validateEmbedding` + `getEmbeddingDimension` together,
  since the third exists only for the second.
- **Proposed fix**: delete `embeddings.ts:88-126`. If a dimension constant is
  wanted when vector search is switched on, reintroduce it as a plain
  `const EMBEDDING_DIMENSION = 1536` at that point rather than a method with a
  predicate that does nothing.

### DEAD-92 — `@prisma/client` is a declared dependency that nothing imports

- **Severity**: minor.
- **Location**: `package.json:30`.
- **Evidence of deadness**:
  `grep -rn "@prisma/client"` across every tracked `.ts/.tsx/.mts/.mjs/.js/.css`
  file returns **zero hits**. All three Prisma consumers import the custom
  generated client instead: `src/lib/db.ts:1`, `src/lib/errors.ts:2` and
  `e2e/support/seed.ts:3` all use `@/generated/prisma`, which is where
  `prisma/schema.prisma:6` (`output = "../src/generated/prisma"`) puts it.
  The generated client is self-contained: `grep -rlo "@prisma/client"
  src/generated/prisma/` returns nothing, its `require`s are
  `./runtime/library.js`, `#main-entry-point`, `fs` and `path`, and
  `src/generated/prisma/runtime/` ships the runtime locally. The lockfile agrees
  nothing else needs it — walking `package-lock.json` for packages declaring
  `@prisma/client` as a dependency or peer dependency returns only the root.
- **Covered by a test/spec?** No. Related: the `src/generated/` directory is
  **correctly untracked** (`.gitignore:48`, and `git ls-files src/generated | wc -l`
  → 0) and correctly ignored by eslint (`eslint.config.mjs:25`), so the
  "generated output committed to the repo" concern raised for this pass does
  **not** apply — see "Verified clean" below.
- **Deliberately retained?** Not documented. But there is a real reason not to
  pull it blind: `package.json:11` runs `prisma generate` on `postinstall` and
  `:7` runs it before every build, and the Prisma CLI resolves
  `@prisma/client/package.json` to determine the client version
  (visible in `node_modules/prisma/build/index.js`). It has a fallback, so
  removal *probably* works — but "probably" is not good enough for something on
  the build path.
- **Classification**: needs a decision. It cannot be verified from source alone;
  it needs one clean `npm ci && npm run build` without it.
- **Proposed fix**: leave it until someone can run that experiment on a clean
  checkout. If it passes, remove it; if it does not, add a one-line comment in
  `package.json`'s vicinity or the README recording that it is required by
  `prisma generate` and not by application code, so this pass does not have to
  be repeated.

### DEAD-93 — `@types/pdf-parse` is a production dependency whose declaration is superseded by a local one

- **Severity**: minor.
- **Location**: `package.json:32` (`"@types/pdf-parse": "^1.1.5"`, in
  `dependencies`, not `devDependencies`).
- **Evidence of deadness**: `@types/pdf-parse` declares the package **root**
  (`node_modules/@types/pdf-parse/index.d.ts`: `export = PdfParse`). Nothing
  imports the root — the single consumer is
  `src/lib/utils/documentProcessor.ts:40`,
  `pdf = (await import('pdf-parse/lib/pdf-parse.js')).default`, and its types
  come from `src/types/pdf-parse.d.ts:9`, which declares
  `module 'pdf-parse/lib/pdf-parse.js'` and whose own doc comment (`:1-8`)
  explains why the root is unusable: *"`@types/pdf-parse` declares the package
  root, but the root cannot be imported: its index.js runs a debug harness that
  reads a test fixture the package does not ship."*
  `grep -rn "'pdf-parse'" src e2e scripts` returns nothing — only the
  `/lib/pdf-parse.js` subpath. `tsconfig.json` sets no `types` array, so the
  package is loaded globally and contributes an unused module declaration.
- **Covered by a test/spec?** No. `src/lib/utils/documentProcessor.test.ts` does
  not exercise the PDF branch, and no doc names the types package.
- **Deliberately retained?** No — and the local `.d.ts` comment argues the
  opposite: the root types are the ones that *cannot* be used.
- **Classification**: **safe to delete.** Removing it cannot break
  `npm run typecheck`, because the only import in the repo resolves through
  `src/types/pdf-parse.d.ts`.
- **Proposed fix**: remove `@types/pdf-parse` from `package.json`. Separately,
  note that a `@types/*` package in `dependencies` rather than `devDependencies`
  ships type-only bytes into the production tree — the DEAD-35 mistake, in the
  same file.

### DEAD-94 — Four symbols exported with no external consumer

- **Severity**: minor. Grouped because they are one class of defect, and none is
  worth its own finding.
- **Location**:
  - `src/components/ui/button.tsx:52` — `buttonVariants` is exported and used
    only at `:43`, inside the same file.
  - `src/lib/logger.ts:178` — `export default logger`; the five importers
    (`api/chat/route.ts:6`, `api/incidents/[id]/route.ts:3`,
    `api/incidents/[id]/summary/route.ts:2`, `ai/claude-service.ts:4`,
    `lib/audit.ts:2`) all take named exports only.
  - `src/lib/utils/documentProcessor.ts:10` — `ProcessedDocument`, referenced
    only at `:20` in the same file.
  - `src/lib/utils/documentProcessor.ts:182` — `SectionedChunk`, referenced only
    at `:208` and `:213` in the same file.
- **Evidence of deadness**: for each, a `grep -rn "\b<name>\b" src e2e scripts`
  (excluding `src/generated`) returns hits only within the declaring file. Method:
  the same scan that produced the "still open" list below, extended to
  `export {` and `export default`, which the earlier passes' regex missed.
- **Covered by a test/spec?** No. None appears in a test or a doc.
- **Deliberately retained?** No comment or doc marks any of them as a public
  API. This is the DEAD-4 "needlessly-exported internals" shape, in files that
  pass did not reach.
- **Classification**: **safe to delete** — meaning drop the `export` keyword,
  not the code. The behaviour is unchanged and `npm run typecheck` proves it.
- **Proposed fix**: make all four module-private. Doing so also lets
  `@typescript-eslint/no-unused-vars` catch them if they later become genuinely
  unused, which an `export` currently hides.

### DEAD-95 — An orphaned doc comment documents a function twelve lines below the class it sits on

- **Severity**: minor.
- **Location**: `src/lib/ai/classifier.ts:4-11`.
- **Evidence of deadness**: the comment reads *"Bucket an obligation by what it
  asks the administrator to do. Exported because obligations are now created in
  two places… (OQ-5)"* — which describes `actionTypeFor`, declared at `:23`.
  Between them sit a second doc comment (`:12-15`, *"Classification could not be
  completed…"*) and the class it documents, `ClassificationUnavailableError`
  (`:16-21`). So the file presents two stacked doc comments above one symbol,
  and `actionTypeFor` — the function the first one is about, and the one whose
  export is load-bearing (`src/app/api/chat/route.ts:316` and
  `classifier.ts:56`) — appears undocumented.
- **Covered by a test/spec?** No; it is a comment. `actionTypeFor` itself is
  live and must not be touched.
- **Deliberately retained?** No. This is the same defect class the 2026-09-01
  pass filed for `rag.ts:284` and `rag.ts:144` and marked deletion-eligible.
- **Classification**: **safe to delete** — i.e. move it. Zero behaviour change.
- **Proposed fix**: move `:4-11` down to immediately above `:23`. Worth doing in
  the same commit as the two `rag.ts` comment defects below, since it is the
  identical mistake in a second file.

---

# Still open from prior passes — recorded, not re-filed

Verified present at the line numbers given, on this branch. No new numbers
assigned; these belong to their original findings.

| Finding | Current location | Status |
|---|---|---|
| DEAD-60 — overdue/today/week computed twice on two clocks | `src/app/api/obligations/route.ts:56-88` and `src/app/page.tsx:60-78` | unfixed; now also predicate-divergent, see DEAD-82 |
| DEAD-61 — "is this overdue?" reimplemented | `src/app/incidents/[id]/page.tsx:182`, `src/app/api/obligations/route.ts:76` | unfixed; now four sites, see DEAD-81 |
| DEAD-63 — three near-identical error UIs | `src/app/error.tsx`, `src/app/global-error.tsx`, `src/components/ErrorBoundary.tsx`; the green primary button is `global-error.tsx:141` (`#10b981`), against `src/app/theme.css:85-87` | unfixed |
| DEAD-58 — parallel policy ingestion | reduced from three routes to two (`POST /api/policies` deleted, recorded at `src/app/api/policies/route.ts:56-63`); no `src/lib/policy-ingest.ts` exists | partially fixed, see DEAD-84 |
| DEAD-59 — `policies:batch-upload` cannot work | `scripts/batch-upload-policies.ts:235` | worse, not better, see DEAD-89 |
| DEAD-3 — unused zod schemas | `src/lib/validation.ts:36,48,58,72,84,94,103,119,141,195` (ten inferred input types with no consumer) | unchanged |
| DEAD-4 — unused error helper | now only `serviceUnavailableError` at `src/lib/errors.ts:267`; `rateLimitError` became live with SEC-23 | improved |
| DEAD-5 — three unused logger exports | `src/lib/logger.ts:53` `createLogger`, `:104` `logDatabaseOperation`, `:168` `logSecurity` | unchanged |
| DEAD-6 — unused type exports | `src/types/index.ts:66,113,258,275,289,299,308,315` (`IncidentStatusValue`, `UserRole`, `PolicyType`, `ConversationMessage`, `FileUpload`, `AIResponse`, `IncidentIntakeFlow`, `PolicyDocument`) — now eight, not seven | unchanged. `PolicyType:257`'s *"Retained for existing imports"* is still false: zero importers |
| DEAD-7 — `extractTextFromFile` | `src/lib/utils/documentProcessor.ts:124`, zero callers | unchanged |
| DEAD-9 — two error conventions in route handlers | 13 of 19 route files now import `src/lib/errors.ts`; the six that do not are `api/admin/prompts/route.ts`, `api/admin/prompts/[id]/route.ts`, `api/chat/[incidentId]/route.ts`, `api/chat/history/route.ts`, `api/incidents/route.ts`, `api/policies/route.ts` | much improved, not closed |
| DEAD-20 — uncalled Chroma methods | `src/lib/ai/chroma.ts:245` `deleteCollection`, `:263` `updateChunk` | unchanged; protected by the roadmap's Vector-search row |
| DEAD-25 / DEAD-26 — overlapping demo harnesses | `scripts/test-chat-behavior.ts` (173 lines) and `scripts/test-lawyer-persona.ts` (210) are still the same three-`POST /api/chat` harness, the latter a superset adding `/api/chat/summary` (`:147`); `scripts/test-complete-rag.ts` overlaps `scripts/test-rag.ts` | unchanged, and now **explicitly protected**: `README.md:93-112` documents all five `test-*` scripts by name and groups them by hazard. Not deletable under the rule |
| DEAD-72-class — duplicated comment | `src/lib/ai/rag.ts:138-143` and `:144-146` say the same thing twice about Chroma metadata filtering | unchanged; deletion-eligible |
| DEAD-7x — orphaned chunker doc comment | `src/lib/ai/rag.ts:283-285`, a doc comment for a function that no longer exists, immediately above `generateResponseWithCitations`'s own | unchanged; deletion-eligible |
| DEAD-7x — Navbar scroll listener toggles an undefined class | `src/components/Navbar.tsx:17-24` and `:27`; **both** `scrolled` and `safe-area-inset-top` are undefined — `grep -rn "safe-area-inset-top\|scrolled" src` returns only that one line, and neither appears in `src/app/theme.css` | unchanged; the `safe-area-inset-top` half was not in the original filing |
| DEAD-80 / REPO-18 — root files outside lint and typecheck | `package.json:9` is still `eslint src scripts e2e`, so `middleware.ts`, `next.config.ts`, `playwright.config.ts`, `postcss.config.mjs`, `eslint.config.mjs` and `vitest.config.mts` are unlinted; `tsconfig.json:25`'s `**/*.ts` still does not match `.mts` | unchanged |
| DEAD-24 — must survive regardless | `scripts/migrate-chat-titles.ts`, `scripts/seed-prompt.ts` | still true; `seed-prompt` is wired at `package.json:20`, `migrate-chat-titles` is not wired anywhere |

**Cross-pass observations** (not dead-code findings; flagged for whichever pass
owns them):

- `docs/roadmap.md`'s OQ-1 note asserts *"severity chips and error states lost
  their colour in the audit (SPEC-44)"*. They did not:
  `src/components/design/ClassificationChip.tsx:13-18` still paints severity
  `text-overdue`/`text-attention`, and `src/components/design/StateBlock.tsx:32`
  still paints a load error `text-overdue`. SPEC-44 is open, and the roadmap
  records it as closed.
- `src/app/incidents/page.tsx:223` and
  `src/components/design/AuthorityChip.tsx:25` and `SourceLadder.tsx:73` use
  `uppercase` outside `.eyebrow` — SPEC-45, still open.

---

# Verified clean, so it is not re-checked

- **Generated Prisma output is not committed.** `git ls-files src/generated | wc -l`
  → 0; `.gitignore:48` has `src/generated/`; `eslint.config.mjs:25` ignores it;
  `prisma/schema.prisma:6` sets the custom `output` deliberately. Nothing imports
  `@prisma/client` *instead of* the generated client, so there is no split-client
  hazard — the reverse: nothing imports `@prisma/client` at all (DEAD-92).
- **No build artifact is tracked.** `git ls-files` matched against
  `.next|tsbuildinfo|playwright-report|test-results|\.DS_Store|\.env$` returns
  nothing. On disk: `.next/` (168 MB, containing a stale copy of `docs/` and
  `README.md` under `.next/standalone/` — harmless, but it pollutes
  repo-wide greps, so scope greps to tracked files), `tsconfig.tsbuildinfo`
  (168 KB), `playwright-report/` (576 KB), `test-results/` (16 KB),
  `uploads/` (9.9 MB), `data/`, `.DS_Store`. **Every one is covered by
  `.gitignore`** — `.next/` `:8`, `*.tsbuildinfo` `:11`, `data/` `:21`,
  `uploads/` `:26`, `.DS_Store` `:35`, `test-results/` `:43`,
  `playwright-report/` `:44`, `.env` `:14`. `git status --porcelain` shows only
  one untracked file, this cycle's own findings doc.
- **Every other declared dependency is imported.** Checked by grep across
  tracked source: `@anthropic-ai/sdk`, `@radix-ui/react-slot`
  (`components/ui/button.tsx:2` — the DEAD-19 phantom is still correctly
  declared), `bcryptjs`, `chromadb`, `class-variance-authority`, `clsx`,
  `lucide-react`, `mammoth` (dynamic import, `documentProcessor.ts:49`),
  `next-auth`, `openai`, `pdf-parse` (subpath), `pino`, `pino-pretty`,
  `react-hot-toast`, `react-markdown`, `remark-gfm`, `tailwind-merge`, `zod`,
  `tailwindcss` (`theme.css:15`), `dotenv` (dev, scripts only). **No dependency
  is imported without being declared.** The only two exceptions are DEAD-92 and
  DEAD-93.
- **Label maps are already centralised.** `INCIDENT_TYPE_LABELS`,
  `CATEGORY_LABELS` and `JURISDICTION_LABELS` all live in
  `src/types/index.ts:39,171,130` and every consumer imports them — no inline
  copy exists (`grep -rn "'Bullying'\|'Title IX'" src` returns only the two maps
  themselves). This closes DEAD-13 and DEAD-32 as duplications; DEAD-86 is the
  one remaining label-adjacent duplication, and it is about tone, not text.
- **`.list-row` is not dead CSS.** It looked unused; it is used at
  `src/app/admin/prompt/page.tsx:232`. Every other class in
  `src/app/theme.css` has at least one consumer, verified class by class
  (`card`, `btn-primary|secondary|ghost`, `field`, `field-textarea`, `badge`,
  `navbar*`, `heading-xl|lg|md`, `label-sm`, `body-text`, `caption`, `tabular`,
  `eyebrow`). No unused token or class in `theme.css`.
- **The two summary endpoints are genuinely thin now.** Both
  `src/app/api/chat/summary/route.ts:33` and
  `src/app/api/incidents/[id]/summary/route.ts:31` call
  `generateIncidentSummary`, and both have live callers
  (`src/app/chat/page.tsx:232`; `src/app/incidents/[id]/page.tsx:104` plus
  `e2e/incident-management.spec.ts:323,351,360,363`). DEAD-12 is closed.
- **The obligation-provenance subsystem is live, not dead.**
  `resolveProvenance` is called at `src/app/api/chat/route.ts:311` and its result
  spread into the row at `:313-321` (`...provenance` at `:320`); the `deadlineSource: 'model'` at `:335` is
  the documented fallback branch, not a bypass.
- **The four thin `/incidents/*` routes are deliberate.**
  `active`, `closed`, `pending` and `new` are each a 10-line `redirect()` with a
  comment explaining the collapse (design 1j). This is what remains of DEAD-8,
  DEAD-10 and DEAD-31, and it is correct.
- **No `TODO`/`FIXME`/`XXX`/`HACK` anywhere** in `src`, `e2e`, `scripts`,
  `middleware.ts` or `prisma/`. Two `in production, use…` notes survive
  (`src/app/api/chat/route.ts:342`, `src/lib/utils/documentProcessor.ts:163`);
  the second is DEAD-83's dead implementation.
- **No commented-out code blocks** beyond two deliberate, annotated cases: the
  recovered payload template in `scripts/batch-upload-policies.ts:56-...`
  (retained per DEAD-23) and the `getDefaultClassification` removal note at
  `src/lib/ai/classifier.ts:122-128`, which explains why the code is *absent*.
