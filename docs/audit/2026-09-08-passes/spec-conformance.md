# Audit pass: SPEC CONFORMANCE

Branch `audit/2026-09-08` (cut from dev at 7565f5a). Read-only; no source
changed, no script run against a database. `npx eslint src scripts e2e` was run
(0 errors, 3 pre-existing unused-var warnings in `scripts/`).

Sources of truth read in precedence order: `CLAUDE.md`, `docs/roadmap.md`,
`docs/audit/2026-09-01-findings.md`, `docs/audit/2026-09-01-work-completed.md`,
`docs/audit/2026-08-31-*`, `README.md`, `POLICY_MAPPING.md`,
`QUICK_START_POLICY_UPLOAD.md`, `docs/audit/2026-09-01-ux-redesign.md`.

Findings continue from SPEC-50. Prior findings that are still open and are
**not** renumbered here (verified as unchanged rather than re-filed): SPEC-45
(five uppercase sites outside `.eyebrow`), SPEC-47 (one `eslint-disable`,
`no-explicit-any` off project-wide), SPEC-48 (`PATCH /api/obligations/[id]` can
un-complete an obligation), SPEC-49 (no audit row on reading a conversation),
FLOW-43 (a 503/429 renders as the assistant speaking, `src/app/chat/page.tsx:197-205`),
FLOW-45 (see SPEC-57 — the OQ-3 decision changed what it costs), FLOW-47,
DOC drift (`POLICY_MAPPING.md:152`, `QUICK_START_POLICY_UPLOAD.md:241` still
list the deactivated synthetic `DISC-001` as loaded).

---

### SPEC-51 — an unverified obligation that is due today or already late is rendered nowhere on the home queue

- **Severity:** blocker
- **Location:** `src/app/page.tsx:65-78` (the four filters), rendered by
  `src/app/page.tsx:153-159`
- **Requirement:** `docs/roadmap.md` (OQ-5): *"Suppressing the obligation is the
  worst option: 'you must report this to DCYF' is worth saying even when the
  library cannot cite a deadline, and *nothing* is how a mandated report gets
  missed."* and *"Unverified obligations are still listed, and still say they
  need confirming."* The code's own comment at `src/app/page.tsx:67-71` repeats
  the promise: *"Those obligations are still listed below."*
- **Finding:** the queue is built from three mutually exclusive groups:

  ```
  65  const open = obligations.filter(o => o.status !== 'completed');
  72  const verified = open.filter(o => o.deadlineSource !== 'model');
  74  const overdue = verified.filter(o => due(o) !== null && due(o)! < now);
  75  const today   = verified.filter(o => due(o) !== null && due(o)! >= now && due(o)! <= endOfToday.getTime());
  78  const later   = open.filter(o => due(o) === null || due(o)! > endOfToday.getTime());
  ```

  `overdue` and `today` are drawn from `verified`; `later` requires
  `dueDate === null` or `dueDate > endOfToday`. A `deadlineSource === 'model'`
  obligation whose due date is in the past, or later today, satisfies none of
  the three predicates, so it appears in no `Group` and is not rendered at all —
  it also cannot be discharged, because `Mark done` only exists on a rendered
  row. The subhead does say *"One obligation has a deadline no loaded policy
  states"* (line 91), but the obligation itself is invisible.

  This is the common case, not an edge: `deadlineSource` defaults to `"model"`
  in `prisma/schema.prisma:149`, so every `ComplianceAction` row written before
  the OQ-5 change, and every one whose attribution fails to resolve, is
  `model`-sourced — and with the pilot library at two loaded policies that is
  most of them. The e2e fixture demonstrates it: `e2e/support/seed.ts:190-196`
  seeds *"Notify the parents of both students"* at `now - 3h` with no
  `deadlineSource`, and that row is absent from `/`. No test covers the
  `Overdue` group (no e2e file references it), which is why this survives a
  green suite.
- **Proposed fix:** make the groups exhaustive over `open`. Keep the
  colour/count rule (SPEC-52) separate from placement: partition on the deadline
  instant for *placement* and on `deadlineSource` for *colour and tally*. e.g.
  `overdue = open.filter(past)`, `today = open.filter(dueToday)`,
  `later = open.filter(rest)`, and pass `verified` down to `DeadlineClock` (it
  already does) while the group `tone` and the `Tally` values keep counting only
  policy-backed rows. Add an e2e assertion that the seeded overdue obligation is
  visible on `/` and that its row carries the "Deadline not found in the loaded
  policy" note — a test that fails today.

---

### SPEC-52 — OQ-5's "no red or amber for a model-sourced deadline" is honoured only in `DeadlineClock`

- **Severity:** major
- **Location:**
  - `src/app/incidents/page.tsx:182-184, 198` — list row countdown
  - `src/app/incidents/[id]/page.tsx:182, 233-237` — the "N overdue" badge
  - `src/app/incidents/[id]/page.tsx:380` — `StampBar` "Obligations" stamp tone
  - `src/app/incidents/[id]/page.tsx:406-413, 440-445` — timeline dot and meta
- **Requirement:** `docs/roadmap.md` (OQ-5): *"**A model-sourced deadline gets
  no red or amber countdown**, and the home page's 'N things are late' counts
  only policy-backed ones. That headline is currently built on the model's
  recall of NH law, and it is the number in the product that most looks like
  fact."* And `CLAUDE.md`: *"Colour is earned. It means a deadline state —
  overdue (red), attention (amber), met (green)."*
- **Finding:** `DeadlineClock` takes a `verified` prop and falls back to
  `text-text-tertiary` (`src/components/design/DeadlineClock.tsx:38`), and
  `ObligationRow` passes it (`ObligationRow.tsx:64`). Every other surface that
  renders a deadline calls `describeDeadline` / `DEADLINE_COLOR` directly with
  no provenance input:

  - `src/app/incidents/page.tsx:198` paints the soonest deadline
    `DEADLINE_COLOR[deadline.state]` — red "3h late" for a deadline the model
    recalled. The page's `Action` interface (`:29-36`) does not even carry
    `deadlineSource`.
  - `src/app/incidents/[id]/page.tsx:182` computes `overdue` from *all* open
    actions and `:233-237` renders "{n} overdue" in `text-overdue` inside a
    red-bordered pill; `:380` tints the `Obligations` stamp red from the same
    number. This is the same headline-count-of-lateness that OQ-5 explicitly
    restricted on the home page, on a different page.
  - `:411-412` maps `upcoming → bg-attention` and `:440-445` prints
    `info.label` in `DEADLINE_COLOR.overdue` / `.attention`. Note this rung is
    doubly wrong: it is amber for *any* non-overdue, non-completed obligation
    regardless of what `describeDeadline` returned — the second half of the
    still-open SPEC-44.

  So the same incident shows a grey, hedged countdown in the right-hand
  obligation list and a red "3h late" pill in its own header, from the same row.
- **Proposed fix:** thread `deadlineSource` through the two page-level
  `Action`/`Incident` interfaces (both endpoints already return it: see
  `src/app/api/obligations/route.ts:52` and the raw `complianceActions` include
  in `src/app/api/incidents/[id]/route.ts:47-49`) and gate every red/amber
  class on `deadlineSource !== 'model'`, exactly as `DeadlineClock` does.
  Filter `overdue` at `src/app/incidents/[id]/page.tsx:182` the way
  `src/app/page.tsx:72` filters. Better still, move the decision into one
  helper next to `DEADLINE_COLOR` in `src/lib/deadline.ts` so there is one
  place that knows the rule, and give it a unit test.

---

### SPEC-53 — `claudeService.classifyIncident` still returns a fabricated "safe default", so FLOW-35 is only half fixed

- **Severity:** major
- **Location:** `src/lib/ai/claude-service.ts:516-545` (catch at `:525`,
  default object at `:534-544`)
- **Requirement:** `docs/roadmap.md`: *"`FLOW-35` was fixed alongside it: a
  failed classification now throws rather than returning a default, so
  `incidentType` stays null and the next turn retries. The old default (`other`
  / `low` / no obligations) was written permanently, so an API timeout and a
  genuine 'we could not tell' produced the same record — on the incident where
  the system knew least."* `src/lib/ai/classifier.ts:122-128` states the same
  intent: *"Kept out rather than left unused, because a plausible-looking safe
  default is exactly what someone would re-wire."*
- **Finding:** the throw was added one layer too high.
  `IncidentClassifier.classifyIncident` (`src/lib/ai/classifier.ts:72-85`)
  converts anything thrown into `ClassificationUnavailableError`, and
  `getDefaultClassification` was correctly deleted. But the *inner* call still
  swallows: in `claude-service.ts` the model call at `:506-514` sits outside the
  `try`, and the `try` at `:516` wraps only
  `classificationSchema.parse(JSON.parse(extractJsonObject(...)))`. Its catch
  returns

  ```
  534  type: 'other',
  535  severity: 'medium',
  536  reasoning: 'Unable to automatically classify. Manual review required.',
  538  requiredActions: [
  539    { description: 'Review incident details', dueInHours: 24 },
  540    { description: 'Contact administrator', dueInHours: 24 },
  541  ],
  ```

  So a malformed or schema-invalid model response — the exact case the zod
  schema was introduced for (SEC-9) — never reaches the classifier's catch. The
  route writes `incidentType: 'other'`, `severity: 'medium'` permanently
  (`src/app/api/chat/route.ts:156-168`, guarded by `if (!incident.incidentType)`
  at `:141`, so there is no retry and no endpoint to correct it), and
  `createObligations` writes two invented 24-hour obligations from
  `classification.requiredActions` whenever the second pass returns nothing
  (`route.ts:327-338`). Only an *upstream* failure (timeout, 4xx/5xx, empty
  text) behaves as FLOW-35 describes.

  Mitigating: those fallback rows are stamped `deadlineSource: 'model'`
  (`route.ts:335`), so they do not currently get red/amber via `DeadlineClock`
  — though see SPEC-52 for the surfaces where they do, and SPEC-51 for where
  they vanish.
- **Proposed fix:** delete the default and let the parse failure throw. Replace
  `claude-service.ts:533-544` with a rethrow (`throw new Error('classification
  response could not be parsed')` after the existing `logError`), keeping the
  `rawResponse` log line. `IncidentClassifier` then wraps it in
  `ClassificationUnavailableError` and the existing FLOW-35 path in the chat
  route takes over unchanged. Add a unit test that a non-JSON and a
  schema-invalid response both throw.

---

### SPEC-54 — the SPEC-44 colour violations are still present, although the roadmap records them as repainted

- **Severity:** major
- **Location:**
  - `src/components/design/ClassificationChip.tsx:13-18` and `:37-41` — severity
  - `src/components/design/StateBlock.tsx:30-33` — error state
  - `src/app/incidents/[id]/page.tsx:411-412, 443-445` — see SPEC-52
  - `src/app/admin/policies/page.tsx:262-270` — a *new* site
- **Requirement:** `CLAUDE.md`: *"Colour is earned. It means a deadline state —
  overdue (red), attention (amber), met (green) — or a coverage gap (amber).
  Nothing else. No brand accent, and never severity, error states or
  decoration: those would compete with the only signal the UI is allowed to
  raise its voice with."* `docs/roadmap.md` (OQ-1) asserts this was acted on:
  *"The rule still bites, which is why severity chips and error states lost
  their colour in the audit (SPEC-44)."*
- **Finding:** they did not lose their colour.
  `docs/audit/2026-09-01-work-completed.md` never claims SPEC-44 was fixed (it
  is absent from the fix list), and the code confirms it:

  ```
  ClassificationChip.tsx:13  const SEVERITY_TONE: Record<string, string> = {
                        14    critical: 'text-overdue',
                        15    high: 'text-overdue',
                        16    medium: 'text-attention',
                        17    low: 'text-text-tertiary',
                        18  };
  ```

  rendered at `:37-41` next to the classification — severity in red and amber,
  the one thing `CLAUDE.md` names explicitly. `StateBlock.tsx:32` renders an
  error title in `text-overdue`; every page's load-failure surface uses it
  (`src/app/page.tsx:143`, `src/app/incidents/page.tsx:146`,
  `src/app/incidents/[id]/page.tsx:162-176`, `src/app/policies/page.tsx`).

  A site the prior audit did not list has been added since:
  `src/app/admin/policies/page.tsx:262-270` renders a policy's `isActive` flag
  as a badge with `background: 'var(--color-met)'` — green, the "obligation
  discharged and recorded" token, used as a status decoration.
- **Proposed fix:** either repaint or amend the rule, but make the roadmap and
  the code agree. Repainting is the smaller change and matches the rule as
  written: drop `SEVERITY_TONE` and render severity in `text-text-tertiary`
  (the label already reads *"{severity} severity"*, which carries the meaning);
  give `StateBlock`'s error variant `text-text` and rely on `role="alert"` plus
  the copy; give the admin "Active" badge the neutral `.badge` treatment. If
  OQ-1's widening was meant to cover error states too, say so in `CLAUDE.md`
  the way the coverage-gap paragraph does, and drop the SPEC-44 sentence from
  the roadmap.

---

### SPEC-55 — two of the declared test contracts are asserted by no test

- **Severity:** minor
- **Location:** `src/app/chat/page.tsx:690` (`data-testid="chat-send"`);
  `src/app/incidents/[id]/page.tsx:269` (`Generate Summary`)
- **Requirement:** `CLAUDE.md`, *Test contracts*: *"These are **asserted by the
  suite**; move them deliberately and update the tests in the same commit:
  `data-testid="chat-input" | chat-send | chat-loading | chat-sources |
  obligation-queue`, … and the button names `Close Incident` / `Reopen
  Incident` / `Generate Summary` / `Sign in` / `Sign out` / `Mark done`."*
- **Finding:** both exist in the source, and neither is referenced anywhere
  under `e2e/`. `chat-send` is present on the button but every test reaches it
  by `getByRole('button', { name: 'Send message' })`; a grep of `e2e/` for
  `chat-send` returns nothing. `Generate Summary` is never clicked or asserted —
  the summary tests (`e2e/incident-management.spec.ts:307-364`) go straight to
  `POST /api/incidents/[id]/summary` via `page.request`, so the button that is
  the only user-facing way to reach that endpoint could be renamed or removed
  with a green suite. Every other listed contract *is* asserted (see *What
  holds*).
- **Proposed fix:** either assert them or stop calling them contracts. Assert:
  in `e2e/chat-flow.spec.ts` use `page.getByTestId('chat-send')` for at least
  one send (it also pins the testid to the same element as the aria-label), and
  add an incident-page test that clicks `Generate Summary` and asserts the
  summary renders — that also closes the gap where the UI path to summaries is
  entirely untested.

---

### SPEC-56 — `AuthorityChip` on an obligation can never render, because no endpoint supplies `jurisdiction`

- **Severity:** minor
- **Location:** `src/components/design/ObligationRow.tsx:16, 86-93`;
  `src/app/api/obligations/route.ts:42-54`; `prisma/schema.prisma:135-152`
- **Requirement:** `docs/roadmap.md` step 7 (*"done 2026-09-02, by OQ-5"*):
  *"`ObligationRow` renders the `AuthorityChip` and the citation, which it could
  always do — the data had simply never existed."* And `CLAUDE.md`: *"**Authority
  is carried by brightness**, federal brightest to school dimmest,
  consistently."*
- **Finding:** the citation half landed; the authority half did not.
  `ComplianceAction` gained `policyId`, `citation` and `deadlineSource`
  (`schema.prisma:149-152`) but no jurisdiction, and
  `GET /api/obligations` projects only `deadlineSource` and `citation`
  (`route.ts:52-53`) — it never joins through `policy` to read `jurisdiction`.
  `GET /api/incidents/[id]` returns the raw rows, which likewise have no
  jurisdiction. So `obligation.jurisdiction` is `undefined` at every call site
  and `ObligationRow.tsx:88` never renders. An administrator sees the provision
  text but not which level of authority imposes it — which is the one thing the
  brightness scale exists to convey.
- **Proposed fix:** in `src/app/api/obligations/route.ts` add
  `policy: { select: { jurisdiction: true } }` to the `include` and map
  `jurisdiction: action.policy?.jurisdiction` into the response; do the same in
  the `complianceActions` include in `src/app/api/incidents/[id]/route.ts` (or
  project it explicitly). Extend the OQ-5 e2e test at
  `e2e/incident-management.spec.ts:201-249` to assert a backed obligation
  carries a jurisdiction, alongside its existing citation assertion.

---

### SPEC-57 — `abuse_neglect` is never recorded as CONFIDENTIAL on the turn it is classified

- **Severity:** minor
- **Location:** `src/app/api/chat/route.ts:123` (call site), `:141-168`
  (classification, after it), `:341-366` (`determineDataSensitivity`)
- **Requirement:** `docs/roadmap.md` (OQ-3, decided and shipped):
  *"`abuse_neglect` is now a first-class incident type, mapped narrowly to
  `mandatory_reporting`, and **treated as CONFIDENTIAL**."*
- **Finding:** `determineDataSensitivity(message, incident)` is called at
  `:123`, before classification runs at `:141`, on the `incident` row as it was
  read (or created) earlier in the request. Its type branch reads
  `incident.incidentType` (`:357-361`), which is still `null` on that turn — and
  that turn is the *only* one where classification happens, because `:141` gates
  on `!incident.incidentType`. So the message that discloses the abuse is
  stamped `INTERNAL` unless it happens to contain one of the keyword strings at
  `:343-346`; later turns are classified but no longer carry the disclosure.
  This is the prior FLOW-45 finding, refiled because OQ-3's decision raised what
  it costs: the highest-stakes report the tool handles is the one whose
  sensitivity label is wrong.
- **Proposed fix:** move the call below the classification block and pass the
  classified values, e.g. compute it after `:185` from
  `classification?.type ?? incident.incidentType` and
  `classification?.severity ?? incident.severity` — the same fallback pair the
  retrieval call at `:201-202` already uses. Add a unit test that an
  `abuse_neglect` classification yields `CONFIDENTIAL`.

---

### SPEC-58 — `LLMService` carries a fourth guidance prompt with no core directives and no retrieval guard

- **Severity:** minor
- **Location:** `src/lib/ai/llm-service.ts:130-153` (`getDefaultSystemPrompt`),
  used by `:32-76` (`generateResponse`) and `:158-188` (`streamResponse`)
- **Requirement:** `docs/roadmap.md` (OQ-4): *"`CORE_DIRECTIVES` lives in code
  and is **prepended to every guidance call**: answer only from the supplied
  excerpts, never invent a code or a deadline … The retrieval and coverage
  guards stay last."* And `CLAUDE.md`: *"Never assert policy the system did not
  retrieve. If retrieval returns nothing, the prompt gets an explicit
  instruction not to cite policy codes or state district deadlines. Don't
  remove that guard."*
- **Finding:** `generateResponse` and `streamResponse` build their system prompt
  as `getDefaultSystemPrompt()` plus a bare `"\n\nRelevant Policy Context:\n" +
  policyContext` (`:50-52`, `:173-175`). They never touch `buildSystemPrompt`,
  so they get neither `CORE_DIRECTIVES` nor `NO_POLICY_RETRIEVED_GUARD`, and the
  prompt they do use instructs the model to *"Cite specific policies when
  possible"* and *"Highlight legal requirements and deadlines"* (`:145-146`) —
  the precise SPEC-3/B4 failure mode: an instruction to cite, with an empty
  context and no guard. `generateResponse` additionally swallows any error and
  returns apology text as content (`:67-75`), the FLOW-7 pattern that
  `generateSchoolComplianceResponse` was changed to throw on (`:114-124`).

  Both are currently unreached: a grep of `src/` shows only
  `generateSchoolComplianceResponse` is called (`src/app/api/chat/route.ts:213`);
  the other two are referenced from `scripts/test-phase3.ts` only. So there is
  no live defect — but this is the same hazard `src/lib/ai/classifier.ts:122-128`
  argues against for `getDefaultClassification`: *"a plausible-looking safe
  default is exactly what someone would re-wire."*
- **Proposed fix:** delete `generateResponse`, `streamResponse` and
  `getDefaultSystemPrompt` from `LLMService` (and `claudeService.streamResponse`
  if nothing else needs it), leaving `generateSchoolComplianceResponse` as the
  single guidance entry point. If a streaming path is wanted later, build its
  prompt through `buildSystemPrompt` so the guards cannot be omitted.

---

## Open questions

**OQ-6 — does the "no red or amber for a model-sourced deadline" rule apply to
every surface, or only the home page?** OQ-5 in `docs/roadmap.md` names two
things specifically: the countdown, and *"the home page's 'N things are late'"*.
The incident detail page has its own count-of-lateness (`{n} overdue`,
`src/app/incidents/[id]/page.tsx:233-237`) and its own tinted stamp (`:380`),
and the incidents list has its own countdown (`src/app/incidents/page.tsx:198`).
SPEC-52 assumes the rule is about the *class* of signal and so covers all of
them, but the decision as written could be read as scoped to the home headline.
A per-surface reading would need saying, because it would mean the same row
reads two different ways on two pages.

**OQ-7 — where does an unverified obligation whose model deadline has already
passed belong in the home queue?** OQ-5 requires it to be listed and to keep its
urgency, but forbids the red "Overdue" treatment. The three current groups are
*Overdue / Due today / Later*, all of which are deadline-state labels, so there
is no group whose heading is honest for such a row. Options: put it in the
time-correct group with neutral tone (SPEC-52's fix makes this consistent), give
it a fourth *"Unconfirmed deadlines"* group, or sort it into *Later* regardless
of its date. These are different products, so it is recorded rather than
guessed — but note the status quo (rendered nowhere) is not one of the options.

**OQ-8 — how many policy categories are there?** `CLAUDE.md`'s data-model
paragraph says a `Policy` has *"a **category** (what it covers, 20 values)"*.
`POLICY_CATEGORIES` in `src/types/index.ts:141-163` has 21 entries — 20 subject
categories plus `other`. Whether `other` was meant to be counted is not
recoverable from the text, and `POLICY_MAPPING.md` groups exactly 20 subjects.
Trivial in effect, but it is the kind of number that gets asserted in a test.

---

## What holds

Verified as passing, so the audit record shows coverage.

**Invariants**

- **Identity from the session, never the request.** Every handler under
  `src/app/api/` opens with `requireUser()` / `requireRole()` from
  `src/lib/session.ts`; no handler reads a user id from a body or query string.
  `src/app/api/chat/route.ts:34, 49` takes only `message` and `incidentId` from
  the body; `src/app/api/chat/history/route.ts:14-17` uses
  `guard.user.id` unconditionally. Every handler re-checks even where
  `middleware.ts` also gates (`src/app/api/admin/policies/[id]/route.ts:18-21`).
  `src/app/api/incidents/route.ts:54` lets `?reporterId` narrow but never widen,
  gated on `canReadAllIncidents`.
- **Every by-id lookup scoped, 404 not 403.** `incidentScope(user)` is applied
  in `src/app/api/incidents/[id]/route.ts:32` (GET) and `:110` (PATCH, before
  the write), `src/app/api/chat/route.ts:55`,
  `src/app/api/chat/[incidentId]/route.ts:19`,
  `src/app/api/obligations/route.ts:29`,
  `src/app/api/obligations/[id]/route.ts:38` (before the update),
  `src/app/api/attachments/upload/route.ts:51`, and
  `src/lib/ai/incident-summary.ts:37`. All return `notFoundError` /
  404 on a miss. `src/app/api/attachments/[id]/route.ts:36-43` checks ownership
  after a `findUnique` and returns 404 with the reason stated in a comment.
- **Never assert policy the system did not retrieve.**
  `src/lib/ai/claude-service.ts:248-280` (`buildSystemPrompt`) branches on
  `policyContext.trim().length === 0` and appends `NO_POLICY_RETRIEVED_GUARD`
  (`:104-111`) last; the summary path gets the same guard
  (`:727-734`), and `deriveObligations` returns nothing at all when there is no
  context (`:614-616`). Pinned by six unit tests in
  `src/lib/ai/system-prompt.test.ts`, including *"keeps the no-retrieval guard
  last when nothing was retrieved"* and *"keeps the core directives when the
  profile tries to countermand them"*.
- **A missing local policy is information.** `assessCoverage`
  (`src/lib/ai/rag.ts:505-532`) queries the library rather than the results and
  requires `chunks: { some: {} }` (`:514`); `buildCoverageNote`
  (`claude-service.ts:119-139`) distinguishes "no local policy" from "nothing at
  any level"; `CoverageGapCard` and `LibraryScopeNote` render both cases
  (`src/app/chat/page.tsx:544-560`). Asserted by
  `e2e/chat-flow.spec.ts:180-232, 256-300`, including the chunkless-policy case
  that would cancel the gap if the predicate were dropped.
- **Attachments are student records.** `public/` holds only logos and svgs.
  Uploads go to `attachmentUploadsDir()` = `resolve(UPLOADS_DIR, 'attachments')`
  (`src/lib/uploads.ts:211-213`), outside the served tree; the row stores a
  server-generated basename only (`src/app/api/attachments/upload/route.ts:77-90`);
  reads go solely through `GET /api/attachments/[id]`, which re-checks session
  and ownership, asserts path containment (`:50`), and sends
  `application/octet-stream` + `nosniff` + `private, no-store` (`:64-72`). The
  middleware matcher deliberately does not exclude `/uploads`
  (`middleware.ts:66-70`). The only client-side link is
  `src/app/incidents/[id]/page.tsx:450`, which points at the API route.
- **Time-derived text guarded by `useMounted()`.** `DeadlineClock.tsx:36, 44, 46`;
  `src/app/page.tsx:29, 116`; `src/app/incidents/page.tsx:173, 199, 209`;
  `src/app/incidents/[id]/page.tsx:78, 253, 363-389, 416, 431`;
  `src/app/policies/page.tsx:49, 154`. The unguarded
  `toLocaleDateString` at `src/app/admin/policies/page.tsx:282` is safe in
  practice — that page fetches in `useEffect` (`:67-69`), so the server render
  has no rows to format.

**Design rules**

- Tokens live in `src/app/theme.css`; there is no `globals.css` anywhere in the
  repo, and the file opens with the account of why it was deleted (`:1-14`).
  Tailwind is imported and the bespoke component set is inside
  `@layer components` (`:89`), which is what the CLAUDE.md "prefer fixing the
  cause" note is about.
- **Three fonts, three jobs.** `src/app/layout.tsx:10-27` loads exactly
  DM Sans, DM Serif Display and JetBrains Mono; `theme.css:34-37` maps them to
  `--font-sans` / `--font-display` / `--font-mono`, and `.tabular`
  (`theme.css:60-63`) sets `font-variant-numeric: tabular-nums`. `.tabular` is
  used for every countdown, count and id I checked.
- **Authority by brightness, not colour.** `AuthorityChip.tsx:11-16` and
  `SourceLadder.tsx:21-26` both grade federal → school from `text-text` down to
  `text-text-muted` with no hue, and `SourceLadder` indents each rung one step
  further (`:19`). `theme.css:29-32` documents one statutory meaning per state
  colour.
- Colour-for-coverage-gap (amber) is used only in `CoverageGapCard.tsx:41, 50`
  and `LibraryScopeNote.tsx:30`, which OQ-1 permits. Exceptions to the wider
  rule are SPEC-52 and SPEC-54 above.

**Test contracts** — all present in source and asserted by a test, except the
two in SPEC-55: `chat-input` (`chat/page.tsx:661`, asserted
`e2e/navigation.spec.ts:12` +9 more), `chat-loading` (`:568`,
`e2e/chat-flow.spec.ts:63-65`), `chat-sources` (`:528`,
`e2e/chat-flow.spec.ts:135-160, 277`), `obligation-queue`
(`src/app/page.tsx:154`, `e2e/incident-management.spec.ts:160-171`),
`aria-label="Send message"` (`:692`, asserted throughout),
`nav[aria-label="Main"]` (`Navbar.tsx:27`, `e2e/navigation.spec.ts:22, 35`,
`smoke.spec.ts:24`, `admin.smoke.spec.ts:15, 30`), the `Incidents` `<h1>`
(`src/app/incidents/page.tsx:115-117`, `e2e/navigation.spec.ts:16`,
`incident-management.spec.ts:30`, `mobile.spec.ts:33`), `Close Incident` /
`Reopen Incident` (`incidents/[id]/page.tsx:277`,
`e2e/incident-management.spec.ts:92, 103`), `Sign in`
(`login/page.tsx:104`, `e2e/auth.setup.ts:15`), `Sign out`
(`Navbar.tsx:117`, `e2e/navigation.spec.ts:138`), `Mark done`
(`ObligationRow.tsx:103`, `e2e/incident-management.spec.ts:171`).

**Conventions**

- No `expect(locator).toBeTruthy()`: every `toBeTruthy()` in the repo is on a
  plain value, not a Locator — `e2e/chat-flow.spec.ts:44, 77` (ids),
  `e2e/incident-management.spec.ts:77, 89, 236, 335` (objects and a citation
  string), `src/lib/policy-coverage.test.ts:36` (a found row).
- No `if (await x.count() > 0)` anywhere; `e2e/incident-management.spec.ts:15`
  records why.
- No `@ts-ignore` or `@ts-expect-error` in `src`, `scripts`, `e2e` or
  `middleware.ts`. No `.skip(` / `.only(`. `npx eslint src scripts e2e` is
  clean (0 errors). The one remaining `eslint-disable`
  (`src/app/admin/prompt/page.tsx:33`) and the ~16 `any`s are the still-open
  SPEC-47, not new.

**Data model vs code** — `prisma/schema.prisma` matches the CLAUDE.md paragraph:
`Policy.jurisdiction` (`:181`) and `Policy.category` (`:185`) are orthogonal
with the four/twenty-one vocabularies in `src/types/index.ts:127, 141`;
retrieval filters on category across all jurisdictions
(`rag.ts:326-338`, grouped by `POLICY_JURISDICTIONS` at `:426`);
`mandatory_reporting` is guaranteed via `ALWAYS_RETRIEVED_CATEGORY` /
`guaranteedCategoriesFor` (`types/index.ts:223, 249-255`) and
`ensureCategoryRepresentation` (`rag.ts:364-404`), the OQ-3 "guarantee reading";
`ComplianceAction` rows are the obligations, created at classification-time
(`chat/route.ts:209-210`); `Mark done` is the only mutation the UI offers
(`ObligationRow.tsx:96-105`) — the endpoint's wider enum is the open SPEC-48.

**Roadmap claimed-done items verified true**

- **OQ-2 — canonical ingestion.** `POST /api/policies` is gone;
  `src/app/api/policies/route.ts:56-62` records why in place of the handler.
  `QUICK_START_POLICY_UPLOAD.md:62-65` documents the removal, so the promised
  doc change landed. `uploadsRoot()` / `policyUploadsDir()` /
  `attachmentUploadsDir()` (`src/lib/uploads.ts:201-213`) use `resolve`, and are
  the only expressions used at all six call sites. `GET /api/policies` projects
  six fields and no longer returns `content` or `filePath` (`:35-42`, SEC-27).
- **OQ-4 — inverted prompt.** `CORE_DIRECTIVES` (`claude-service.ts:152-163`) is
  prepended and the editable row supplies only the advisor profile
  (`:326-338, 431`); order is core → profile → excerpts → guards
  (`buildSystemPrompt`, `:248-280`). The UI is titled "Advisor Profile" and
  states what is fixed in code and that classification and summaries use their
  own prompts (`src/app/admin/prompt/page.tsx:197, 205-218`). Six unit tests
  pin it.
- **OQ-5 — schema and second pass.** `ComplianceAction.policyId` / `citation` /
  `deadlineSource` exist (`schema.prisma:149-152`) with migration
  `20260902090000_add_obligation_provenance`. Obligations are derived after
  retrieval (`chat/route.ts:207-210, 300-339`) with the excerpts in hand, and
  `resolveProvenance` (`src/lib/obligation-provenance.ts:30-45`) checks the
  model's excerpt number against the references `buildJurisdictionContext`
  actually numbered (`rag.ts:441`), degrading to unverified on anything that
  fails to resolve. `GET /api/obligations` counts only policy-backed rows in
  `overdue`/`today`/`week` and reports `unverified` separately (`:69-89`), and
  the home headline does the same (`src/app/page.tsx:72-92`). `DeadlineClock`
  withholds red/amber from unverified rows (`:27-38`) and `ObligationRow` says
  so in words (`:80-84`). Asserted by `e2e/incident-management.spec.ts:201-260`.
  Exceptions are SPEC-51 and SPEC-52.
- **Rate limiting (SEC-11/SEC-23).** Sign-in by client address in
  `middleware.ts:33-55` with a leak-free 429 and `Retry-After`; chat
  (`chat/route.ts:32-33`), both summary endpoints
  (`chat/summary/route.ts:23-24`, `incidents/[id]/summary/route.ts:27-28`) and
  uploads (`attachments/upload/route.ts:32-33`) by user id via
  `enforceRateLimit` (`src/lib/errors.ts:306-316`). `src/lib/rate-limit.ts`
  imports nothing, as its header explains, and evicts expired windows
  (`:46-64`). The one-replica caveat is documented in both the module and the
  roadmap.
- **Upload memory bound (SEC-10).** `readCappedFormData`
  (`src/lib/uploads.ts:95-136`) checks Content-Length first, then errors a
  counting `TransformStream` past `limit + 64KB`; both upload routes use it and
  neither calls `request.formData()`
  (`attachments/upload/route.ts:38`, `admin/policies/upload/route.ts:43`).
  `assertWithinSizeLimit`'s comment now says what it actually is
  (`:43-51`). Nine unit tests in `src/lib/uploads.test.ts:190-321`, including
  the 12MB-vs-1.2GB equivalence.
- **FLOW-35 partially.** `getDefaultClassification` is deleted and
  `ClassificationUnavailableError` is thrown and handled without stamping the
  incident (`classifier.ts:16-21, 72-85, 122-128`; `chat/route.ts:175-184`).
  The inner swallow is SPEC-53.

**"Deliberately not doing" — no creep found.** No classification confidence is
produced or rendered (`ClassificationChip.tsx:10-11` says why; the only
`confidence` left is the unused `AIResponse` type at `src/types/index.ts:302`,
which nothing writes or reads). No human-readable incident ids, no
cross-incident gap aggregation, no "flag to the district", no
change-classification endpoint, no intake record panel, no week view.
`/incidents/pending` is a redirect preserving the "outstanding compliance
actions" semantics (`src/app/incidents/pending/page.tsx`;
`api/incidents/route.ts:46-50`). Vector search remains behind
`OPENAI_API_KEY` with a category-filtered keyword fallback
(`rag.ts:63-64, 195-209, 216-281`).
