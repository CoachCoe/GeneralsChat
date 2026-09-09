# End-to-end user journey trace — audit/2026-09-08

Read-only pass. Every line number below was verified by reading the file at
that line. IDs continue from FLOW-50.

Sources of truth used, in precedence order: `CLAUDE.md`, `docs/roadmap.md`
(especially the OQ-1..OQ-5 decisions), `docs/audit/2026-09-01-findings.md` +
`-work-completed.md`, `docs/audit/2026-08-31-*`,
`docs/audit/2026-09-01-ux-redesign.md`, `README.md`, `POLICY_MAPPING.md`.

Where a finding restates something the repo already documents as a known
limit or a deferred item, that is said explicitly in the finding.

## Counts

| | blocker | major | minor | total |
|---|---|---|---|---|
| J1 chat intake | 2 | 3 | 4 | 9 |
| J2 reading an incident | 0 | 3 | 2 | 5 |
| J3 mutations | 0 | 2 | 1 | 3 |
| J4 home / queue | 2 | 0 | 2 | 4 |
| J5 policy load | 0 | 3 | 2 | 5 |
| J6 advisor profile | 0 | 1 | 2 | 3 |
| J7 attachments | 0 | 0 | 2 | 2 |
| J8 coverage / no retrieval | 0 | 1 | 1 | 2 |
| **total** | **4** | **16** | **18** | **38** |

**Blockers, in one line each:**

- **FLOW-51** — `claudeService.classifyIncident` still returns a fabricated
  default (`other` / `medium` / two invented 24-hour obligations) whenever the
  model's JSON fails to parse or validate, so the FLOW-35 fix only covers
  transport failures and a parse failure is written permanently.
- **FLOW-52** — the incident is stamped with `incidentType` *before* obligations
  are derived, and classification is gated on `!incident.incidentType`, so any
  failure in retrieval or `deriveObligations` leaves the incident permanently
  classified with **zero** obligations and no code path that will ever retry.
- **FLOW-68** — on the home queue an unverified (`deadlineSource: 'model'`)
  obligation that is overdue, or due before midnight tonight, is rendered in
  **no** group at all: it disappears from the only screen that answers "what am
  I late on".
- **FLOW-69** — the home page's 40px headline reads "You're clear." /
  "No obligations are outstanding." while the fetch is still in flight **and**
  after it has failed.

---

# J1 — Reporter signs in and files an incident by chat

## Trace

1. `src/app/login/page.tsx:23` — `signIn('credentials', { redirect: false })`
   → `src/app/api/auth/[...nextauth]/route.ts` → `src/auth.ts:21` `authorize()`
   → `bcrypt.compare` against `DUMMY_HASH` when absent (`src/auth.ts:33-36`).
   On success `src/app/login/page.tsx:37` `router.push(callbackUrl)`.
2. `middleware.ts:40` — sign-in rate limit (`middleware.ts:41-55`), then
   `NextAuth(authConfig).auth`; `src/auth.config.ts:89-118` `authorized()`
   denies by default, 401 JSON for `/api/*`, redirect for pages.
3. `src/app/chat/page.tsx:148` `handleSendMessage` → `fetch('/api/chat')`
   (`src/app/chat/page.tsx:164`).
4. `src/app/api/chat/route.ts:26` `requireUser()` → `:32` `enforceRateLimit`
   (30/min) → `:39` `chatMessageSchema` → `:53-92` find-or-create incident
   (`incidentScope` at `:55`; `generateIncidentTitle` at `:70`).
5. `:101-110` history window (newest-20, reversed, summary rows filtered,
   leading-assistant trimmed) → `:113` persist the user turn → `:123`
   `determineDataSensitivity`.
6. `:141-185` classification: `incidentClassifier.classifyIncident`
   (`src/lib/ai/classifier.ts:34`) → `claudeService.classifyIncident`
   (`src/lib/ai/claude-service.ts:470`) → `:156-168` write `incidentType`,
   `severity`, `timeline`, `metadata`.
7. `:192-205` retrieval — `ragSystem.generateResponseWithCitations`
   (`src/lib/ai/rag.ts:289`) → `searchRelevantPolicies` (`:130`) →
   `fallbackSearch` (`:216`) → `ensureCategoryRepresentation` (`:364`) →
   `buildJurisdictionContext` (`:414`) → `buildCitations` (`:462`) →
   `assessCoverage` (`:505`).
8. `:209-211` → `createObligations` (`:300`) → `claudeService.deriveObligations`
   (`src/lib/ai/claude-service.ts:610`) → `resolveProvenance`
   (`src/lib/obligation-provenance.ts:30`) → `prisma.complianceAction.create`
   (`src/app/api/chat/route.ts:313` / fallback `:328`).
9. `:213` `llmService.generateSchoolComplianceResponse`
   (`src/lib/ai/llm-service.ts:81`) → `claudeService.generateComplianceResponse`
   (`src/lib/ai/claude-service.ts:424`) → `buildSystemPrompt` (`:248`) with
   `CORE_DIRECTIVES` (`:152`) + advisor profile (`:326`) + policy context +
   `NO_POLICY_RETRIEVED_GUARD` (`:104`) / `buildCoverageNote` (`:119`).
10. `:221-233` persist the assistant turn (metadata: citations, classification,
    usage, dataSensitivity) → `:238-245` response.
11. Back in `src/app/chat/page.tsx:187-196`, rendered by `GuidanceBlock`
    (`:520`), `ClassificationChip` (`:514`), `SourceLadder` (`:530`),
    `CoverageGapCard` / `LibraryScopeNote` (`:544-560`).

### FLOW-51 — a classification the model returned unparseably is written as a real classification, with two invented 24-hour obligations

**Severity** blocker

**Location** `src/lib/ai/claude-service.ts:525-545`; interacts with
`src/lib/ai/classifier.ts:72-85` and `src/app/api/chat/route.ts:141-185`,
`:327-338`

**Requirement** `docs/roadmap.md`: *"`FLOW-35` was fixed alongside it: a failed
classification now throws rather than returning a default, so `incidentType`
stays null and the next turn retries. The old default (`other` / `low` / no
obligations) was written permanently, so an API timeout and a genuine 'we could
not tell' produced the same record — on the incident where the system knew
least."* `src/lib/ai/classifier.ts:122-128` states the same thing and says the
default was *"Kept out rather than left unused, because a plausible-looking safe
default is exactly what someone would re-wire."*

**Finding** The default was removed from `classifier.ts` and left in place one
layer down. `IncidentClassifier.classifyIncident` only throws
`ClassificationUnavailableError` if `claudeService.classifyIncident` throws — and
that method catches its own `extractJsonObject` / `classificationSchema.parse`
failure and returns:

```ts
      // Return a safe default
      return {
        type: 'other',
        severity: 'medium',
        reasoning: 'Unable to automatically classify. Manual review required.',
        requiredActions: [
          { description: 'Review incident details', dueInHours: 24 },
          { description: 'Contact administrator', dueInHours: 24 },
        ],
```

So the FLOW-35 fix covers only transport failures. Reachable states that land
here: the model returns prose with no JSON object, a `type` outside
`INCIDENT_TYPES` (e.g. `sexual_harassment`, `neglect`, `suspected_abuse`), a
missing `stakeholders`/`timeline` key, `dueInHours: 0`, or a truncated response
(`generateResponse` throws only on *empty* text — `:391` — not on
`stop_reason === 'max_tokens'`, which is FLOW-40, still open).

The consequences are worse than the default that was removed. `route.ts:141`
gates classification on `!incident.incidentType`, so `other` is written
permanently with no endpoint to correct it (`updateIncidentSchema` accepts
`incidentType` but `PATCH` is not reachable from any UI and cannot clear it —
`src/app/api/incidents/[id]/route.ts:125`). And unlike the old default, this one
carries **two obligations**: when `deriveObligations` returns nothing — which it
does unconditionally when `policyContext` is empty
(`src/lib/ai/claude-service.ts:614-616`), the state the roadmap says
`mandatory_reporting` is in today — `createObligations` falls through to
`route.ts:327-338` and writes "Review incident details" and "Contact
administrator", each due in 24 hours, `deadlineSource: 'model'`.

**What the administrator sees** An incident titled `Other: <title>`, "Classified:
yes" in the stamp bar, and two obligations on 24-hour countdowns whose text is a
placeholder — for a report the system in fact failed to read. The two real
questions ("is this abuse/neglect?", "must I report it?") are silently answered
"we could not tell", and it can never be re-asked.

**Proposed fix** Delete the default and let the parse/validation failure throw;
`classifier.ts` already converts a throw into `ClassificationUnavailableError`
and `route.ts:175-184` already handles it correctly. Log the raw response as it
does today. Separately, treat `stop_reason === 'max_tokens'` as a failure in
`generateResponse` rather than returning a truncated body (FLOW-40).

### FLOW-52 — classification is committed before obligations are derived, so a failure between the two leaves a classified incident with no obligations, permanently

**Severity** blocker

**Location** `src/app/api/chat/route.ts:141` (gate), `:156-168` (commit),
`:192-205` (retrieval), `:209-211` (obligation derivation)

**Requirement** `docs/roadmap.md` OQ-5: *"Two-phase classification: after
retrieval, re-derive obligations with `policyContext`"* — and the whole point of
the FLOW-35 fix: *"`incidentType` stays null so the next turn retries."*

**Finding** The two phases are not atomic and the retry gate sits on the first
one. Order of writes in a single request:

1. `:156` `prisma.incident.update({ incidentType, severity, timeline, metadata })`
2. `:197` `ragSystem.generateResponseWithCitations(...)`
3. `:210` `createObligations(...)` → `claudeService.deriveObligations` →
   `generateResponse`, which on any upstream error throws a plain
   `Error("Failed to generate Claude response: …")`
   (`src/lib/ai/claude-service.ts:417`)

That error is not `LLMUnavailableError`, so `route.ts:255` does not match; it
falls to `createErrorResponse` and returns 500. Step 1 is already committed.
On the next turn `!incident.incidentType` is false → `classification = null` →
`:209` is skipped → `createObligations` is never called again. Grepping the
whole tree, `prisma.complianceAction.create` appears only at
`src/app/api/chat/route.ts:313` and `:328`, both inside `createObligations`.
There is no other path, no backfill script, and no admin action.

The same permanent state is reached if step 2 throws (a Prisma error inside
`assessCoverage`/`fallbackSearch`, or Chroma raising something
`searchRelevantPolicies`'s catch does not cover), or if the process is killed
between steps.

A second route into it: `POST /api/incidents`
(`src/app/api/incidents/route.ts:123-133`) accepts `incidentType` from the body,
so an incident created that way is born classified and can never acquire
obligations through chat.

**What the administrator sees** The incident page shows the classification chip,
"Classified: yes" in the stamp bar, and — in the aside — *"No obligations yet.
They are created when the incident is classified."*
(`src/app/incidents/[id]/page.tsx:321-324`), which is now a false statement about
this incident forever. The home queue shows nothing for it. A mandated report
with a 24-hour clock simply never appears.

**Proposed fix** Either (a) commit the classification and its obligations in one
`prisma.$transaction`, deriving obligations before the incident row is updated;
or (b) stop gating on `incidentType` alone — gate the obligation phase on
`incident.complianceActions.length === 0 && incident.incidentType` so a later
turn completes phase two. (b) is smaller and also repairs the rows already in
this state. Whichever is chosen, the failure must not present as a bare 500 with
the incident half-written.

### FLOW-53 — every failure of `/api/chat` is rendered as the assistant speaking, and the one message written for this case is thrown away

**Severity** major

**Location** `src/app/chat/page.tsx:175-177` and `:197-205`;
`src/lib/ai/llm-service.ts:120-123`; `src/app/api/chat/route.ts:255-262`

**Requirement** `CLAUDE.md`: *"a confidently wrong statutory deadline is worse
than no answer. When in doubt, say the system does not know."* FLOW-7 /
`src/lib/ai/llm-service.ts:113-119`: the whole reason `LLMUnavailableError`
exists is that filler text must not be presented as guidance. This is FLOW-43
from the 2026-09-01 audit, filed there as minor and still open.

**Finding** `handleSendMessage` throws on `!response.ok` with only
`response.statusText`, then the catch pushes

```ts
        type: 'general',
        content: "I'm sorry, I'm experiencing technical difficulties. Please try again in a moment.",
```

into `messages`. `type: 'general'` is the assistant's own type: it gets the
General's avatar (`:478-495`) and is rendered through `GuidanceBlock`
(`:520`) — the same DM Serif/markdown treatment as real guidance. Nothing in the
bubble distinguishes it from an answer.

Three separate problems compound:

- It covers 503 (`LLM_UNAVAILABLE`), 429 (rate limit, 30/min per user), 400
  (validation) and 500 (including FLOW-52's half-written state) identically, so
  "I hit my limit" and "the incident record is now inconsistent" read the same.
- The response body is never parsed on the error path, so the message
  `LLMUnavailableError` carries — *"The compliance assistant is temporarily
  unavailable. For urgent matters, contact your district's compliance officer or
  legal counsel directly."* — the only text in this product that tells an
  administrator what to do when the tool is down, never reaches the screen.
- Nothing is persisted, but the **user's** turn was
  (`src/app/api/chat/route.ts:113`, deliberately). So on reload the transcript
  shows the administrator's report of an incident with no reply and no trace
  that anything went wrong.

**What the administrator sees** The General apparently answering "I'm sorry, I'm
experiencing technical difficulties" — and after a refresh, their own report
sitting alone with no reply.

**Proposed fix** Render failures as a non-conversational error surface
(`StateBlock variant="error"` or a toast — `ToastProvider` is already mounted),
never as a `type: 'general'` message. Read `data.error` / `data.code` and
surface the 503 text and a distinct 429 message. Offer a retry that re-sends
rather than requiring the administrator to retype.

### FLOW-54 — reloading a conversation loses every citation, the coverage gap and the classification

**Severity** major

**Location** `src/app/api/chat/[incidentId]/route.ts:35-41`;
`src/app/chat/page.tsx:126-141`

**Requirement** `CLAUDE.md`: *"A missing local policy is information. Coverage
gaps are reported, not hidden."* Recorded as SPEC-42/FLOW-38 in
`docs/audit/2026-09-01-findings.md` and explicitly deferred in
`-work-completed.md` ("Deferred majors … SPEC-41, SPEC-42/FLOW-38"). **This is a
documented open item, restated because it is the gap warning that vanishes.**

**Finding** The chat route stores `citations` and `classification` on the
assistant message's `metadata` (`src/app/api/chat/route.ts:226-231`) but stores
`coverage` nowhere. `GET /api/chat/[incidentId]` then projects only
`id/type/content/timestamp`, so `loadConversation` sets `citations: undefined`,
which means `src/app/chat/page.tsx:527` (`message.citations &&`) is falsy and the
whole `data-testid="chat-sources"` block — the SourceLadder, the
"No matching district policy was found" line, the `CoverageGapCard` and the
`LibraryScopeNote` — is not rendered at all.

**What the administrator sees** Guidance that on first delivery carried
*"the library holds no policy at any level … Confirm the obligation with your
compliance officer before acting on it"* becomes, after a reload or when reopened
from the sidebar, the same guidance text with no warning and no sources. The
answer looks more authoritative on the second reading than on the first.

**Proposed fix** Persist `coverage` alongside `citations` in the message
metadata, and have `GET /api/chat/[incidentId]` parse and return
`metadata.citations`, `metadata.coverage` and `metadata.classification` per
message. Note the metadata is written by this app and can still be malformed on
old rows, so parse defensively.

### FLOW-55 — the login page redirects to an arbitrary URL taken from the query string

**Severity** major

**Location** `src/app/login/page.tsx:11` and `:37`

**Requirement** `CLAUDE.md`: *"It handles incident reports about minors.
Confidentiality and correctness are safety-critical."* Not covered by a prior
finding.

**Finding** `const callbackUrl = searchParams.get('callbackUrl') || '/'` is
pushed unvalidated: `router.push(callbackUrl)`. An absolute off-site URL is a
full navigation. `/login?callbackUrl=https://…` therefore authenticates the
administrator against the real app and then lands them on an attacker's page —
the classic credential-harvest follow-up, and it is more effective here because
the link is a genuine link to the genuine product.

**What the administrator sees** A correct sign-in on the correct domain,
followed by a page they have no reason to distrust.

**Proposed fix** Accept only a same-origin path: reject anything that does not
match `/^\/(?!\/)/`, falling back to `/`. Do the same for
`signOut({ callbackUrl })` if it ever becomes parameterised.

### FLOW-56 — a rate-limited sign-in is reported as a wrong password

**Severity** minor

**Location** `src/app/login/page.tsx:31-35`; `middleware.ts:41-55`

**Finding** The middleware returns 429 with a `Retry-After`; `signIn(…, {
redirect: false })` surfaces that as `result.error`, and the page maps every
error to *"Incorrect email or password."* The generic message is deliberate for
credential errors (`:32`), but it is wrong here: after ten attempts in five
minutes the administrator is told their password is wrong when it may be right,
and there is nothing to tell them to wait.

**What the administrator sees** "Incorrect email or password." on a correct
password, with no way to distinguish it from a real failure.

**Proposed fix** Branch on `result.status === 429` (or read the response) and
show a wait message with the retry window. The 429 body already leaks nothing
about whether the account exists, so saying "too many attempts" costs nothing.

### FLOW-57 — `dataSensitivity` is computed before classification and read by nothing

**Severity** minor

**Location** `src/app/api/chat/route.ts:123`, `:341-366`

**Finding** This is FLOW-45 from the 2026-09-01 audit (**documented**, listed
there as minor). It is still exactly as reported: `determineDataSensitivity` is
called at `:123`, eighteen lines before the classification block, and reads
`incident.incidentType` / `incident.severity` from the row as it was *before*
classification — both null on the first turn. So the branch at `:357-363` that
exists to mark `title_ix` and `abuse_neglect` CONFIDENTIAL can never fire on the
turn where the incident is classified. Beyond that, grepping the tree, nothing
reads `metadata.dataSensitivity` back: it is written at `:230` and never
consumed, so FLOW-10's fix ("it is now recorded on the message metadata") gave
the value a home but no consumer.

**What the administrator sees** Nothing — which is the point: an
`abuse_neglect` disclosure is recorded as `internal`, and no surface uses the
label either way.

**Proposed fix** Move the call after the classification block and pass
`classification?.type ?? incident.incidentType`; or delete the function until
something reads it. Leaving a mis-computed sensitivity label on student-record
material is the worse of the two.

### FLOW-58 — the attachment affordance in chat does nothing

**Severity** minor

**Location** `src/app/chat/page.tsx:636-658`

**Finding** The paperclip button has styling and hover handlers and no
`onClick`, no `<input type="file">` and no reference to
`/api/attachments/upload`. The working upload flow exists only on the incident
page (`src/app/incidents/[id]/page.tsx:294-306`).

**What the administrator sees** A clickable paperclip in the composer that
silently does nothing, at the moment they have the witness statement in hand.

**Proposed fix** Either wire it to `POST /api/attachments/upload` (it needs
`incidentId`, so it must be disabled until the first turn has created the
incident) or remove it.

### FLOW-59 — `llmService.generateResponse` still returns the apology text as content

**Severity** minor

**Location** `src/lib/ai/llm-service.ts:67-75`

**Finding** `generateSchoolComplianceResponse` was fixed to rethrow as
`LLMUnavailableError` (`:111-124`, FLOW-7/TEST-5), and its sibling
`generateResponse` on the same class still does the thing that fix exists to
prevent: catches, and returns `{ content: "I'm having trouble connecting to the
AI service right now…" }` with no `usage` and no error signal. The same pattern
is in `streamResponse` (`:184-187`). No route calls either today (only
`scripts/test-phase3.ts`), so nothing is broken — but it is a loaded gun in the
class whose contract is documented as "never persist its message as assistant
guidance" (`:5-7`).

**Proposed fix** Make both throw `LLMUnavailableError`, or delete them.

---

# J2 — Administrator reads the incident and its obligations

## Trace

1. `src/app/incidents/page.tsx:57-74` `load()` → `GET /api/incidents?limit=100`
   (+`status=` or `hasPendingActions=true`) →
   `src/app/api/incidents/route.ts:13`, `incidentScope` at `:44`,
   pending-actions filter at `:48-50`, `complianceActions: { where: { status:
   'pending' } }` at `:69-72`, `_count` at `:73-81`.
2. `src/app/incidents/page.tsx:80-108` client-side sort by soonest deadline →
   `IncidentRow` (`:172`) → `describeDeadline` (`src/lib/deadline.ts:70`) +
   `DEADLINE_COLOR` (`:109`), guarded by `useMounted` (`:199`, `:209`).
3. `src/app/incidents/[id]/page.tsx:84-95` `fetchIncident` →
   `GET /api/incidents/[id]` (`src/app/api/incidents/[id]/route.ts:22`,
   `incidentScope` at `:32`, `successResponse` at `:67`).
4. `src/app/incidents/[id]/page.tsx:179-224` derives `open`, `done`, `overdue`,
   `closed` and builds the timeline → `StampBar` (`:352`), `TimelineRow`
   (`:415`), `GuidanceBlock` (`:456`).
5. Aside: `ObligationRow` (`src/components/design/ObligationRow.tsx:30`) →
   `DeadlineClock` (`src/components/design/DeadlineClock.tsx:13`) +
   `AuthorityChip` (`src/components/design/AuthorityChip.tsx:18`).
6. Home queue reads the same rows through `GET /api/obligations`
   (`src/app/api/obligations/route.ts:18`), projected at `:42-54`.

### FLOW-60 — `AuthorityChip` on an obligation is dead code: no endpoint supplies `jurisdiction`

**Severity** major

**Location** `src/components/design/ObligationRow.tsx:86-93`;
`src/app/api/obligations/route.ts:42-54`;
`src/app/incidents/[id]/page.tsx:29-36`, `:330`

**Requirement** `docs/roadmap.md` step 7, recorded as **done**: *"`ObligationRow`
renders the `AuthorityChip` and the citation, which it could always do — the data
had simply never existed."* And `CLAUDE.md`: *"Authority is carried by
brightness, federal brightest to school dimmest, consistently."*

**Finding** The chip is gated on `obligation.jurisdiction`, and nothing ever sets
it. `GET /api/obligations` hand-projects eleven fields and `jurisdiction` is not
among them — it returns `deadlineSource` and `citation` but the `Policy` relation
is never joined (`policyId` is on the row, so the join is available). On the
incident page the aside passes `{ ...a, incidentId } as Obligation` where `a` is
an `Action` (`:29-36`); the runtime object is the raw Prisma row, so `citation`
and `deadlineSource` do arrive, but `jurisdiction` is a `Policy` column and is
not on `ComplianceAction` at all. The `as Obligation` cast is what hides this
from `tsc`.

So half of step 7 shipped: the citation string renders, the authority level never
does. `CLAUDE.md`'s brightness rule has no effect anywhere obligations appear.

**What the administrator sees** `JICK §D — Procedures for Reporting Bullying
(RSA 193-F:4, II(f) - (h))` in muted grey with no indication whether that is the
district's own procedure or a federal floor — the distinction `CLAUDE.md` calls
out as the one the administrator most needs and the one
`NO_POLICY_RETRIEVED_GUARD` and `buildCoverageNote` both work to preserve.

**Proposed fix** Add `policy: { select: { jurisdiction: true } }` to the
`/api/obligations` include and project `jurisdiction`; do the same in the
`complianceActions` include of `GET /api/incidents/[id]`. Then remove the
`as Obligation` cast on the incident page and declare the fields on `Action`, so
the next missing field is a type error rather than a blank chip.

### FLOW-61 — an unverified deadline is painted red and amber, and counted in the "N overdue" chip

**Severity** major

**Location** `src/app/incidents/[id]/page.tsx:182`, `:233-237`, `:211-223`,
`:406-413`, `:440-445`; `src/app/incidents/page.tsx:182-184`, `:198`

**Requirement** `docs/roadmap.md` OQ-5, decided and shipped: *"**A model-sourced
deadline gets no red or amber countdown**, and the home page's 'N things are
late' counts only policy-backed ones."* `src/components/design/DeadlineClock.tsx:17-27`
implements exactly that — *"a deadline the system cannot substantiate has not
earned the one signal the interface is allowed to raise its voice with."*

**Finding** `DeadlineClock` honours the rule; every other deadline surface
bypasses it.

- Incident page `:182`:
  `open.filter(a => a.dueDate && new Date(a.dueDate).getTime() < Date.now())`
  — no `deadlineSource` test. It feeds the red **"N overdue"** chip at `:233-237`
  and the `text-overdue` tone on the Obligations stamp at `:380`.
- Incident page `:211-223` maps every action into a timeline event whose `kind`
  is `missed` / `upcoming` from `describeDeadline` alone, and `KIND_TONE`
  (`:406-413`) paints `missed` `bg-overdue` and `upcoming` `bg-attention`. The
  meta text is then coloured `DEADLINE_COLOR.overdue` / `.attention` at
  `:440-445`.
- Incidents list `:182-184` / `:198`: the leftmost, most prominent column applies
  `DEADLINE_COLOR[deadline.state]` to the soonest pending action with no
  `deadlineSource` test; the `Action` interface at `:13-19` does not even declare
  the field.

Since `deadlineSource` defaults to `'model'` in the schema
(`prisma/schema.prisma:149`) and the `createObligations` fallback writes `'model'`
explicitly (`src/app/api/chat/route.ts:335`), and the roadmap records
`mandatory_reporting` as having nothing loaded, **most** obligations in the pilot
are unverified — so most red countdowns in the product are the ones OQ-5 decided
must not be red.

Note also `:412`: `upcoming: 'bg-attention'` is applied to every non-overdue,
non-completed action regardless of what `describeDeadline` returned, so an
obligation due in three weeks is amber. That specific defect is SPEC-44 from the
2026-09-01 audit, which `docs/roadmap.md` records as fixed ("severity chips and
error states lost their colour in the audit (SPEC-44)"). It is not fixed — see
FLOW-62.

**What the administrator sees** "3 overdue" in red on an incident where no
retrieved policy states any of those three deadlines, next to rows that
individually say *"Deadline not found in the loaded policy — confirm it before
acting."* The chip and the row contradict each other, and the chip is the louder
one.

**Proposed fix** Thread `deadlineSource` through `Action` on both pages and
apply the `DeadlineClock` rule uniformly: `verified || state === 'met'` gates the
tone, and the overdue count uses only `deadlineSource === 'policy'`. Better: move
the tone decision into one exported helper next to `DEADLINE_COLOR` so a new
call site cannot re-derive it wrongly.

### FLOW-62 — SPEC-44 is recorded as fixed and none of its three sites is fixed

**Severity** major

**Location** `src/components/design/ClassificationChip.tsx:13-18`, `:37-41`;
`src/app/incidents/[id]/page.tsx:412`, `:443-445`;
`src/components/design/StateBlock.tsx:30-33`

**Requirement** `CLAUDE.md`: *"Colour is earned. It means a deadline state —
overdue (red), attention (amber), met (green) — or a coverage gap (amber).
Nothing else. No brand accent, and **never severity, error states** or
decoration."* `docs/roadmap.md` (OQ-1) asserts the remediation happened: *"The
rule still bites, which is why severity chips and error states lost their colour
in the audit (SPEC-44)."*

**Finding** All three sites the 2026-09-01 findings named
(`ClassificationChip.tsx:13-18`, `incidents/[id]/page.tsx:412` and `:437-439`,
`StateBlock.tsx:31-33`) are unchanged. `git log` on
`src/components/design/ClassificationChip.tsx` shows one commit, `3fc4280`
(2026-09-01), which is when the file was introduced; `SEVERITY_TONE` has never
been touched:

```ts
const SEVERITY_TONE: Record<string, string> = {
  critical: 'text-overdue',
  high: 'text-overdue',
  medium: 'text-attention',
```

So a `medium`-severity classification — including the fabricated one from
FLOW-51 — renders amber, the same colour the UI reserves for "due within 24
hours" and "coverage gap", and `StateBlock`'s load-error title renders in
`text-overdue`, the colour of a missed statutory deadline.

**What the administrator sees** Three different meanings sharing red and amber
on the same screen, which is precisely what the rule exists to prevent: the
severity chip, the coverage gap card and the countdown all shout at the same
volume.

**Proposed fix** Repaint the three sites (severity in `text-text-tertiary`,
the timeline dot from `describeDeadline().state` rather than a fixed
`upcoming`, the error title in `text-text`), then correct the OQ-1 paragraph in
`docs/roadmap.md` — it currently records work that was not done, which is how a
reader concludes the rule is enforced.

### FLOW-63 — the empty rung of the source ladder prints raw category slugs

**Severity** minor

**Location** `src/components/design/SourceLadder.tsx:109-111`

**Finding** `Nothing on file for {gapCategories.join(', ')}` interpolates the
raw values, so the ladder reads *"Nothing on file for mandatory_reporting,
title_ix"*. `CATEGORY_LABELS` (`src/types/index.ts:171`) exists for exactly this
and is used by `CoverageGapCard.tsx:28` and `LibraryScopeNote.tsx:25` on the same
screen, so the two cards disagree with the ladder above them.

**What the administrator sees** Database identifiers in the sentence that tells
them the district has a compliance hole.

**Proposed fix** Map through `CATEGORY_LABELS` as the sibling components do.
Also `SegmentedTabs`'s `nav` is labelled `"Filter incidents"`
(`src/components/design/SegmentedTabs.tsx:31`) on the policy library page, which
is the same class of copy slip.

### FLOW-64 — "2 of 4 done" counts an in-progress obligation as done

**Severity** minor

**Location** `src/app/incidents/page.tsx:174-176`;
`src/app/api/incidents/route.ts:69-81`; `src/app/api/obligations/[id]/route.ts:11-13`

**Finding** The list computes `total` from `_count.complianceActions` (all
statuses) and `openActions` from the `complianceActions` array — which the API
filters to `status: 'pending'`. `done = total - openActions.length`, so any row
whose status is neither `pending` nor `completed` is counted as done.
`updateObligationSchema` permits `'in_progress'`, so this is reachable through the
API even though the UI only ever sends `'completed'` (`CLAUDE.md`: *"`Mark done`
is their only state change"*). Such a row is also excluded from the `next`
deadline, so it loses its countdown too.

**Proposed fix** Either narrow `updateObligationSchema` to
`z.enum(['completed'])` to match the documented single transition, or have the
API include all actions and let the page filter — deriving `done` from
`status === 'completed'` rather than by subtraction.

---

# J3 — Marking an obligation done, closing and reopening, generating a summary

## Trace

1. `src/app/incidents/[id]/page.tsx:145-152` `markObligationDone` →
   `PATCH /api/obligations/[id]` → `src/app/api/obligations/[id]/route.ts:22`
   (`requireUser` `:24`, schema `:29`, `incident: incidentScope` scope check
   `:37-41`, update `:43-51`, audit `:53-63`) → `fetchIncident()` on 2xx.
2. `src/app/incidents/[id]/page.tsx:114-127` `handleToggleStatus` →
   `PATCH /api/incidents/[id]` with `status: closed|open` →
   `src/app/api/incidents/[id]/route.ts:85` (schema `:96`, scope `:109-117`,
   `closedAt` stamped/cleared `:129`).
3. `src/app/incidents/[id]/page.tsx:101-112` `handleGenerateSummary` →
   `POST /api/incidents/[id]/summary` →
   `src/app/api/incidents/[id]/summary/route.ts:19` →
   `generateIncidentSummary` (`src/lib/ai/incident-summary.ts:32`) → retrieval
   (`:60`) → `claudeService.generateChatSummary`
   (`src/lib/ai/claude-service.ts:660`, guard at `:727-734`) → summary row
   written with `SUMMARY_SENDER` (`:75-88`) → incident metadata stamped
   (`:91-100`).

### FLOW-65 — every mutation on the incident page fails silently

**Severity** major

**Location** `src/app/incidents/[id]/page.tsx:101-112`, `:114-127`, `:129-143`,
`:145-152`

**Requirement** `CLAUDE.md`: *"When in doubt, say the system does not know."*
FLOW-48 in the 2026-09-01 findings named the summary case (**documented**, filed
minor); the other three are the same shape and are not documented.

**Finding** All four handlers are `if (response.ok) { … }` with no `else`, no
`catch` and no toast:

- `handleGenerateSummary` — a 400 ("nothing to summarise"), 429 or 503 leaves the
  button snapping back to "Generate Summary" with nothing said. The
  administrator's reasonable reading is that the click did not register.
- `handleToggleStatus` — a failed close leaves the button reading
  "Close Incident" and the badge reading `open`; indistinguishable from a
  mis-click.
- `handleFileSelect` — a rejected attachment (wrong extension → 400, oversize →
  413, rate limit → 429) resets the input and says nothing. The administrator
  believes the witness statement is on the file.
- `markObligationDone` — a 404 (out of scope) or 500 leaves the row unchanged
  with `busy` cleared by `ObligationRow`'s `finally`
  (`src/components/design/ObligationRow.tsx:45-49`), so "Mark done" is simply
  there again.

`react-hot-toast` is already used on the chat page and `ToastProvider` is mounted
app-wide, so the mechanism exists.

**What the administrator sees** A silent no-op — and in the attachment case, a
belief that a student record was filed when it was not.

**Proposed fix** Add an `else` branch to each that reads `data.error` and raises
a toast; on 429 include the retry window. Aggregating them behind one small
`mutate()` helper would stop the next handler repeating the omission.

### FLOW-66 — closing an incident leaves its obligations open, counted and late

**Severity** major

**Location** `src/app/api/incidents/[id]/route.ts:119-140`;
`src/app/api/obligations/route.ts:25-40`; `src/app/page.tsx:65`,
`src/app/incidents/[id]/page.tsx:277`

**Requirement** `CLAUDE.md` data model: *"`ComplianceAction` rows are the
obligations… `Mark done` is their only state change."* `docs/roadmap.md` records
`/incidents/pending` as resolved to mean "outstanding compliance actions".
No document says what closing an incident should do to them — see OQ-6.

**Finding** `PATCH` writes `status` and `closedAt` and touches nothing else. The
obligation queue scopes only through `incidentScope` and `status !== 'completed'`
(`src/app/api/obligations/route.ts:29-30`) with no filter on the incident's own
status, and `GET /api/obligations` returns `incident: { id, title, incidentType,
severity }` — not `status`. So after an administrator closes an incident:

- its open obligations stay in the home queue and in `counts.overdue` /
  `counts.today` / `counts.week`;
- the incident continues to appear under the **Needs action** segment, because
  `hasPendingActions` matches `complianceActions: { some: { status: 'pending' } }`
  irrespective of `status` (`src/app/api/incidents/route.ts:48-50`);
- the incident page still shows a red "N overdue" chip on a closed incident, next
  to a button reading "Reopen Incident".

Conversely there is no warning at close time that obligations are outstanding, so
"closed" can be recorded over an undischarged mandated report with no friction at
all.

**What the administrator sees** A closed incident that keeps demanding action,
and a queue that cannot be emptied by closing anything. Or — the worse
direction — a closed incident that reads as finished while a 24-hour report
remains outstanding, with nothing on the close action to say so.

**Proposed fix** Product decision first (OQ-6). Minimum: return the incident's
`status` from `/api/obligations` and mark queue rows from closed incidents
distinctly; warn on close when open obligations exist, naming them.

### FLOW-67 — "Generate Summary" appends an unbounded number of summary rows and the new one is invisible in the timeline until reload

**Severity** minor

**Location** `src/app/incidents/[id]/page.tsx:101-112`, `:309-314`;
`src/lib/ai/incident-summary.ts:75-100`

**Finding** `generateIncidentSummary` always `create`s a new `Conversation` row
with `sender: 'summary'` — there is no upsert and no guard against an existing
one — and stamps `metadata.summaryGenerated: true` on the incident, which nothing
reads. Each click therefore adds another summary to the permanent incident record
at real cost, bounded only by the 30/min rate limit. The handler then sets local
`summary` state and renders it in its own card at `:309-314` **without**
refetching, so the same text is on screen twice (once in the card, and after the
next reload also as a "Summary generated" timeline row at `:198`).

Prior summaries are correctly excluded from the transcript fed to the model
(`src/lib/ai/incident-summary.ts:47`), so this does not compound drift — it just
accumulates near-duplicate records in a file that "may become part of the
incident file" (`src/lib/ai/claude-service.ts:711`).

**Proposed fix** Call `fetchIncident()` after a successful generate and drop the
separate card; and either replace the existing summary row or show the
administrator that one already exists, with its timestamp, before paying for
another.

---

# J4 — The home page and the queue

## Trace

1. `src/app/page.tsx:32-45` `load()` → `GET /api/obligations` →
   `src/app/api/obligations/route.ts:18` (scope `:29`, projection `:42-54`,
   `backed` filter `:69`, counts `:73-90`).
2. `src/app/page.tsx:60-101` derives `open`, `verified`, `overdue`, `today`,
   `later`, `headline`, `unverifiedNote`, `subhead`.
3. `:125-131` `Tally` × 3 from the server counts; `:153-159` three `Group`s of
   `ObligationRow`; `:146-151` empty `StateBlock`.
4. `/incidents/{active,pending,closed,new}` are `redirect()` shims
   (`src/app/incidents/active/page.tsx:9`, `pending/page.tsx:9`,
   `closed/page.tsx:9`, `new/page.tsx:9`) onto `/incidents?segment=…`;
   segment → query mapping at `src/app/incidents/page.tsx:60-63`.

The OQ-5 rule is honoured where it was written: `/api/obligations:69` counts only
`deadlineSource === 'policy'`, and `src/app/page.tsx:72` mirrors it for the
headline. The two blockers below are both consequences of that filter being
applied to the *rendering* as well as the counting.

### FLOW-68 — an unverified obligation that is overdue or due today is rendered in no group at all

**Severity** blocker

**Location** `src/app/page.tsx:72-78`, `:153-159`, `:185`

**Requirement** `docs/roadmap.md` OQ-5: *"Suppressing the obligation is the worst
option… **Unverified obligations are still listed**, and still say they need
confirming; they just do not raise an alarm the system cannot substantiate."*
`src/components/design/ObligationRow.tsx:80-84` and
`src/lib/obligation-provenance.ts:25-28` restate it: *"Unverified is not a
failure state… with a thin library it is the common case."*

**Finding** The three groups do not partition `open`:

```ts
const verified = open.filter(o => o.deadlineSource !== 'model');
const overdue = verified.filter(o => due(o) !== null && due(o)! < now);
const today   = verified.filter(o => due(o) !== null && due(o)! >= now && due(o)! <= endOfToday.getTime());
const later   = open.filter(o => due(o) === null || due(o)! > endOfToday.getTime());
```

`overdue` and `today` are drawn from `verified`; `later` requires
`due > endOfToday`. An `open` obligation with `deadlineSource === 'model'` and a
`dueDate` at or before tonight's 23:59:59.999 satisfies none of the three
predicates. `Group` returns `null` on an empty list (`:185`), so nothing marks
its absence. There is no fourth group and no unverified section.

This is the common case, not an edge:

- `deadlineSource` defaults to `'model'` (`prisma/schema.prisma:149`), so **every
  row written before OQ-5 shipped** is unverified.
- The `createObligations` fallback writes `'model'` explicitly
  (`src/app/api/chat/route.ts:335`), and it fires whenever `policyContext` is
  empty (`src/lib/ai/claude-service.ts:614`) — the state
  `docs/roadmap.md` records for `mandatory_reporting`.
- `resolveProvenance` returns `UNVERIFIED` for any unresolvable attribution
  (`src/lib/obligation-provenance.ts:34-38`), which the prompt actively
  encourages (`src/lib/ai/claude-service.ts:624`).
- Every model-sourced obligation eventually crosses its own deadline, at which
  point it silently leaves the queue. The e2e fixture already contains such a
  row — `e2e/support/seed.ts:188-196` seeds "Notify the parents of
  both students", `dueDate` three hours in the past, `deadlineSource` defaulted
  to `'model'` — and it renders nowhere.

Nothing pins this. `e2e/incident-management.spec.ts:160-176` asserts
`expect(queue).toBeVisible()` (the container renders whenever
`!loading && !error`, empty or not) and looks for "Notify the superintendent",
which is the stub's `sourceExcerpt: 1` obligation due in 24 hours — always
`later`, always visible. `:200-249` asserts the API only.

**What the administrator sees** `subhead` says *"3 obligations have a deadline no
loaded policy states."* — and there are no such rows anywhere on the page. The
overdue mandated report they have not done is simply gone from the one screen
whose stated purpose is *"An administrator opens this app to find out what they
are late on"* (`src/app/page.tsx:17-24`).

**Proposed fix** Partition `open`, don't filter it three times. Keep the
*counting* rule (OQ-5) and change the *grouping* rule: bucket by `due` alone into
overdue / today / later, and render an "Unverified" section (or an inline
sub-heading within each bucket) drawn from `open.filter(o => o.deadlineSource ===
'model')` so nothing can fall between groups. Add a test that seeds an overdue
`model` obligation and asserts its description is visible in the queue; verify it
fails today.

### FLOW-69 — the headline asserts "You're clear." before the data has loaded and after the load has failed

**Severity** blocker

**Location** `src/app/page.tsx:26-30`, `:60-101`, `:111-123`, `:140-144`

**Requirement** `CLAUDE.md`: *"a confidently wrong statutory deadline is worse
than no answer. When in doubt, say the system does not know."*
`src/app/page.tsx:80` — *"The headline is the finding, not a page title."*

**Finding** `headline` and `subhead` are computed unconditionally from
`obligations`, which is `[]` until the fetch resolves and stays `[]` if it
rejects. Neither expression consults `loading` or `error`. The header block at
`:115-123` is rendered before and independently of the `StateBlock`s at
`:140-144`.

So on every first paint, and permanently on any failure of `GET /api/obligations`
(500 from `createErrorResponse`, a dropped connection, an expired session
returning 401 — `src/auth.config.ts:99-106` — after the 30-minute idle timeout),
the page reads:

> **You're clear.**
> **No obligations are outstanding.**

in the largest type on the screen, in the serif reserved for titles and answers.
The error `StateBlock` sits below it saying "Could not load your obligations", so
the page states both at once and the eye goes to the 40px line. The `Tally` row
is correctly gated on `counts` (`:125`), which makes the contradiction worse: the
headline is confident and the numbers are simply absent.

This is the failure class `CLAUDE.md` singles out — a failure rendered as a
plausible answer — on the product's single most consequential sentence.

**What the administrator sees** "You're clear. No obligations are outstanding."
when the system does not know, including when their session has just expired.

**Proposed fix** Compute the headline only from loaded data: while `loading`,
render a placeholder in the same slot (the `useMounted` pattern at `:116` already
reserves space this way); on `error`, replace the headline with something like
"Could not load your obligations." and never assert a state. Add an e2e that
routes `/api/obligations` to a 500 and asserts the page does not contain
"You're clear".

### FLOW-70 — incidents in three of the five valid statuses appear in no segment except "All"

**Severity** minor

**Location** `src/app/incidents/page.tsx:34-39`, `:60-63`;
`src/app/api/incidents/[id]/route.ts:14`, `:96`; `src/types/index.ts:59-65`

**Finding** The segments are `pending` / `open` / `closed` / `all`, and
non-`pending` segments map straight onto `?status=<segment>`. `INCIDENT_STATUSES`
has five values, and `updateIncidentSchema` accepts all five, so an incident set
to `in_progress`, `under_review` or `completed` matches neither `status=open` nor
`status=closed`. Only "All" will show it. `TERMINAL_STATUSES` in the PATCH route
already treats `completed` as closing (it stamps `closedAt`), so the API and the
list disagree about what "closed" means.

Nothing in the UI writes those three today — `handleToggleStatus` toggles
`open`/`closed` only — so this is reachable via the API rather than by clicking.
It is the residue of FLOW-12/SPEC-12.

**Proposed fix** Make the `closed` segment query the terminal set rather than one
string (or filter client-side on `TERMINAL_STATUSES`), and the `open` segment the
complement. Sharing one exported constant with
`src/app/api/incidents/[id]/route.ts:14` would stop the two drifting.

### FLOW-71 — the tallies and the group headings are computed against two different clocks

**Severity** minor

**Location** `src/app/api/obligations/route.ts:56-89`; `src/app/page.tsx:60-78`

**Finding** `counts.overdue/today/week` are computed on the server with the
server's `now` and its `endOfToday` (`setHours(23,59,59,999)` in the **server's**
timezone); the `Overdue` and `Due today` groups are recomputed on the client with
the browser's `now` and the browser's local midnight. For a deployment whose
container runs UTC and an administrator in America/New_York, "due today" spans a
different window on each side, so the `Tally` can read `2` above a group
containing three rows, or above no group at all. Both numbers are also
recomputed from `Date.now()` at render with no `useMounted` guard — harmless
here only because `obligations` is empty during SSR, so the two passes agree.

**Proposed fix** Pick one side. Since the boundary is a local-calendar
question, computing the buckets client-side and having the API return only the
rows is the simpler answer; the OQ-5 "policy-backed only" rule then lives in one
place.

---

# J5 — Admin loads a policy

## Trace

1. `src/app/admin/policies/page.tsx:85-187` `handleUpload`, three methods:
   `text` → `POST /api/admin/policies` (`:100`), `url` and `file` →
   `POST /api/admin/policies/upload` (`:134`, `:160`); result reported by
   `reportUpload` (`:36-48`).
2. `src/app/api/admin/policies/upload/route.ts:34` `requireRole('admin')` → `:37`
   rate limit → `:43` `readCappedFormData` → `:47` `policyFacetsSchema` → `:84`
   `assertAllowedExtension` → `:85` `assertWithinSizeLimit` → `:93`
   `safeUploadPath` → `:95` `writeFile` → `:97-104` `.txt/.md` read directly,
   everything else `processDocument` → `:127-132` `assertIndexablePolicyText` →
   `:137` `prisma.policy.create` → `:154` audit → `:172`
   `ragSystem.addPolicyDocument` → `:180` count chunks → `:184` respond.
3. `src/lib/ai/rag.ts:49` `addPolicyDocument` → `parsePolicySections` (`:59`) →
   `splitPolicyIntoSectionedChunks` (`:60`) → per-chunk embedding (`:76-83`) →
   `prisma.policyChunk.create` (`:86-97`) → `chromaService.addPolicyChunks`
   (`:113`).
4. Retrievability: `searchRelevantPolicies` filters
   `policy.isActive` + `category` (`src/lib/ai/rag.ts:244-258`);
   `assessCoverage` requires `chunks: { some: {} }` (`:514`).
5. `scripts/reindex-policies.ts:39` `assertSchemaCurrent` (P2022 preflight) →
   `:86-…` per-policy re-extract-from-source and re-chunk. This script is the
   most careful code in the repo and I found nothing wrong with it.

### FLOW-72 — a `.doc` policy is read as UTF-8, so binary garbage becomes retrievable policy text

**Severity** major

**Location** `src/lib/utils/documentProcessor.ts:55-59`;
`src/app/api/admin/policies/upload/route.ts:27`, `:97-104`;
`src/lib/uploads.ts:215-222`

**Requirement** `CLAUDE.md`: *"Never assert policy the system did not
retrieve"*; `docs/roadmap.md` on SPEC-5: loading a document with a wrong citation
into retrieval is the failure mode to avoid.

**Finding** `ALLOWED_POLICY_EXTENSIONS` includes `.doc`, and `processDocument`
handles it as:

```ts
      case '.doc':
        // For .doc files, we'd need a different library like 'mammoth' with doc support
        // For now, we'll treat it as text
        content = fileBuffer.toString('utf-8');
```

`.doc` is a binary OLE container. The result is mostly mojibake with fragments of
real text embedded; `cleanText` tidies its whitespace, `countWords` returns a
large number, so `assertIndexablePolicyText` (which only rejects **zero** words)
passes, and the row is created `isActive: true`. `parsePolicySections` will find
fewer than two ordered sections and fall back to policy-level citation
(the conservative path, working as designed), so the chunks are cited by policy
title — the district's real policy title — over garbage text.

Those chunks then enter retrieval like any other: they are matched by
`fallbackSearch`, numbered into `buildJurisdictionContext`, listed by
`buildCitations` in the "This rests on" ladder, and offered to
`deriveObligations` as attributable excerpts.

The comment is honest about the shortcut, so this is a **documented limitation**
in the processor — but the allowlist and the UI treat `.doc` as supported, and
nothing between them says otherwise.

**What the administrator sees** "Policy uploaded and indexed into 14 searchable
chunks." Later, guidance and a `SourceLadder` rung naming a real district policy,
resting on text that is not the policy.

**Proposed fix** Drop `.doc` from `ALLOWED_POLICY_EXTENSIONS` and reject it with
a message telling the operator to save as `.docx` or `.pdf`. If `.doc` must be
supported, add a real extractor. Independently, strengthen
`assertIndexablePolicyText` with a printable-character ratio check, since a
scanned-PDF-with-garbage is the same failure by a different route.

### FLOW-73 — the policy row is created before it is indexed, so an indexing failure leaves an active, unretrievable policy behind a 500

**Severity** major

**Location** `src/app/api/admin/policies/upload/route.ts:137-178`;
`src/app/api/admin/policies/route.ts:70-113`; `src/lib/ai/rag.ts:86-123`

**Requirement** `docs/roadmap.md`: *"It counts a policy as coverage only if it is
**active and has chunks** — a row with no chunks is invisible to retrieval, so
counting it would claim coverage the system cannot deliver."*
`src/lib/uploads.ts:167-177`: *"A policy whose text could not be read must not
become an active policy."*

**Finding** Both create paths do `prisma.policy.create({ … isActive: true })`,
record the audit entry, and *then* call `ragSystem.addPolicyDocument`.
`addPolicyDocument` re-throws on failure (`src/lib/ai/rag.ts:120-123`) — a
`policyChunk.create` failing part-way through the loop, or
`splitPolicyIntoSectionedChunks` throwing — so the route's catch returns 500
"Failed to upload policy" with the active row already committed and zero (or a
partial prefix of) chunks. There is no transaction and no compensating delete.
The roadmap records the operational consequence of exactly this state: *"Re-indexing
against production with an unmigrated schema is what once left every policy with
zero chunks and retrieval silently returning nothing."* `reindex-policies.ts`
grew a preflight for it; the upload routes did not.

The same routes also reach 500 on a malformed `effectiveDate` — see FLOW-75 —
which on the file path additionally orphans the bytes already written at
`upload/route.ts:95`, breaking the rule stated in the comment forty lines above
it (`:125-126`) and re-fixed in the 2026-09-01 review round.

**What the administrator sees** "Failed to upload policy". Nothing indicates a
row was created. They retry, and now the library holds two rows for one policy —
one of them a zero-chunk phantom that `assessCoverage` correctly ignores but that
`/policies` presents as loaded (FLOW-74) and that competes for the operator's
attention on `/admin/policies`.

**Proposed fix** Create the row inside a transaction with its chunks, or write it
`isActive: false` and flip it to active only after `chunksCreated > 0`. The
second is the smaller change and matches the guard's intent: a policy that could
not be indexed is not a policy the system can honour.

### FLOW-74 — the read-only policy library presents unretrievable policies as loaded

**Severity** major

**Location** `src/app/policies/page.tsx:141-164`;
`src/app/api/policies/route.ts:35-42`

**Requirement** `src/lib/uploads.ts:167-173`: *"A row with none is invisible to
search while still counting as a loaded policy to anyone reading the library."*
`CLAUDE.md`: *"A missing local policy is information. Coverage gaps are reported,
not hidden."*

**Finding** `GET /api/policies` projects six fields and no chunk count;
`/policies` renders every returned row as an equal member of the library, with an
`AuthorityChip`, a category and an effective date. A row with zero chunks — from
FLOW-73, from a failed re-index, from an ingestion path that predates the
`assertIndexablePolicyText` guard — is indistinguishable from a fully indexed
one. `/admin/policies` does fetch `_count.chunks`
(`src/app/api/admin/policies/route.ts:23-27`) so an admin *can* see it there; the
library page every signed-in user reads cannot.

The thin-library banner at `:98-108` is gated on `localCount < 3`, counting rows
rather than retrievable rows, so a district whose three local policies all have
zero chunks gets no warning at all.

**What the administrator sees** "5 active" and five rows, on a library from which
retrieval returns nothing — the precise state the roadmap says production was
once in and nobody could tell.

**Proposed fix** Return `_count.chunks` from `GET /api/policies` (it leaks
nothing: no content, no path) and mark a zero-chunk row explicitly —
"not searchable" — in amber, which OQ-1 permits since it is a coverage warning.
Count only chunked local policies in `localCount`.

### FLOW-75 — `effectiveDate` is validated on the update path and not on either create path

**Severity** minor

**Location** `src/app/api/admin/policies/upload/route.ts:144`;
`src/app/api/admin/policies/route.ts:76`; contrast
`src/app/api/admin/policies/[id]/route.ts:71-81`; `src/lib/validation.ts:61-70`

**Finding** The 2026-09-01 review round fixed this on `PUT`, where it is now
explicitly guarded with a comment. Both `POST`s still do a bare
`effectiveDate: new Date(effectiveDate)`, so `Invalid Date` reaches Prisma and
comes back as a 500 for a well-formed-but-wrong request.
`createPolicySchema` exists in `src/lib/validation.ts:61-70` with the right regex
and — verified by grep — is imported by nothing; the same is true of
`updatePolicySchema`, `createPromptSchema`, `updatePromptSchema` and
`fileUploadSchema`. The admin UI sends a `type="date"` value so it does not
trigger this, which is why it survives.

**Proposed fix** Reuse the `PUT`'s guard (or `createPolicySchema`) on both
`POST`s, returning `validationError`. Delete the four schemas that no route uses,
or wire them up — an unused validator reads as protection that is not there.

### FLOW-76 — a pasted-text policy has no source file, so re-indexing can never recover its section structure

**Severity** minor

**Location** `src/app/api/admin/policies/route.ts:70-84`;
`scripts/reindex-policies.ts:107-116`

**Finding** `POST /api/admin/policies` — the canonical paste-text path per OQ-2 —
writes no `filePath`. `reindex-policies.ts` prefers re-extracting from the source
file precisely because *"Content stored before the whitespace fix has no newlines,
so section structure is unrecoverable from it"*, and falls back to stored
content otherwise. For a pasted policy the fallback is the only option, forever.
That is acceptable when the paste preserved newlines (`cleanText` is not applied
on this path at all, so it does) but it means the "adopt the source into
`uploads/policies/`" provenance guarantee described in `docs/roadmap.md` does not
hold for anything loaded through the admin UI's default tab, which is `text`
(`src/app/admin/policies/page.tsx:55`).

**Proposed fix** Either write the pasted text to `policyUploadsDir()` as a `.txt`
and record the path, or say on the page that pasted policies carry no source
document. The first is a few lines and makes all three ingestion paths equal.

---

# J6 — Admin edits the advisor profile

## Trace

1. `src/app/admin/prompt/page.tsx:36-62` `fetchPrompts` → `GET /api/admin/prompts`
   (`src/app/api/admin/prompts/route.ts:7`, list projection excludes `content`
   `:19-27`) → `loadPrompt` → `GET /api/admin/prompts/[id]`
   (`src/app/api/admin/prompts/[id]/route.ts:13`).
2. `:89-131` `handleSave` → `POST /api/admin/prompts` (`createdBy` from session,
   `:66`) or `PUT /api/admin/prompts/[id]` (`:43`, before-image captured `:59-62`,
   single-active enforced `:65-70`, audit with `previousContent` `:82-93`).
3. Chat path: `claudeService.generateComplianceResponse`
   (`src/lib/ai/claude-service.ts:424`) → `getAdvisorProfile` (`:326`) →
   `buildSystemPrompt` (`:248`) → `CORE_DIRECTIVES` (`:152`) first, profile
   second, policy third, guards last.

**Verified correct.** `buildSystemPrompt` composes exactly as OQ-4 decided:
`CORE_DIRECTIVES` is prepended, the profile cannot displace it, and
`NO_POLICY_RETRIEVED_GUARD` / `buildCoverageNote` are appended last
(`:257-279`). `classifyIncident` (`:476`) and `generateChatSummary` (`:669`)
each build their own prompt and never call `getAdvisorProfile`, and the page says
so (`src/app/admin/prompt/page.tsx:211-220`). `src/lib/ai/system-prompt.test.ts`
pins the property. Nothing to report on the composition itself.

### FLOW-77 — a database error while reading the advisor profile silently substitutes the built-in one

**Severity** major

**Location** `src/lib/ai/claude-service.ts:326-338`, `:431`

**Requirement** `docs/roadmap.md` OQ-4: the editable row supplies *"the advisor
profile — tone, emphasis, **district-specific context**"*. `CLAUDE.md`: *"When in
doubt, say the system does not know."*

**Finding** `getAdvisorProfile` catches everything and returns `null`:

```ts
    } catch (error) {
      console.warn('Failed to fetch active system prompt from database:', error);
      return null;
    }
```

`generateComplianceResponse:431` then falls back to
`DEFAULT_ADVISOR_PROFILE`. A transient connection failure, a P2021/P2022 on the
`SystemPrompt` table, or a pool timeout therefore causes the district's tuned
profile — the only place district-specific facts live — to be replaced mid-session
by a generic persona, with a `console.warn` as the only trace. The chat response
is a normal 200 and looks entirely healthy. The same swallow means an
`isActive` row whose `content` is an empty string falls back too, because `:333`
uses `||` rather than `??`.

Note this is a *different* failure from the one OQ-4 addressed. OQ-4 stopped the
profile displacing the core rules; this is the core rules silently displacing the
profile.

**What the administrator sees** Guidance that has quietly stopped applying the
district's own context, phrased with the same confidence as guidance that
applies it.

**Proposed fix** Let the read fail — the caller is already wrapped by
`LLMUnavailableError` handling at the route level, and "temporarily unavailable"
is the correct answer when the system cannot tell which profile governs.
At minimum use `logError`, not `console.warn`, and distinguish "no active row"
(a legitimate fallback) from "could not read" (not one). Change `||` to `??` so
an intentionally empty profile is not confused with an absent one.

### FLOW-78 — the prompt routes validate nothing, and the schemas written for them are unused

**Severity** minor

**Location** `src/app/api/admin/prompts/route.ts:48-57`;
`src/app/api/admin/prompts/[id]/route.ts:52`, `:72-80`;
`src/lib/validation.ts:87-103`

**Finding** `POST` checks only `!name || !content`; `PUT` checks nothing at all
and spreads whatever the body held. `createPromptSchema` / `updatePromptSchema`
exist with `min(10)` on content and are imported nowhere (verified by grep).
`PUT { content: 123 }` reaches Prisma and returns 500; `PUT { content: "" }`
writes an empty active profile, which then silently resolves to
`DEFAULT_ADVISOR_PROFILE` via the `||` at
`src/lib/ai/claude-service.ts:333` — so the row an admin believes governs
guidance is not the text being sent, and nothing on the page says so.
`docs/audit/2026-09-01-work-completed.md` says the field was *"dropped from
`createPromptSchema`"*, which implies the schema was believed to be in use.

**Proposed fix** Apply the two schemas through `validateRequest` in both
handlers. On the page, warn when saving an empty profile that the built-in one
will be used.

### FLOW-79 — green as decoration on the admin pages, plus five CSS custom properties that no stylesheet defines

**Severity** minor

**Location** `src/app/admin/prompt/page.tsx:244-250`, `:301-304`, `:400`;
`src/app/admin/policies/page.tsx` and `src/app/admin/prompt/page.tsx`
(`var(--spacing-2|3|4|6|8)`, 16 occurrences across the two files)

**Requirement** `CLAUDE.md`: *"Colour is earned… No brand accent, and never
severity, error states or decoration."* `src/app/theme.css:32`:
`--color-met` means *"obligation discharged and recorded"*.

**Finding** `--color-met` is used as a button background and a badge background
for "Activate" and "Active", which are neither obligations nor deadline states —
the same rule-break as SPEC-44 (FLOW-62), on a surface that audit did not name.
Separately, `--spacing-2/3/4/6/8` are referenced in inline styles on both admin
pages and are defined nowhere: `src/app/theme.css` defines no `--spacing-*`
token, and Tailwind v4 exposes `--spacing` (singular) only. Each declaration
therefore resolves to nothing and is dropped, so icon gaps and the empty-state
padding are silently absent. This is the residue of SPEC-43 (120 references to
13 undefined properties), which was remediated everywhere except these two files.

**Proposed fix** Repaint the two green surfaces with the neutral `.btn-primary` /
`.badge` treatment the rest of the app uses, and replace the `--spacing-*`
references with Tailwind spacing utilities or literal pixel values.

---

# J7 — Attachment upload and download

## Trace

1. `src/app/incidents/[id]/page.tsx:129-143` `handleFileSelect` (multipart:
   `file`, `incidentId`) → `POST /api/attachments/upload`.
2. `src/app/api/attachments/upload/route.ts:29` `requireUser` → `:32` rate limit
   → `:38` `readCappedFormData` → `:50-59` incident existence **and**
   `incidentScope` → `:63` `assertAllowedExtension`
   (`.html/.svg/.xhtml` excluded, `:22-25`) → `:64` `assertWithinSizeLimit` →
   `:72` `attachmentUploadsDir()` (outside `public/`) → `:77` `safeUploadPath`
   (server-generated UUID basename, containment asserted) → `:81` `writeFile` →
   `:84-95` row with `filePath: storedName`.
3. Render: `src/app/incidents/[id]/page.tsx:204-210` builds an `attachment`
   timeline event carrying the row **id** as `meta`; `:448-454` links to
   `/api/attachments/${event.meta}`.
4. `src/app/api/attachments/[id]/route.ts:21` `requireUser` → `:28-31` lookup
   with the incident's `reporterId` → `:36-43` permission, **404 not 403** →
   `:45-52` containment re-assert → `:64-72`
   `application/octet-stream` + `Content-Disposition: attachment` + `nosniff` +
   `private, no-store`, and an audit row at `:56-62`.

**Verified correct.** No direct file URL is reintroduced, the extension
allowlist excludes executable markup, the download is scoped and re-checks the
session, out-of-scope ids 404, and every read is audited. This journey matches
the `CLAUDE.md` invariant. Two smaller points follow.

### FLOW-80 — the stored on-disk filename is returned to the client, contrary to the comment that says it is not

**Severity** minor

**Location** `src/app/api/attachments/upload/route.ts:88-90`;
`src/app/api/incidents/[id]/route.ts:44-46`

**Finding** The upload route stores only the basename and comments *"the on-disk
layout is never exposed to the client"*. `GET /api/incidents/[id]` then includes
the `attachments` relation with no `select`, so the full row — `filePath`
included — is serialised to the browser. The value is a UUID basename, not an
absolute path (SEC-27's problem), so the disclosure is small: it reveals the
naming scheme and nothing else, and the containment check at
`src/app/api/attachments/[id]/route.ts:50` means it cannot be used to escape.
But the comment states a guarantee the code does not keep, and SEC-27 is the
precedent for whole-row projections on this codebase.

**Proposed fix** Add an explicit `select` to the `attachments` include:
`{ id, filename, fileType, fileSize, createdAt }` — exactly the five fields the
page's own `Attachment` interface declares (`src/app/incidents/[id]/page.tsx:21-27`).

### FLOW-81 — a failed attachment insert orphans the bytes on disk

**Severity** minor

**Location** `src/app/api/attachments/upload/route.ts:81-95`

**Finding** `writeFile` precedes `prisma.attachment.create`, and there is no
`unlink` on the failure path — so a Prisma error leaves a file in
`attachmentUploadsDir()` with no row referencing it and no way to reach it or
reap it. The policy upload route was fixed for exactly this in the 2026-09-01
review round ("A rejected upload left the file on disk") and now unlinks at
`src/app/api/admin/policies/upload/route.ts:130`; the attachment route was not
included. Because these are student records, the orphans accumulate on the Azure
Files mount indefinitely.

**Proposed fix** Wrap the insert and `unlink(filePath).catch(() => {})` on
failure, mirroring the policy route.

---

# J8 — Coverage gap and the no-retrieval case

## Trace

1. `src/lib/ai/rag.ts:326-327` — `categoriesForIncidentType` (search filter, may
   be `[]`) and `guaranteedCategoriesFor` (never empty) from
   `src/types/index.ts:225` and `:249`.
2. `:328` `searchRelevantPolicies(retrievalQuery, 12, { categories, isActive:
   true })` → Chroma, then `fallbackSearch` on an empty or failed result
   (`:201-209`).
3. `:333` `ensureCategoryRepresentation(matched, guaranteed)` (`:364-404`).
4. `:336-338` `buildJurisdictionContext` (numbers excerpts, fills `references`),
   `buildCitations`, `assessCoverage` (`:505-532`, requires `chunks: { some: {} }`).
5. Prompt: empty `policyContext` → `NO_POLICY_RETRIEVED_GUARD`
   (`src/lib/ai/claude-service.ts:261-267`); gaps →
   `buildCoverageNote` (`:119-139`), which distinguishes "no local policy" from
   "nothing at any level" using `byCategory`.
6. UI: `src/app/chat/page.tsx:527-561` — zero citations → *"No matching district
   policy was found for this question."*; `isSubjectOutsideLibrary` (`:43-47`) →
   `LibraryScopeNote`, otherwise `CoverageGapCard` (which splits `localOnly` from
   `unsupported`, `src/components/design/CoverageGapCard.tsx:34-37`).

**Verified correct.** I traced the two states the task asks about:

- **Retrieval returns nothing.** `policyContext` is `''`
  (`src/lib/ai/rag.ts:421`), `buildSystemPrompt` takes the `(none)` branch and
  appends `NO_POLICY_RETRIEVED_GUARD`, `deriveObligations` short-circuits to `[]`
  (`src/lib/ai/claude-service.ts:614`) so the first-pass obligations are recorded
  as `model` and say so on their rows, and the UI prints the no-match line.
- **Federal only, no district.** `assessCoverage` reports the category in
  `categoriesWithoutLocalPolicy` with `byCategory[c] = ['federal']`, so
  `buildCoverageNote` emits the `localOnly` paragraph (*"Do not present a federal
  or state requirement as if it were district procedure"*) and
  `CoverageGapCard` prints the `localOnly` sentence rather than the
  "rests on nothing" one. `abuse_neglect` with nothing loaded takes the
  `unsupported` branch and gets *"the library holds no policy at any level…
  Confirm the obligation with your compliance officer before acting on it."*

Both behave as `CLAUDE.md` and OQ-3/FLOW-34 require. The one substantive
divergence is below.

### FLOW-82 — a chunk pulled in purely for category representation is presented as a source the guidance rests on, and is attributable as a deadline's provenance

**Severity** major

**Location** `src/lib/ai/rag.ts:364-404`, `:333-338`;
`src/components/design/SourceLadder.tsx:51`;
`src/app/api/chat/route.ts:311`

**Requirement** `CLAUDE.md`: *"Never assert policy the system did not
retrieve."* `docs/roadmap.md` OQ-5 on what `deadlineSource: 'policy'` means:
*"It verifies that the excerpt exists and was supplied"* — and the half
explicitly still open: *"A model that cites a real excerpt for a number that
excerpt does not contain still produces a policy-backed row."*

**Finding** `ensureCategoryRepresentation` is documented and deliberate: an
administrator describing a disclosure shares no vocabulary with "report to DCYF",
so a guaranteed category gets a chunk whether or not the text matched. What is
not accounted for is *which* chunk, and where it then appears.

The supplemental query has no relevance term and no `take`:

```ts
    const supplements = await prisma.policyChunk.findMany({
      where: { policy: { isActive: true, category: { in: missing } } },
      include: { policy: { select: { title: true, jurisdiction: true, category: true } } },
      orderBy: [{ policy: { jurisdiction: 'asc' } }, { chunkIndex: 'asc' }],
    });
```

It loads every chunk of every active policy in the missing categories, then keeps
one per category by jurisdiction rank (`:385-401`). Within the winning
jurisdiction the first row encountered wins, and the secondary sort is
`chunkIndex: 'asc'` — so the chunk selected is **chunk 0**, the front matter:
title block, adoption date, table of contents. That is the chunk least likely to
state an obligation.

It is then treated identically to a matched chunk: appended to
`relevantChunks` (`:403`), numbered by `buildJurisdictionContext` and pushed into
`references` (`src/lib/ai/rag.ts:441`), listed by `buildCitations` (`:462`), and
rendered by `SourceLadder` under the heading **"This rests on"**
(`src/components/design/SourceLadder.tsx:51`). And because it is in
`references`, `resolveProvenance` will resolve an attribution to it
(`src/lib/obligation-provenance.ts:37`), producing a `deadlineSource: 'policy'`
obligation citing the front matter of a policy that was never matched to the
question.

**What the administrator sees** A district rung reading e.g. *"Policy JLF:
Reporting Child Abuse and Neglect"* under "This rests on", when the excerpt
supplied was the policy's cover page — and potentially an obligation with a
countdown, an `AuthorityChip` (once FLOW-60 is fixed) and a citation to that
provision. The UI presents it as authority; the system only presents it as
representation.

**Proposed fix** Keep the representation guarantee — it is right — and separate
representation from citation. Two options, both small: (a) prefer a chunk with a
`sectionLabel` and skip `chunkIndex === 0` when the policy has more than one
chunk, and run the keyword scorer over the candidate set instead of taking the
first; (b) tag supplemental chunks and exclude them from `references` (so no
deadline can be attributed to them) and label them in the ladder as
"included because this incident implicates <category>" rather than as something
the answer rests on. Add a `take` to bound the query.

### FLOW-83 — the zero-citation line says "district" when nothing at any level matched

**Severity** minor

**Location** `src/app/chat/page.tsx:538-542`

**Finding** When `citations.length === 0` the page prints *"No matching district
policy was found for this question."* But zero citations means zero chunks from
**any** jurisdiction — `buildCitations` iterates every retrieved chunk
regardless of level (`src/lib/ai/rag.ts:462-489`). The prompt-side wording is
careful about exactly this distinction (`buildCoverageNote` splits `localOnly`
from `nothingAnywhere`, and `NO_POLICY_RETRIEVED_GUARD` says *"could not locate
the applicable district policy"* only after having said no policy text was
retrieved); the UI collapses it. Since `CoverageGapCard` renders only when
`categoriesWithoutLocalPolicy` is non-empty, an incident whose categories all
*have* local policies but whose search matched nothing gets this one line and
nothing else.

**What the administrator sees** "No matching district policy" — which reads as
"state and federal were consulted", when in fact nothing was.

**Proposed fix** Say what is true: "No policy text was retrieved for this
question, at any level. Anything above is general practice — confirm it with your
compliance officer." Distinguish it from the case where local specifically is
missing, which the gap card already covers.

---

## Open questions

Divergences that need a product decision rather than a fix. Numbered from OQ-6,
continuing `docs/roadmap.md`'s series.

**OQ-6 — what should closing an incident do to its open obligations?**
(FLOW-66.) Three defensible answers and the code implements none of them
deliberately: (a) closing is blocked, or warned about, while any obligation is
open — the strictest reading of "obligations are the product"; (b) closing
discharges nothing but removes the obligations from the queue and the "N things
are late" count, on the grounds that the administrator has asserted the matter is
finished; (c) closing changes nothing, which is today's behaviour — a closed
incident keeps demanding action and keeps inflating the headline. (c) is
currently reached by omission rather than by decision, and it makes the queue
un-emptyable. This also decides whether `GET /api/obligations` should return the
incident's status.

**OQ-7 — is `deadlineSource: 'model'` a state the queue should surface, or a
state it should surface *more*?** OQ-5 decided "keep the obligation, keep the
urgency, mark the provenance", and `DeadlineClock` implements the "no red or
amber" half. But with a thin library nearly every obligation is unverified, so
the home page's most likely reading today is "nothing is late" over a screen of
grey rows that each say "confirm this before acting" — the urgency OQ-5 set out
to preserve is preserved in the countdown text and removed from every aggregate.
Is the intended product (a) as decided, with FLOW-68's grouping bug fixed and
unverified rows given their own visible section and their own count; (b) a
distinct third tone for unverified-and-past-due, which is neither "late" (the
system cannot substantiate that) nor "fine"; or (c) a headline that leads with
the unverified count when it dominates? This is the question a real incident
(roadmap step 6) will answer, and it should be asked explicitly rather than
inherited from the filter placement.

**OQ-8 — should an incident's classification be correctable?**
`docs/roadmap.md` lists *"Change classification"* under "Deliberately not
doing — no endpoint". FLOW-51 and FLOW-52 both turn that into a permanent wrong
record: a parse failure stamps `other` forever, and a mid-flight failure stamps a
type with no obligations forever. Fixing those two removes the *common* routes
into a bad stamp, but not all of them — the model can also simply classify
wrongly, and `abuse_neglect` vs `other` is the highest-stakes call this tool
makes. Does the pilot want (a) a re-classify action that re-runs both phases,
(b) an admin-only override of `incidentType` (the schema and
`updateIncidentSchema` already permit it — only the UI is missing), or (c) to
hold the line on "no endpoint" and accept that the fixes above are the whole
remedy?

**OQ-9 — is `.doc` a supported policy format?** (FLOW-72.) The allowlist and the
upload UI say yes; the processor treats it as UTF-8 text under a comment saying
"for now". Dropping it is a one-line change and rejects real district documents;
supporting it properly needs an extractor. The decision belongs with whoever
knows what the district's policy files actually are.
