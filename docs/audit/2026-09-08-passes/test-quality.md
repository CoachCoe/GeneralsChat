# Audit pass — test quality and coverage of real behavior

Branch `audit/2026-09-08`. Read-only. `npm run test:unit` run: **151 passed, 11
files, 447ms**. E2E not run (a suite is running elsewhere); every e2e claim below
is from reading the spec, the route and the fixture together.

Findings are numbered from TEST-49. Where a prior finding is still open it is
cited, because "verify prior fixes hold" was part of the brief.

**Counts:** 6 blockers, 9 majors, 6 minors.

## What the suite is not short of

Stated up front so the findings below are read as gaps and not as an indictment.
Every tautological pattern the conventions name is genuinely absent: no
`toBeTruthy()` on a locator, no `count() > 0` guard, no conditional assertion,
no `.skip`/`.only`, no `expect.soft`, no `try/catch` around an assertion, one
`setTimeout` (`e2e/chat-flow.spec.ts:56`) which is a deliberate response stall
so a loading state is observable, not a wait standing in for one. The nine
`toBeTruthy`/`not.toBeNull` hits are all on plain values, not locators, except
one (TEST-64). The stub returns a `thinking` block ahead of the text
(`e2e/support/claude-stub.ts:121-124`) precisely so it is not easier to parse
than the real API, and it throws on an unrecognised prompt rather than
answering as something else. Prior TEST-2/7/8/9/21/23/27/28/32/35/36/40 are
genuinely fixed — see the spot-check.

---

## Blockers

### TEST-49 — The `dueInHours → dueDate` conversion is unpinned: every statutory clock can be wrong by 60× with a green suite

**Severity** blocker
**Location** `src/lib/ai/classifier.ts:58`; `src/app/api/chat/route.ts:318`
**Requirement** The product is deadlines. A confidently wrong statutory deadline
is worse than no answer.
**Finding** Prior **TEST-24**, filed 2026-09-01, is still open and the OQ-5
rewrite gave it a second copy. Both obligation-creation paths compute
`new Date(Date.now() + hours * 60 * 60 * 1000)` and nothing asserts the result.
Change either `* 60 * 60 * 1000` to `* 60 * 1000` — a 24-hour mandatory report
becomes 24 minutes — and the whole suite still passes.
`src/lib/deadline.test.ts` tests the *formatting* of a due date it is handed;
`e2e/incident-management.spec.ts:201-249` reads `deadlineSource` and `citation`
off the created rows and never looks at `dueDate`. The stub supplies
`dueInHours: 24` and `240` (`e2e/support/claude-stub.ts:31-32, 69-74`), so a
60× error moves both obligations from "Later" into "Due today" and changes no
assertion: the queue test only asserts `'Notify the superintendent'` is visible
somewhere in `obligation-queue`.
**Proposed fix** Unit test `dueDateFor(dueInHours, now)` — extract the one
expression into `src/lib/deadline.ts` so both callers share it — pinning
`24 → now + 24h` against a fixed clock, and the boundary `dueInHours: 0.5`.
Then in `e2e/incident-management.spec.ts`, assert on the persisted row: the
obligation whose description is `'Notify the superintendent'` has
`dueDate - createdAt` within a minute of 24 hours. Property: the hour the model
states is the hour the row holds.

### TEST-50 — Nothing in the fixture is ever overdue *and* policy-backed, so the app's only red signal and its headline count are dead in test

**Severity** blocker
**Location** `src/app/api/obligations/route.ts:69,76-85`; `src/app/page.tsx:72-86`;
`e2e/support/seed.ts:188-205`
**Requirement** `docs/roadmap.md` (OQ-5, decided 2026-09-02): *"the home page's
'N things are late' counts only policy-backed ones. That headline is the number
in the product that most looks like fact."*
**Finding** Prior **TEST-31** is still open, and OQ-5 widened it. The two seeded
obligations (`seed.ts:188-205`) take the schema default `deadlineSource: 'model'`,
so the one that is three hours overdue is unverified. Every obligation the chat
path creates is 24h or 240h in the future. Therefore across the entire run
`counts.overdue`, `counts.today`, `counts.week` and the home `overdue` group are
**always zero and always empty**. Consequences, each verified by reading:

- Invert the comparison at `page.tsx:74` and home reads "You're clear." — green.
- Drop `deadlineSource === 'policy'` from the `overdue`/`today`/`week` tallies
  (`obligations/route.ts:76-85`) and a model-recalled deadline is counted as
  fact in the largest number on the page — green. (`counts.unverified` is
  asserted at `incident-management.spec.ts:242-247`, which is why the *other*
  half of the same filter is pinned; the tallies themselves are not.)
- No test ever renders a red or amber `DeadlineClock`, so the colour rule that
  CLAUDE.md calls the interface's only raised voice is unexercised.
**Proposed fix** Seed two more obligations on the reporter's open incident: one
`deadlineSource: 'policy'` with `citation` and `policyId` set to the seeded JICK
policy and `dueDate` three hours in the past, one `'policy'` due in six hours.
Then a test `home counts and colours only policy-backed lateness`: `counts.overdue`
is exactly 1 (not 2 — the model-sourced overdue one must not be counted), the
`<h1>` reads "One thing is late.", the overdue row's clock carries `text-overdue`,
and the model-sourced overdue row's clock does not.

### TEST-51 — An open, overdue, model-sourced obligation is rendered in no group on the home page, and no test asserts the queue is exhaustive

**Severity** blocker
**Location** `src/app/page.tsx:72-78`; `e2e/incident-management.spec.ts:147-178`
**Requirement** OQ-5 as shipped: *"keep the obligation, keep the urgency, mark
the provenance … Those obligations are still listed below, and say on their own
row that they need confirming"* (`src/app/page.tsx:67-71` says the same).
**Finding** The three groups do not partition the open set.
`overdue = verified.filter(due < now)`, `today = verified.filter(now ≤ due ≤ endOfToday)`,
`later = open.filter(due === null || due > endOfToday)`. An obligation that is
open, has a due date in the past, and is model-sourced satisfies none of them, so
it is silently dropped from the queue — the administrator is late on it and the
page does not list it at all. This is not hypothetical: it is exactly the state
of `'Notify the parents of both students'` (`seed.ts:190-196`) on a freshly
seeded database. The suite cannot see it because no test asserts that the queue
contains every open obligation; `incident-management.spec.ts:147-178` asserts
`counts.open` from the API and the visibility of one description, and the API
list is complete even when the render is not.
**Proposed fix** Test `every open obligation appears in the queue`: read
`/api/obligations`, then assert each `description` is visible inside
`obligation-queue`. Property: the union of the rendered groups is the open set.
It fails today and pins the fix (`later` must take from `open` minus `overdue`
minus `today`, or unverified-overdue needs a group of its own).

### TEST-52 — `incidentScope` has a falsifiable test on four of eight scoped lookups; the four with none include the two that disclose a whole transcript

**Severity** blocker
**Location** covered: `src/app/api/incidents/[id]/route.ts:32,110`,
`src/app/api/obligations/[id]/route.ts:38`, `src/lib/ai/incident-summary.ts:37`.
Uncovered: `src/app/api/chat/route.ts:55`,
`src/app/api/chat/[incidentId]/route.ts:19`,
`src/app/api/attachments/upload/route.ts:51`, and the equivalent ownership check
in `src/app/api/attachments/[id]/route.ts:36-43`.
**Requirement** CLAUDE.md: *"Scope every by-id lookup … An out-of-scope row
returns 404, not 403."*
**Finding** The 2026-09-01 fix for TEST-27/TEST-28 holds and holds well —
`seed.ts:222-245` returns real foreign ids through `e2e/.auth/seed.json`, and
`incident-management.spec.ts:118-138, 180-199, 355-365` attempt them, so
deleting `incidentScope` from those handlers now turns the suite red (verified
by reading; see the spot-check). But the fix stopped at the routes the two
findings named. No test ever sends `adminIncidentId` to:
- `POST /api/chat` with `{ incidentId }` — appends to another user's incident
  and feeds its last 20 turns to the model;
- `GET /api/chat/[incidentId]` — returns the **entire** conversation, the most
  disclosive read in the app;
- `POST /api/chat/summary` — the body-parameter twin of the summary route that
  *is* tested, so the pair is half-covered;
- `POST /api/attachments/upload` — attach a student record to a foreign file.
Delete line 55, line 19, or line 51 and nothing fails.
**Proposed fix** One table-driven test `no route accepts another user's incident
id`, iterating `[['post','/api/chat',{message,incidentId}], ['get','/api/chat/'+id],
['post','/api/chat/summary',{incidentId}], ['post','/api/attachments/upload',form]]`
and asserting 404 on each with the request in the failure message. Property: a
foreign id is indistinguishable from a nonexistent one on every by-id route, not
on the four that were audited.

### TEST-53 — Attachments have zero coverage of any kind, against an explicit invariant

**Severity** blocker
**Location** `src/app/api/attachments/[id]/route.ts` (whole file);
`src/app/api/attachments/upload/route.ts`; `e2e/support/seed.ts:35` (the only
mention of `Attachment` anywhere in `e2e/`)
**Requirement** CLAUDE.md: *"Attachments are student records. They live outside
`public/` and are served only through `GET /api/attachments/[id]`, which
re-checks session and ownership. Never reintroduce a direct file URL."*
**Finding** Prior **TEST-30** is still open, unchanged. No test creates an
`Attachment` row; the fixture deletes them and seeds none. Every branch of the
download route is dead in test: the ownership predicate (`:36-39`), the
404-not-403 choice (`:41-43`), the path-containment assertion (`:50-52`), and
the `application/octet-stream` / `nosniff` / `no-store` headers (`:66-71`).
Replace the handler body with a 302 to `/uploads/${filePath}` and the suite is
green while witness statements become public static assets. The upload route's
extension, size and traversal guards are unit-tested as *functions*
(`src/lib/uploads.test.ts`, and they are good tests), but nothing tests that the
route calls them or that what it writes can be read back only by the owner.
**Proposed fix** Seed one attachment on the reporter's incident and one on the
admin's (a small file written into `attachmentUploadsDir()` by `seed.ts`), then
`attachments are served only to the owner, only through the API`: owner GET is
200 with `content-type: application/octet-stream`, `x-content-type-options:
nosniff` and a `Content-Disposition: attachment`; the foreign id is 404;
`GET /uploads/<filePath>` is 404. Property: the file is reachable by exactly one
route and exactly one user.

### TEST-54 — "A model-sourced deadline gets no red or amber countdown" is asserted nowhere, and `incidents/[id]` already violates it

**Severity** blocker
**Location** `src/app/incidents/[id]/page.tsx:182`, `:233-236`, `:411-412`,
`:441-445`; `src/components/design/DeadlineClock.tsx:38`
**Requirement** `docs/roadmap.md` OQ-5: *"**A model-sourced deadline gets no red
or amber countdown**"*. CLAUDE.md: colour means a deadline state and nothing
else.
**Finding** The property is implemented in two places and absent in a third, and
no test covers any of them. `DeadlineClock:38` correctly downgrades an
unverified clock to `text-text-tertiary`, and `page.tsx:72` correctly excludes
model-sourced rows from the headline. The incident detail page does neither:
`:182` computes `overdue` from `dueDate` alone, `:233-236` renders an
`N overdue` chip in `text-overdue` from it, and the timeline paints
`missed → bg-overdue` / `upcoming → bg-attention` (`:411-412`) with matching
text colours (`:441-445`) with no reference to `deadlineSource`. So an
administrator opening an incident sees a red statutory-lateness badge for a
deadline the system knows it cannot substantiate — the precise failure OQ-5 was
decided to prevent. (`:443-445` also paints every non-overdue obligation amber
regardless of what `describeDeadline` returned, which is prior **SPEC-44**,
likewise untested.) Nothing fails because no test asserts a colour anywhere in
the suite, and `e2e/smoke.spec.ts:37-48` is the only test that loads an incident
detail page at all.
**Proposed fix** Two tests. Unit: `DeadlineClock` tone selection, if a component
runner is added — otherwise e2e. E2E `an unsubstantiated deadline does not
claim lateness`, using the policy-backed and model-sourced overdue rows added
for TEST-50: on `/incidents/{id}` the `N overdue` chip counts only the
policy-backed one, and the model-sourced row's meta carries neither
`text-overdue` nor `text-attention`. Property: red and amber appear only where
a retrieved policy states the deadline.

---

## Majors

### TEST-55 — The excerpt number the model cites is resolved against a `references[]` that no test ties to the prompt text

**Severity** major
**Location** `src/lib/ai/rag.ts:427-441`; `e2e/incident-management.spec.ts:236-238`
**Requirement** CLAUDE.md: *"Never assert policy the system did not retrieve."*
The citation on a policy-backed obligation is the provision the administrator is
told to rely on.
**Finding** `src/lib/obligation-provenance.test.ts` is a good test of
`resolveProvenance(n, references)` — it pins that an unsupplied `n` degrades to
`model`. What it cannot pin is that `references[n-1]` is the excerpt the prompt
labelled `[n]`. That correspondence is maintained by a single shared counter in
`buildJurisdictionContext` (`rag.ts:423-441`), and the e2e only asserts
`expect(backed[0].citation).toBeTruthy()` plus its type. Change
`references?.push({ n, ... })` to push before the increment, or to push
`citation: title` instead of the section citation, or reverse the push order, and
an obligation carries a confident citation to the wrong provision with the suite
green. The stub attributes obligation 1 to excerpt `[1]`
(`claude-stub.ts:70-73`), and excerpt `[1]` is deterministic: the first chunk of
the first jurisdiction in `POLICY_JURISDICTIONS`, i.e. the seeded federal Title IX
policy. So the expected value is knowable.
**Proposed fix** Strengthen `records where each deadline came from` to assert
the value: `backed[0].citation` equals the citation of excerpt `[1]` —
`'Title IX (34 CFR Part 106)'` for the current fixture — and `backed[0].policyId`
is that policy's id. Property: the number the model cites and the provision the
row names are the same excerpt.

### TEST-56 — Zero retrieval is still structurally unreachable end-to-end; only the unit half of the TEST-26 fix was built

**Severity** major
**Location** `src/lib/ai/claude-service.ts:261-268`;
`src/lib/ai/system-prompt.test.ts:42-51`; `e2e/support/claude-stub.ts:86-93`
**Requirement** CLAUDE.md: *"Never assert policy the system did not retrieve. If
retrieval returns nothing, the prompt gets an explicit instruction not to cite
policy codes or state district deadlines. Don't remove that guard."*
**Finding** The unit half holds and is falsifiable: delete `:261-268` and
`system-prompt.test.ts:42-51` fails on `NO POLICY RETRIEVED FOR THIS QUERY`.
That is a real fix and it is the load-bearing one. The e2e half of TEST-26's
proposed fix — *"add a stub sentinel so e2e can observe it"* — was not built.
`mandatory_reporting` is guaranteed for every classification
(`guaranteedCategoriesFor`) and the seeded JLF policy is chunked, so
`policyContext` is non-empty on every e2e turn and the branch never executes in
the running system. The stub echoes the jurisdictions it saw and whether
`POLICY COVERAGE GAP` was present, but says nothing about the retrieval guard.
So the *wiring* — that an empty retrieval reaches `buildSystemPrompt` as `''`
rather than as a placeholder — is unverified.
**Proposed fix** Add a sentinel to `replyFor`: append ` NOPOLICY` when
`system.includes('NO POLICY RETRIEVED')`, and assert its **absence** on the
bullying turn (which does retrieve) so the sentinel itself is proved live. Then
either seed a second reporter whose incidents route to a category with no
chunked policy at any level, or unit-test `generateComplianceResponse` with
`policyContext: ''` and a captured `system`. Property: the guard reaches the
model exactly when nothing was retrieved.

### TEST-57 — The LLM-outage path has no test, and the swallow-into-filler pattern still exists one function above the fix

**Severity** major
**Location** `src/lib/ai/llm-service.ts:67-75` and `:111-124`;
`src/app/api/chat/route.ts:255-262`
**Requirement** FLOW-7 / prior TEST-5, restated in the code: *"Callers must
surface this as an error response, never persist its message as assistant
guidance."*
**Finding** `generateSchoolComplianceResponse` correctly rethrows as
`LLMUnavailableError` and the route correctly returns 503 without writing an
assistant row. Nothing tests it. The stub always answers 200
(`claude-stub.ts:108`), so the 503 branch, and the property that matters — the
incident record gains no assistant turn — never executes. Delete
`:255-262` and the failure surfaces as a generic 500 with the filler text
question unresolved; delete the `throw` at `:120` and replace it with the return
at `:71-74` and apology text is persisted as guidance again, with the suite
green. That older shape is still present verbatim at `:67-75`
(`LLMService.generateResponse`) and at `:184-187` (`streamResponse`); both are
currently unreachable — `route.ts:213` is the only `llmService` call site — so
they are dead code that re-arms the bug the moment anyone calls them. Prior
**TEST-48**, still open.
**Proposed fix** `e2e/chat-flow.spec.ts`: with `page.route('**/api/chat')`
left alone, instead point one test at a stub failure — add a query the stub
recognises (e.g. a message containing `TRIGGER_UPSTREAM_FAILURE`) for which it
returns 500. Assert the chat POST is 503 with `code: 'LLM_UNAVAILABLE'`, that
`GET /api/incidents/{id}` shows the user's turn and **no** assistant turn, and
that the UI shows an error rather than the General speaking. Property: a failed
model call never becomes a row in the incident record.

### TEST-58 — Retrieval, the path everything else rests on, has no unit test

**Severity** major
**Location** `src/lib/ai/rag.ts` (whole file; `fallbackSearch` `:216-281`,
`ensureCategoryRepresentation` `:364-404`, `assessCoverage` `:505-532`)
**Requirement** Retrieval decides which policies the answer may cite.
**Finding** Prior **TEST-37** and **TEST-33** are both still open. There is no
`rag.test.ts`. Keyword fallback is the only retrieval path that runs anywhere
(vector search needs `OPENAI_API_KEY` and a Chroma server, which neither CI nor
the fixture provides), and it has no direct test: the `isActive` filter, the
`mode: 'insensitive'` that recall on policy codes depends on, and the
`word.length >= 4` rule that makes *"Was a 504 IEP due?"* yield zero search
terms are all unasserted. `ensureCategoryRepresentation`'s preference for the
most local authority is unfalsifiable in the fixture because every supplemented
category has exactly one policy, so the comparison short-circuits — flip it and
34 CFR is substituted for JICK, which is the "statute passed off as district
procedure" failure CLAUDE.md names. The one genuinely well-covered piece is
`assessCoverage`, pinned end-to-end by
`e2e/chat-flow.spec.ts:195-211` including the no-chunk predicate — that is
prior TEST-29/B2 and it holds.
**Proposed fix** `src/lib/ai/rag.test.ts` over extracted pure helpers:
`keywordsFor(query)` (pins the `>= 4` rule and its consequence), and
`preferMostLocal(candidates)` given two policies in one category (pins that
`district` wins over `federal`). The Prisma-touching parts stay e2e: add a
seeded inactive policy in the `bullying` category and assert its title never
appears in `body.citations`.

### TEST-59 — The one page full of time-derived text is the one page whose console is not checked

**Severity** major
**Location** `e2e/smoke.spec.ts:37-48`; `src/app/incidents/[id]/page.tsx:78,363,416`
**Requirement** CLAUDE.md: *"Time-derived text needs `useMounted()` … Rendering
it unguarded is a hydration mismatch (React #418)."*
**Finding** Prior **TEST-34**, still open. `smoke.spec.ts:12-34` does this
properly for six routes — it collects `console` errors *and* `pageerror`, and
its filter deliberately does not exclude `/hydrat/`, with a comment saying why.
The incident-detail test at `:37-48` registers **only** `pageerror`, and React
#418 is a `console.error`. That page has three `useMounted()` call sites and the
densest time-derived rendering in the app (`TimelineRow`'s per-event timestamp,
the deadline meta on every obligation, the header stamp). Remove `mounted ?` from
`:431-438` and nothing fails. The same test also targets `incidents[0]` from
`?status=open`, which by the time it runs is whichever chat-created incident
happens to sort first — not the seeded one with obligations and attachments.
**Proposed fix** Extend the loop in `smoke.spec.ts` to include
`/incidents/{seededIncidentId}` (add the reporter's open incident id to
`SeededIds`), so it gets the same console-error assertion as every other route,
and drop the separate weaker test. Property: no route renders time-derived text
unguarded, including the one that renders the most of it.

### TEST-60 — Rate limiting is wired into three routes and tested on none of them

**Severity** major
**Location** `src/app/api/chat/route.ts:32-33`;
`src/app/api/chat/summary/route.ts:23-24`;
`src/app/api/incidents/[id]/summary/route.ts:27-28`;
`src/app/api/attachments/upload/route.ts`; `src/lib/rate-limit.ts:104-105`
**Requirement** SEC-23 as shipped: chat and uploads are limited by user id
because one turn triggers three billed model calls.
**Finding** `src/lib/rate-limit.test.ts` is a strong test of `checkRateLimit`
(seven cases including eviction and the `RATE_LIMITS` relative-strictness
property), and `e2e/navigation.spec.ts:103-133` genuinely proves the sign-in
limiter is *wired* — it floods the real endpoint and asserts 429 plus a
`Retry-After` and no account disclosure. Nothing does the equivalent for the
three authenticated writers. Delete `enforceRateLimit` from
`chat/route.ts:32-33` and a single account can spend without bound, with the
suite green.
**Proposed fix** Mirror the sign-in test: `the chat endpoint refuses a flood`,
looping `RATE_LIMITS.CHAT.limit + 3` POSTs to `/api/chat` and asserting a 429
with a positive `Retry-After` — and place it in its own spec file that runs last,
because it burns the window (see TEST-61). Property: the limiter is attached to
the billed path, not merely implemented.

### TEST-61 — Order-dependent state and retries that cannot pass

**Severity** major
**Location** `playwright.config.ts:34`; `e2e/incident-management.spec.ts:85-104`,
`:262-286`; `e2e/smoke.spec.ts:38-40`
**Requirement** Convention: a test must be able to fail — and must be able to
pass. CI runs with `retries: 2`.
**Finding** Prior **TEST-41**, still open. `globalSetup` seeds once for the whole
run, so a retry re-runs a mutating test against the state its first attempt
left:
- `:85-104` closes the seeded open incident and then expects `Reopen Incident`.
  On retry the incident is no longer in `?status=open`, so `target` is undefined
  and the test fails at `:89` — the retry can never pass, and two retries turn
  one real failure into three.
- `:262-286` (`shows the empty state`) discharges **every** obligation for the
  reporter. Anything after it that needs an open obligation depends on file
  order. Today the two tests that would care sit above it, which is a property
  of alphabetical file names, not of anything asserted.
- `smoke.spec.ts:38-40` asserts `incidents.length > 0` for `?status=open`, which
  is only true because `chat-flow.spec.ts` (earlier alphabetically) created
  incidents — the seeded open one having been closed by `incident-management`.
**Proposed fix** Two changes, neither a rewrite. (1) Give the mutating tests
their own rows: `closing an incident` should `POST /api/incidents` its own
incident and close that, leaving the fixture intact; `shows the empty state`
should create a dedicated reporter, or discharge and then restore. (2) Make the
dependency explicit where it is real: `smoke.spec.ts` should read the seeded
incident id from `e2e/.auth/seed.json` rather than `incidents[0]`. Property:
each spec passes from the seeded state alone, so a retry means something.

### TEST-62 — `extractJsonObject`, `classificationSchema` and the classification fallback are untested, and the fallback invents 24-hour deadlines

**Severity** major
**Location** `src/lib/ai/claude-service.ts:63-74` (extractor), `:32-52` (schema),
`:525-545` (fallback); `e2e/support/claude-stub.ts:19-36`
**Requirement** CLAUDE.md: *"When in doubt, say the system does not know."*
`docs/roadmap.md`: FLOW-35 was fixed so that *"a failed classification now
throws rather than returning a default"*.
**Finding** Prior **TEST-38**, still open. The stub returns bare, valid,
schema-conformant JSON on every call, so neither the extractor's brace scanning
(prose preamble, nested fences, no object at all) nor any schema rejection path
(an out-of-vocabulary `type`, a negative `dueInHours`, a `sourceExcerpt` of
`"2"` as a string) ever runs. Worse, the FLOW-35 fix is partial and the untested
half is the dangerous one: `classifier.ts` throws
`ClassificationUnavailableError` when the *call* fails, but a **parse or
validation** failure is still caught inside `claude-service.ts:525` and returns
the hardcoded default at `:534-544` — `type: 'other'`, `severity: 'medium'`, and
two fabricated obligations at `dueInHours: 24`. Those are then written as real
`ComplianceAction` rows with real deadlines by
`route.ts:327-338`. So a malformed model response produces two invented
24-hour clocks that look exactly like statutory ones, and nothing tests it.
**Proposed fix** `src/lib/ai/claude-service.test.ts` — export `extractJsonObject`
and pin: prose preamble, fenced JSON, JSON with trailing prose, and a throw when
there is no object. Then decide the fallback question and pin the answer: if a
parse failure should be `ClassificationUnavailableError` like a call failure,
test that it throws; if the default stays, test that its actions are created
with `deadlineSource: 'model'` and no citation. Property: the system cannot
manufacture a deadline out of a response it could not read.

### TEST-63 — `scripts/test-rag.ts` inserts an active district *bullying* policy into whatever `.env` points at

**Severity** major
**Location** `scripts/test-rag.ts:110-120` (policy create), `:188-191` (cleanup),
`scripts/test-phase3.ts:9` (`config({ path: resolve(__dirname, '../.env') })`),
`:44-50`, `:231-241`
**Requirement** CLAUDE.md: *"`.env` points at production … `scripts/test-phase3.ts`
and `scripts/test-rag.ts` … create and delete `User`, `Incident`, `Conversation`
and `Policy` rows despite the `test-` prefix."*
**Finding** Prior **TEST-19** and **TEST-47**, still open, and the specific
hazard is worse than the general warning suggests. `test-rag.ts:110-120` creates
`Policy { title: 'School Bullying Prevention Policy', jurisdiction: 'district',
category: 'bullying', isActive: true }` with fabricated content, and chunks it
through `ragSystem.addPolicyDocument`. Bullying is the pilot's *only* loaded
subject (`docs/roadmap.md:41`). Between creation and cleanup — and permanently if
the script dies between them, which the `catch` at `:213-229` only partly covers
— a fabricated document is live in production retrieval and will be cited to an
administrator as their district's own procedure. `test-phase3.ts` additionally
loads `../.env` explicitly, so an operator who exports a safe `DATABASE_URL`
still gets the production Anthropic key and a billed run. Neither script has
anything like `global-setup.ts:21-25`'s `/test/i` guard, and both are named to
look like tests: `npm run lint` reports its three warnings from these two files,
which is the only signal they exist. `test-chat-behavior.ts`,
`test-lawyer-persona.ts` and `test-complete-rag.ts` are HTTP-only against
`APP_BASE_URL` with a pasted session cookie — harmless but equally misnamed, and
`test-claude.ts` is a one-call key check.
**Proposed fix** Three steps, in order of value. (1) Add the same guard
`global-setup.ts` has to the two database scripts: refuse a `DATABASE_URL` whose
name lacks `test`. (2) Rename the directory contents out of the test namespace —
`scripts/manual/probe-rag.ts` etc. — so `test-*` means "runs in `npm test`" and
nothing else. (3) The two that assert real properties should become tests:
`test-rag.ts`'s retrieval assertions belong in the `rag.test.ts` TEST-58 asks
for, against fixtures rather than a live database.

---

## Minors

### TEST-64 — `mobile.spec.ts` weakens its own 44px rule to `not.toBeNull()`

**Severity** minor
**Location** `e2e/mobile.spec.ts:41-47`
**Requirement** The file's own premise (`:8-9`): *"every target has to be
reachable with a thumb."* Its sibling test at `:24-29` asserts `>= 44`.
**Finding** Prior **TEST-43**, still open verbatim. `expect(box).not.toBeNull()`
passes for a 1px send button. It is the only weakened assertion left in the
suite.
**Proposed fix** `expect(box!.height).toBeGreaterThanOrEqual(44)`, matching
`:28`. Property: the same rule applies to the one control on the page that must
be hit mid-incident.

### TEST-65 — Two documented test contracts are asserted by nothing, and the Generate Summary UI path is untested

**Severity** minor
**Location** `src/app/chat/page.tsx:690` (`data-testid="chat-send"`);
`src/app/incidents/[id]/page.tsx:263-270` (`Generate Summary`)
**Requirement** CLAUDE.md **Test contracts** lists `chat-send` and the button
name `Generate Summary` as *"asserted by the suite"*.
**Finding** Neither is. The specs reach the send button through
`getByRole('button', { name: 'Send message' })`, so `chat-send` is a contract no
test holds — remove it and nothing fails. `Generate Summary` is exercised only
through `POST /api/incidents/[id]/summary` (`incident-management.spec.ts:323`);
the button, its `Generating…` disabled state, and its failure handling (prior
FLOW-48: a failed summary is swallowed silently) are untested.
**Proposed fix** Either assert `chat-send` where the send button is located, or
remove it from the contract list — a contract nothing checks is worse than no
contract. Add `generating a summary from the incident page`: click the button,
await the response, assert `Summary generated` appears in the timeline; and a
second case with the route failed, asserting an error is shown.

### TEST-66 — An unrecognised prompt crashes the Playwright process instead of failing a test

**Severity** minor
**Location** `e2e/support/claude-stub.ts:82-83` inside the `req.on('end')`
handler at `:100-107`
**Requirement** A test harness failure should be attributable.
**Finding** Throwing on an unrecognised system prompt is exactly right — it is
the TEST-32 fix and it should stay. But the throw happens inside an
`http` event handler, so it becomes an uncaught exception in the process that
ran `globalSetup` (the Playwright runner) rather than a 500 the app can surface
and a test can assert. The request never gets a response, so the symptom is a
runner crash or a request hanging to its timeout, with the useful message —
`unrecognised system prompt: …` — going to whichever stream the runner is
writing.
**Proposed fix** Wrap `replyFor` in the handler: on throw, respond
`500` with `{ error: message }` and log it. The app then fails the turn, the
test fails on the response, and the message is in the failure.

### TEST-67 — The authority ordering of the source ladder is unasserted

**Severity** minor
**Location** `e2e/chat-flow.spec.ts:137-141`;
`src/components/design/SourceLadder.tsx:52`
**Requirement** CLAUDE.md: *"Authority is carried by brightness, federal
brightest to school dimmest, consistently."* The spec's own comment says
*"labels each rung by jurisdiction, highest authority first."*
**Finding** Prior **TEST-46**, still open. The test asserts the container
`toContainText('Federal')`, `('State')`, `('District')` — order-insensitive, so
reversing `POLICY_JURISDICTIONS.map` at `SourceLadder.tsx:52` passes.
**Proposed fix** Assert the sequence:
`await expect(sources.locator('[data-jurisdiction]')).toHaveText([/Federal/, /State/, /District/, /School/])`,
adding the attribute if needed. Property: authority order is rendered, not
merely intended.

### TEST-68 — `formatSectionCitation` produces `CFR §D` and `RSA §F` for the fixture's own titles, and the fallback test is weakened to `toContain`

**Severity** minor
**Location** `src/lib/policy-sections.ts:173-177`;
`src/lib/policy-sections.test.ts:108-112`
**Requirement** A citation is what the administrator looks the provision up by.
**Finding** Prior **TEST-45**, still open. The code regex `\b([A-Z]{3,5})\b`
extracts `CFR` from `'Title IX (34 CFR Part 106)'` and `RSA` from
`'RSA 193-F: Pupil Safety and Violence Prevention'`, so a sectioned federal or
state policy is cited as `CFR §D — …` / `RSA §F — …`, which names no document.
The three existing cases all use the JICK title where the regex happens to be
right, and the fallback case (`:108-112`) asserts only `toContain('§A')`, which
would pass for any prefix at all. Not currently reachable in the fixture — the
seeded federal and state policies have no parseable sections, so they are cited
at policy level — but it is reachable the moment a sectioned statute is loaded.
**Proposed fix** Add cases for the two fixture titles asserting the full
expected string, and change `:110-112` from `toContain` to `toBe`. Property: the
citation names a document a reader can find.

### TEST-69 — `src/lib/errors.ts` has no coverage, including a 503 decided by substring match

**Severity** minor
**Location** `src/lib/errors.ts:145-152`, `:174`, `:182`, `:276`
**Requirement** The status an administrator's client sees decides whether the app
retries or reports.
**Finding** Prior **TEST-39**, still open. There is no `errors.test.ts`. `:145`
maps any error whose message `includes('API key')` to 503, so an unrelated
error mentioning a key is reported as an upstream outage and vice versa; `:182`
suppresses the message unless `NODE_ENV === 'development'`, which nothing
asserts in either direction. These are pure functions with no dependencies — the
cheapest coverage in the repo.
**Proposed fix** `src/lib/errors.test.ts`: `createErrorResponse` maps an
`UploadError` to its own status, an `LLMUnavailableError`-shaped cause to 503, a
message containing `'API key'` to 503, anything else to 500; and the response
body carries no `message` when `NODE_ENV` is `production`. Property: status is
decided by error type, and production leaks nothing.

---

## Falsifiability spot-check

For the five most safety-critical behaviors, would deleting the implementation
turn the suite red?

| # | Behavior | Verdict | Catching test |
|---|---|---|---|
| 1 | **A reporter cannot read or write another user's incident by id** | **Red — genuinely fixed.** `seed.ts:222-245` creates the admin's incident *with* an obligation and returns both ids through `e2e/.auth/seed.json:1-4`; `incident-management.spec.ts:123-131` GETs and PATCHes the real `adminIncidentId`, `:186-198` PATCHes the real `adminObligationId` and then asserts the row is absent from the caller's list, `:359-361` POSTs the summary route. Delete `incidentScope` from `incidents/[id]/route.ts:32` or `:110`, `obligations/[id]/route.ts:38`, or `incident-summary.ts:37` and each turns red. SEC-7 is no longer a green-suite vulnerability **on these four lookups.** | `e2e/incident-management.spec.ts:118-138, 180-199, 355-365` |
| 2 | **Nothing that is not backed by retrieved policy is presented as a statutory deadline** | **Half red, half green.** `resolveProvenance` is well pinned (`obligation-provenance.test.ts` — an unsupplied excerpt number, zero, a non-integer and an empty library all degrade to `model`), and `counts.unverified` is pinned end-to-end at `incident-management.spec.ts:242-247`, so deleting the `backed` filter wholesale turns red. But the `overdue`/`today`/`week` tallies, the red/amber suppression, and the correspondence between the cited excerpt number and the citation stored are all green under deletion. See TEST-50, TEST-54, TEST-55. | partial: `src/lib/obligation-provenance.test.ts`; `e2e/incident-management.spec.ts:242-247` |
| 3 | **A prompt cannot be made to cite policy that was not retrieved** | **Red at the unit level.** Delete the empty-context branch (`claude-service.ts:261-268`) and `system-prompt.test.ts:42-51` fails; delete `CORE_DIRECTIVES` or move it after the editable profile and `:20-40` fails. The six tests there are the strongest in the repo — a hostile profile instructing "ignore all previous instructions" is the actual input. The *wiring* from an empty retrieval to that branch is not covered (TEST-56), but the guard itself is. | `src/lib/ai/system-prompt.test.ts:19-73` |
| 4 | **The deadline shown is the deadline the policy states** | **Green — nothing would catch it.** No test reads a `dueDate`. Change `dueInHours * 60 * 60 * 1000` to `* 60 * 1000` in `classifier.ts:58` or `chat/route.ts:318` and all 151 unit tests and the whole e2e suite pass with every statutory clock 60× short. This is the single worst gap in the suite. | none (TEST-49) |
| 5 | **An attachment is a student record and reachable only by its owner, only through the API** | **Green — nothing would catch it.** No `Attachment` row exists in any test. Replace `attachments/[id]/route.ts` with a redirect to a public path, drop the ownership predicate at `:36-43`, or drop `incidentScope` from `attachments/upload/route.ts:51`, and the suite is green against a named CLAUDE.md invariant. | none (TEST-53) |

Two further deletions worth recording because they are cheap to make and
invisible: inverting `page.tsx:74` (home reports "You're clear." with an
obligation past its deadline — prior TEST-31), and removing `mounted ?` from
`incidents/[id]/page.tsx:431-438` (React #418 on the page with the most
time-derived text — prior TEST-34).

---

## What holds

Recorded so it is not re-audited, and because most of it was a prior finding
that was fixed properly rather than papered over.

- **The conventions are respected.** No tautological or self-disabling
  assertion anywhere in `e2e/` or `src/**/*.test.ts`: no `toBeTruthy()` on a
  locator, no `if (await x.count() > 0)`, no conditional assertion, no
  `expect.soft`, no `.skip`/`.only`, no `try/catch` swallowing a failure, no
  `page.waitForTimeout`, no assertion on a mock's own return value. The one
  `setTimeout` is a documented response stall. Prior TEST-7, TEST-8, TEST-9 and
  TEST-23 are closed.
- **The stub is not easier to parse than the real API.** It returns a `thinking`
  block ahead of the text (`claude-stub.ts:121-124`) with a comment explaining
  that the previous lone-text-block shape let production's `content[0]` bug pass;
  `claude-service.ts:387-395` filters text blocks and throws on an empty answer.
  It dispatches on unique sentinels and throws on an unrecognised prompt, which
  is the TEST-32 fix. Its classification and obligation JSON match
  `classificationSchema` and `derivedObligationsSchema` field for field,
  including `sourceExcerpt: null` as a first-class value, and it exercises both
  the attributed and unattributed obligation paths.
- **The fixture represents real states**, deliberately and with the reasoning
  written down: an active district policy with **no chunks** (`seed.ts:127-132`,
  the state a failed re-index leaves, pinned by
  `chat-flow.spec.ts:205-206`), a category with federal-only coverage
  (`:111-120`), a closed incident, a foreign incident *with* a foreign
  obligation, and a policy written with lettered sections that is chunked
  through the production parser so the section citation in
  `chat-flow.spec.ts:157-159` is produced the way the pilot produces it. The
  gaps are: no attachment, no policy-backed obligation, and nothing overdue and
  backed (TEST-50, TEST-53).
- **Admin API authorization is table-tested across all seven mutating handlers**
  (`navigation.spec.ts:54-88`), asserting 403 and not 404 with the route in the
  failure message, plus 405 on the deleted `POST /api/policies` and 200 on the
  read. Prior TEST-35 closed.
- **Sign-in rate limiting is proved wired, not just implemented**
  (`navigation.spec.ts:103-133`): a real flood, a real 429, a positive
  `Retry-After`, and an assertion that the body discloses nothing about the
  address tried.
- **`reuseExistingServer: false`** with the reasoning at
  `playwright.config.ts:44-52`, and `global-setup.ts:18-25` refusing a
  `DATABASE_URL` whose name lacks `test`. Prior TEST-40 closed; CI supplies a
  matching database (`.github/workflows/ci.yml:25,37`).
- **`describeDeadline` is thoroughly tested**, including the carry bug that made
  it render `in 60m` and `in 23h 60m` (`deadline.test.ts:73-101`). Prior TEST-36
  closed.
- **The coverage-gap path is falsifiable end-to-end.** `chat-flow.spec.ts:180-232`
  asserts the gap set, the empty `byCategory` for the chunkless policy, that a
  covered category is *not* reported as a gap, and — through the stub's echo —
  that the gap instruction reached the system prompt, plus the negative case.
  Prior TEST-29 and blocker B2 closed.
- **The 404-not-403 rule, the summary-sender separation** (a summary is stored
  with its own sender so it is not replayed as chat context —
  `incident-management.spec.ts:333-338`), **the empty-queue state**, the
  status-vocabulary rejections on both `PATCH` routes, and the refusal to
  summarise an incident with no conversation are all covered by assertions that
  can fail.
- **151 unit tests pass in 447ms** over exactly the right surfaces: deadline
  formatting, the upload path and body-size guards (including the property that
  what a request costs is decided by the ceiling and not the client —
  `uploads.test.ts:295-306`), the zod schemas, the section parser against
  verbatim NHSBA text, the incident→category mapping, the coverage report, the
  cookie-security predicate, and prompt composition.
