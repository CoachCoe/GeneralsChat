# Roadmap

**This is a living document — edit it in place.** This repo previously
accumulated four status files that all drifted out of date, so keep this one
current or delete it. The dated audit and history records are untracked working
documents; nothing here should link to them.

Last reviewed: 2026-09-10. Context: entering a single-user pilot.

---

## Now

### ~~1. Clear the six pre-fix test incidents~~ — **done 2026-09-01**

Cleared: 6 incidents, 12 conversations, 32 obligations. Policies, chunks and
users untouched and verified. A full JSON backup was taken first, outside the
repo — ask before assuming it is still around, it lives in a session scratch
directory rather than anywhere durable.

They were fragments of a single demo narrative from 2025-11-03, each message
landing as its own incident, all titled with `generateIncidentTitle`'s
`New Incident Report` fallback — so they were also evidence that conversation
threading and title generation were both broken then.

This also surfaced a coverage gap: the queue had only ever been tested with a
non-empty fixture, and clearing production put it in the one state nothing
asserted. There is now a test for the empty queue.

### 2. Rotate the admin password — *maintainer*

The password generated for `demo@example.com` during pilot enablement appears in
a session transcript.

```bash
npm run user:create -- --email demo@example.com --name "..." --role admin --password "..."
```

### 3. Load the real district policies — *in progress*

**Loaded 2026-09-01 (bullying, the first test subject):**

| Policy | Jurisdiction / category | Chunks |
|---|---|---|
| Policy JICK: Bullying Prevention — Pupil Safety and Violence Prevention | district / bullying | 8 |
| SAU 24 School Bullying Investigation Form (July 2026) | district / bullying | 3 |

Two judgement calls worth knowing:

- **`District Procedure bully form.docx` was not loaded.** It is a superseded
  revision of the same SAU 24 form: it cites "RSA 193**:**F" (the statute is RSA
  193**-**F) and lacks HB108, the cross-district reporting requirement, and the
  July 2026 JICK revision. Loading it would put a superseded form with a wrong
  statutory citation into retrieval, which is exactly what deactivation exists
  to prevent.
- **The old "School District Bullying Prevention and Intervention Policy" was
  deactivated.** Its own text calls it `Policy Number: DISC-001`, a code that
  does not exist — it was synthetic sample data, and it would have competed with
  the real JICK for every bullying query.

Still to load, in the order that gates guidance:

Guidance quality is entirely a function of this library. Each policy needs a
**jurisdiction** (who issued it) and a **category** (what it covers) — retrieval
matches on category, so anything loaded as `other` will never be found.

1. `mandatory_reporting` — retrieved for **every** incident regardless of type
2. `suicide_prevention` — shortest statutory clocks
3. `restraint_seclusion`, `title_ix` (district-level; only a federal one is
   loaded), `discrimination`
4. the rest

Load one with:

```bash
npm run policies:load -- --file <path> --title "..." \
  --jurisdiction district --category mandatory_reporting --effective YYYY-MM-DD
```

Dry run by default; `--apply` writes, `--replace` supersedes an existing policy
of the same title and purges its old chunks from the vector store.

### ~~4. Policy-coverage report~~ — **done 2026-09-01**

`npm run policies:coverage`. Two views: what a real incident gets today, and
what to load next. Logic lives in `src/lib/policy-coverage.ts`, derived from the
same `categoriesForIncidentType` retrieval uses, so the report cannot drift from
what the system actually does. `--check` exits non-zero if any active policy is
unretrievable, so it can gate a deploy.

It counts a policy as coverage only if it is **active and has chunks** — a row
with no chunks is invisible to retrieval, so counting it would claim coverage
the system cannot deliver.

**What it found immediately:** `mandatory_reporting` has *nothing loaded at
all*, and it is retrieved for every incident regardless of type. So every
incident — including a fully-covered bullying one — currently gets no
mandatory-reporting policy. That is the single highest-value document to load
next.

Current state: 4 retrievable policies, 16 chunks, 0 embedded. 2 of 20 categories
have a local policy. Bullying is fully covered; Title IX has federal only.

### ~~5. Persist the incident-page summary~~ — **done 2026-09-01**

Both summary endpoints are now thin
adapters over `generateIncidentSummary` in `src/lib/ai/incident-summary.ts`;
they were two implementations of one feature that had drifted apart, with only
one of them storing its result.

Doing it surfaced a second problem worth more than the first. Summaries were
being stored as `sender: 'assistant'`, so every later chat turn **replayed the
summary back to the model as conversation history** — paying for its own
previous output and crowding the context with a restatement of what was already
there. Summaries now have their own sender: excluded when building LLM context,
included when rendering the record, and labelled "Summary generated" in the
incident timeline.

---

### ~~5a. Cite the specific provision, not just the policy~~ — **done 2026-09-01**

Guidance cited whole policies: *"Policy JICK: Bullying Prevention"*. It now
cites the provision the guidance actually rests on, with the statute that
provision implements — `JICK §D — Procedures for Reporting Bullying
(RSA 193-F:4, II(f) - (h))` — the way a citation works in a paper.

`src/lib/policy-sections.ts` parses lettered sections and the RSA references in
their headers; `splitPolicyIntoSectionedChunks` chunks *within* a section so no
chunk straddles two provisions and every chunk can name its own. Retrieval
prefixes each excerpt with its reference and the prompt instructs the model to
quote references exactly and never invent one. Parsing is deliberately
conservative — fewer than two sections, out-of-order labels, or lowercase list
items all fall back to policy-level citation, because a wrong section on a
statutory obligation is worse than none.

Three things this turned up:

- **Stored policy text had no newlines.** It was extracted before the
  `cleanText` fix, so section structure was unrecoverable from the database.
  Re-indexing now re-extracts from the source file, and adopts that file into
  `uploads/policies/` so provenance no longer depends on the operator's
  downloads folder still existing.
- **`policies:reindex` deleted chunks before it could fail.** Running it against
  a database missing the new columns left all five policies at zero chunks and
  retrieval returning nothing. It now refuses to touch anything until it has
  probed that the schema is current. The delete-then-add is still not
  transactional — `addPolicyDocument` writes through the global client — so the
  preflight is the guard, not a fix for the underlying window.
- **PDF headers wrap.** JICK §H is one header across two lines; taking only the
  matched line cited it as ending on "Disciplinary". Headers now rejoin across a
  single continuation line.

All 11 JICK sections (A–K) parse, 9 of them carrying their RSA reference.

---

### Audit 2026-09-01 — **done; all six blockers now closed**

Six parallel read-only passes; 142 findings, 6 blockers. Five fixed at the time,
the sixth on 2026-09-02.

The one not fixed is the important one, and it changes what step 6 below is
for: **obligation deadlines are produced by a classification call that is
never shown a policy.** `classifyIncident` is invoked with two arguments, so
its `policyContext` parameter is undefined and the model is asked to recall
New Hampshire law. Until that is fixed, every countdown in the product is the
model's guess, and `ComplianceAction` has no `policyId` to reconcile it
against.

The fix needed a product decision first — **OQ-5: what should the product do
when the library cannot support a deadline?** Suppress the obligation, show it
without a countdown, or show it marked unverified. **Decided and shipped
2026-09-02**; the blocker is closed and the decision is recorded below. All six
are now fixed.

Three other things that were true and are no longer:

- A policy row with no chunks used to *cancel* the coverage gap for its
  category, so one bad upload silently removed a safety warning.
- An `other`-classified incident — the classifier's own failure default —
  retrieved no mandatory-reporting policy and reported no gap.
- The cross-user authorization tests attempted ids that do not exist, so
  deleting `incidentScope` from the incident and obligation routes left the
  suite green — a reporter able to read and rewrite every incident in the
  district, with a passing test.

---

## Decisions on the audit's open questions — 2026-09-01

The 2026-09-01 audit logged five questions rather than guessing them. All five
are now decided. Two are done; three are queued below.

**OQ-1 — amber for coverage gaps: allowed. Done.** `CLAUDE.md` said colour meant
a deadline state and nothing else; `theme.css` and the redesign brief recorded
amber-for-gaps as deliberate. The rule was widened rather than the components
repainted: a coverage gap is the same class of signal as a deadline — an
actionable compliance warning — not decoration.

**Correction, 2026-09-08.** This entry used to claim severity chips and error
states had lost their colour in the 2026-09-01 audit. They had not; all three
sites were unchanged when the 2026-09-08 audit looked. They are repainted now,
along with three green `--color-met` decorations on the admin pages and the
button component's red `destructive` variant.

**OQ-3 — `other` retrieval: the guarantee reading, confirmed. Taxonomy gap
fixed.** `categoriesForIncidentType` stays empty as a *search filter*;
`guaranteedCategoriesFor` supplies representation and coverage. Behind that
sat a worse problem: the taxonomy had no value for abuse or neglect, so *"a
student told the counsellor her stepfather hits her"* classified as `other` —
the highest-stakes report this tool handles, on the shortest clock, in the
bucket that means "we could not tell". `abuse_neglect` is now a first-class
incident type, mapped narrowly to `mandatory_reporting`, and treated as
CONFIDENTIAL.

**OQ-5 — deadlines with no policy behind them: keep the obligation, keep the
urgency, mark the provenance. Done 2026-09-02.**

Suppressing the obligation is the worst option: "you must report this to DCYF"
is worth saying even when the library cannot cite a deadline, and *nothing*
is how a mandated report gets missed. Dropping the countdown loses the urgency,
which for a 24-hour report is the part that matters. So:

- `ComplianceAction` gains `policyId`, `citation` and `deadlineSource`
  (`'policy' | 'model'`). It carries none of these today, which is why this is
  a schema change and not a UI tweak.
- Two-phase classification: after retrieval, re-derive obligations with
  `policyContext` — the parameter exists and is passed `undefined` today. A
  deadline traceable to an excerpt is `policy`; everything else is `model`.
- **A model-sourced deadline gets no red or amber countdown**, and the home
  page's "N things are late" counts only policy-backed ones. That headline is
  currently built on the model's recall of NH law, and it is the number in the
  product that most looks like fact.
- `ObligationRow` already renders an `AuthorityChip` and citation whenever they
  are present. The data has simply never existed.

A failed classification now throws rather than returning a default, so
`incidentType` stays null and the next turn retries. The old default (`other` / `low` / no obligations) was written
permanently, so an API timeout and a genuine "we could not tell" produced the
same record — on the incident where the system knew least.

What this does **not** do: verify that the deadline the model attributed to an
excerpt is the deadline that excerpt actually states. It verifies that the
excerpt exists and was supplied. A model that cites a real excerpt for a number
that excerpt does not contain still produces a policy-backed row. Closing that
needs the deadline parsed out of the provision text, which is a bigger piece of
work and wants real incidents to calibrate against — step 6.

**Half of that closed 2026-09-09.** A provision containing no time expression
at all cannot be the source of a number of hours, and that much is decidable
from the text without any calibration: `statesATimeLimit` asks the question and
`resolveProvenance` demotes an attribution that fails it. The citation survives
the demotion, because the obligation does rest on the provision named — only the
claim about the clock is withdrawn. The check is one-directional by
construction: there is no input on which it promotes a guess to policy-backed,
so a miss leaves the previous behaviour untouched. Matching a specific number to
a specific obligation is still the remaining half, and still wants step 6.

**OQ-2 — canonical ingestion: `/api/admin/policies/upload`. Done 2026-09-02.**
Delete `POST /api/policies`; keep `POST /api/admin/policies` for the paste-text
path the admin UI uses. The deleted route is called by no client, sits outside
the `/api/admin` prefix so `isAdminPath` does not cover it, and was the route
the first audit's arbitrary-write finding went through. It is documented in
README, so this needs a doc change — that is the decision, not an obstacle.
Standardised the uploads directory at the same time. There were four
resolutions across six call sites, and two were wrong in ways only a
deployment shows:

- `join(cwd, UPLOADS_DIR, 'attachments')` prefixes the working directory to an
  absolute path, so `UPLOADS_DIR=/app/uploads` resolved to
  `/app/app/uploads/attachments` — **outside the Azure Files mount**. Upload and
  download shared the same wrong expression, so the app worked perfectly until
  the first redeploy, at which point every attachment was gone with no error.
  This would have shipped with the Azure work.
- `join(cwd, 'uploads', 'policies')` ignored `UPLOADS_DIR` entirely, so
  `policies:reindex`'s containment check never matched and it re-copied every
  source file on every run.

All six now go through `uploadsRoot()` / `policyUploadsDir()` /
`attachmentUploadsDir()` in `src/lib/uploads.ts`, with tests covering the
absolute case. `GET /api/policies` was projected at the same time: it had been
returning whole rows, including absolute server paths, to any authenticated
user.

**OQ-4 — the admin-editable system prompt: inverted. Done 2026-09-02.** The row replaces the in-code prompt for the chat path only —
not `classifyIncident`, not `generateChatSummary` — so an admin editing "the
system prompt" changes one of three calls and silently drops the
citation-discipline and clarifying-question paragraphs. Prompt edits are
audited, which closes the accountability half. The prompt is now two parts. `CORE_DIRECTIVES` lives in code and is prepended
to every guidance call: answer only from the supplied excerpts, never invent a
code or a deadline, do not present state law as district procedure, one
clarifying question at a time, and say plainly when the policy does not cover
something. The editable row supplies the *advisor profile* — tone, emphasis,
district-specific context — and is appended after it. The retrieval and
coverage guards stay last, so they are the most recent instruction the model
reads.

No data surgery was needed, and that was the point of looking first. The active
row turned out to be a tuned persona ("warm and supportive", "always ask one
question at a time", "never make up any next steps") rather than district
facts, which is exactly what the editable half should own. It keeps working
unchanged; it simply can no longer displace the core.

The UI said "System Prompt Editor", which implied it governed the whole system.
It is now "Advisor Profile", and the page states what is fixed in code and that
classification and summaries use their own prompts. Six unit tests pin the
property that matters: a profile instructing the model to "ignore all previous
instructions" and "answer confidently from your own knowledge" does not remove
the core, which is prepended, or the guards, which are appended.

The navbar closed alongside, since it is the same surface: "Policies" pointed at
`/admin/policies` for every role, so a reporter clicking it was bounced to the
home queue with no explanation and the read-only library README documents was
reachable only by typing the URL. It now points at `/policies` for everyone —
the page links admins onward — and the admin-only "Advisor" link is gated on
role. Two e2e tests, one per role, because gating a link must not hide it from
the role it exists for.

---

### ~~Rate limiting~~ — **done 2026-09-02**

`/api/auth/*` is public, and `src/auth.ts` runs `bcrypt.compare` at cost 12
deliberately even for an address with no account — so every attempt cost
roughly a quarter-second of *blocking* CPU on a single event loop. A few
hundred a minute made the app unavailable to every administrator while also
giving unbounded password guessing. `rateLimitError()` had been exported since
the first audit and imported by nothing.

Sign-in is limited by client address in `middleware.ts` (10 per 5 minutes),
because it is NextAuth's own route and there is no handler of ours to put it
in. Chat, summaries and uploads are limited by user id in their handlers — the
bound there is on what one account can spend, and keying by address would put
every administrator behind a school's NAT on one counter.

**The counters are in this process's memory.** That is exact at one replica,
which is what the Container Apps config pins, and wrong at more than one: with
N replicas the effective limit becomes N times what is configured. It degrades
quietly rather than failing, so it must move to a shared store *before*
`maxReplicas` is raised.

`src/lib/rate-limit.ts` deliberately imports nothing. `middleware.ts` runs on
the Edge runtime, and an early version had it import `errors.ts`, which pulled
Prisma into that bundle and failed the build. The counter is pure; the response
helper lives with the other response helpers.

Seven unit tests, and an e2e that floods the sign-in endpoint and asserts a 429
with a `Retry-After` that leaks nothing about whether the account exists —
verified to fail when the limiter is removed.

---

### ~~Upload memory bound~~ — **done 2026-09-02**

Both upload routes called `request.formData()` and *then* checked `file.size`,
under a comment saying the check ran "before buffering the body". It did not.
`formData()` reads the whole request into memory to parse it, so the size limit
rejected an oversized file only after the process had already paid for it. The
limit was accurate and bought nothing: a few concurrent multi-hundred-megabyte
POSTs from one signed-in account could take the process down, which at the one
replica Container Apps pins is every administrator.

`readCappedFormData` in `src/lib/uploads.ts` now reads both bodies under a hard
ceiling of the file limit plus a 64KB multipart envelope. Content-Length is
checked first because it is free and rejects the honest case without reading a
byte, but it is not sufficient on its own — it is absent under chunked transfer
encoding and it can simply lie — so the body also goes through a counter that
errors the stream the moment the ceiling is passed. Erroring is what makes it a
bound rather than a measurement: the parser stops and we stop reading the
socket.

`assertWithinSizeLimit` stays, and its comment has been corrected to say what it
actually is: the exact per-file limit, enforced once the part is parsed. The two
do different jobs and the old comment claimed the second did the first's.

Nine unit tests. The one that matters asserts the property the change exists
for — a body offering 12MB and a body offering 1.2GB, both declaring 512 bytes,
are read to exactly the same bounded point — so what a request costs is decided
by the ceiling and not by the client. Verified to fail: removing the counting
stream fails three, removing the Content-Length check fails one.

---

### Audit 2026-09-08 — **12 blockers found, 12 fixed**

Six parallel read-only passes plus main-thread findings: 119 findings, 14 raw
blockers collapsing to 12 distinct.

Three themes, all variants of one thing — **the product's most load-bearing
claims were the least verified**:

1. **OQ-5 was honoured in one component and bypassed everywhere else.** An
   unverified obligation overdue or due today was rendered in *no* group on the
   home queue, so a 24-hour mandated report with no citable provision vanished
   from the page an administrator opens to find out what they are late on. Every
   surface except `DeadlineClock` painted and counted unverified deadlines red.
   The home headline stated "You're clear. No obligations are outstanding." in
   40px serif from an empty array — before the first fetch resolved, and
   permanently after a failed one.
2. **A transient failure could become a permanent record, in two more places.**
   The classification default was removed one layer too high:
   `claudeService.classifyIncident` still returned a fabricated
   `other`/`medium` classification with two invented
   24-hour obligations on any parse failure. And because `incidentType` was
   written before the obligations were derived, any failure in between left a
   classified incident with **zero** obligations and nothing that would ever
   retry.
3. **The safety-critical arithmetic and the safety-critical scripts were
   unguarded.** No test anywhere read a `dueDate` produced from a `dueInHours`,
   so a 60× unit error passed all 210 tests. `scripts/clear-incidents.ts`
   deleted every incident and the whole audit log from whatever `.env` pointed
   at, with no dry run and no database-name guard, and `CLAUDE.md`'s warning
   list omitted it. `reuseExistingServer: false` did not prevent the e2e suite
   running against a foreign server — reproduced, and the same-app variant would
   have driven production.

What the audit also confirmed, which is worth as much: no security blockers. No
cross-user data access, no auth bypass, no path traversal, no raw SQL, and no
secret or student record anywhere in git history on any ref. All six `CLAUDE.md`
invariants describe real code.

What was deferred is filed as issues rather than left in a document — #41 to
#55. Security: the `x-forwarded-for` trust model (#41), the Azure Postgres
perimeter (#42), the CSP's `'unsafe-inline'` on `script-src` (#43), four smaller
findings (#44), the DNS-rebinding window (#45). Open questions needing a product
call: #46 to #51. Then the coverage gaps (#52), the duplicate implementations
that have already drifted (#53), unreferenced code (#54), and two spec minors
(#55). The hardening table below carries the security items in full.

**#46 is the one to read first if you are picking this up cold** — B3 shipped a
fourth queue group provisionally, it is live in `src/app/page.tsx`, and this is
what confirms or replaces it.

The audit's own findings and pass records stay in git history at `cc759fc`
(`git show cc759fc:docs/audit/2026-09-08-findings.md`).

### 2026-09-09 — provenance scoped to the turn, and two gaps closed

Four changes, all of them started by running the app and reading what it
actually put in front of an administrator.

**The provenance block is shown only on turns that give guidance.** The "This
rests on" ladder and the coverage-gap card hung under *every* assistant turn,
driven by what retrieval returned rather than by what the answer used — so a
turn whose entire content was "can you describe what happened between them?"
was shown a ladder naming three policies it never touched, and the amber gap
card repeated identically until it read as page furniture rather than a
warning. Retrieval cannot decide this: it knows what was fetched, not what was
used, and those differ on exactly the turns worth catching. The model labels its
own turn and the label is stripped before display, carried as a marker line
rather than by wrapping the reply in JSON so that a parse failure cannot cost an
administrator the answer text. A missing, unreadable or drifted label resolves
to `guidance` and the block is shown: a guidance turn wrongly silenced shows a
statutory deadline with no citation and no coverage warning, while a question
turn wrongly labelled shows only the noise this removes.

**Provenance survives reopening an incident.** `GET /api/chat/[incidentId]`
returned id, type, content and timestamp, so every citation the guidance rested
on was dropped on reload — provenance lived for as long as the browser tab and
no longer, on a tool whose answers exist to be checked. Citations were already
stored, so reading them back is a projection rather than a schema change, and
`readStoredTurn` never throws: a conversation has to load when one row in the
middle of it cannot be read. Coverage is recomputed through
`ragSystem.coverageFor`, the same call the live turn makes, because the gap it
reports is "the district has no local policy for this" and an administrator
reading a month-old incident needs that answered as it stands now — loading the
missing policy should clear the warning everywhere, not leave it frozen into
every turn that predates the upload.

**A deadline stops being policy-backed when the provision states no time.**
Recorded above against OQ-5, which is where the gap was named.

**Role revocation exists.** Recorded in the hardening table below, which is
where it was tracked.

Two things found while running the app and fixed in passing. `middleware.ts`
sat at the repo root, which `next dev --turbopack` ignores when the application
lives in `src/` — so in development the deny-by-default gate did not run at all,
and neither did the sign-in limiter. Production builds were unaffected, which is
why the e2e suite never saw it; the divergence was the problem, because anything
checked locally about route protection was saying nothing. And the chat sidebar
entry was a clickable `div`: the only route back to a past incident, unreachable
by keyboard and announced as nothing.

### 2026-09-10 — provenance moved to a rail, and the two documents made reachable

**Provenance is a rail beside the transcript, not a block under each turn.**
The ladder and an amber coverage card sat under every answer, between the
reader and the next thing the assistant said, and the gap was stated three
times in one turn: in the answer's own prose, in the zero-citation notice, and
in the card. The rail names what the *incident* rests on — sources accumulate
across turns, deduplicated, with a policy's provisions collected as later
answers lean on them — while coverage is taken from the latest turn that knows
it, because coverage describes the incident and classification is refined as
the administrator says more. A clarifying question still contributes nothing.
The gap is now told once, as a dashed local rung labelled `gap`, or as the
scope note when nothing the incident is about is loaded at all. The decision
lives in `src/lib/provenance.ts`, unit tested, because the page itself is
out of reach of both gates.

**The summary and the report are documents with addresses.** Both were
reachable only by scrolling the transcript that produced them. Each now has a
page — `/incidents/[id]/summary` and `/incidents/[id]/report` — linked from a
`Documents` column at the top of the incident, and both print: `theme.css`
re-lights the token layer for print rather than restyling components, since the
screen palette is white on near-black.

**The report is the district's own form, filled from the record.** Parsed out
of the loaded document rather than modelled in code, because a mandatory report
is a legal filing and a plausible form the district never adopted is worse than
none. Only facts the record holds are filled in, each labelled with where it
came from; names, ages, grades and dates of the incident stay blank, because
they live in the reporter's prose and inferring them from it is how a report
names the wrong child. The completion deadline fills only from a policy-backed
obligation — counting ten school days needs a holiday calendar the system does
not have. An unclassified incident gets no form at all rather than a guessed
one, and a type with no form loaded is told plainly.

---

## Next — gated on real use

### 6. Run a real incident end to end, and watch it — *maintainer*

This is the actual gate on everything below. One real incident will teach more
than another week of building against assumptions, and the two most uncertain
design questions — how reliably obligations can be attributed to a policy, and
whether chat is the right intake at all — are exactly what it will answer.

### ~~7. Link obligations to their source policy~~ — **done 2026-09-02, by OQ-5**

Everything this step asked for arrived with OQ-5 rather than after step 6:
`policyId`, `citation` and `deadlineSource` on `ComplianceAction`, obligations
derived in a second pass with the retrieved excerpts in hand, and
`resolveProvenance` attributing each one to a numbered excerpt that was actually
supplied. `ObligationRow` renders the `AuthorityChip` and the citation, which it
could always do — the data had simply never existed.

It landed early because it is the same schema change: deciding what to do about
a deadline with no policy behind it *requires* the row to be able to name the
policy behind it. The sequencing argument was not wrong, it was answered — the
citation is best-effort, because the alternative is dropping obligations.

**Correction, 2026-09-08.** "`ObligationRow` renders the `AuthorityChip` and the
citation, which it could always do — the data had simply never existed" was half
true. The citation arrived; the jurisdiction did not, because no endpoint ever
projected it, so the chip had never rendered once. Both `GET /api/obligations`
and `GET /api/incidents/[id]` now join through `policyId` for it.

Two more things OQ-5 asked for were only half delivered, and are fixed as of
2026-09-08. "A model-sourced deadline gets no red or amber countdown" held in
`DeadlineClock` and in no other surface — the incident page's "N overdue" pill,
its stamp bar, the timeline dots and the incidents-list countdown all painted
and counted unverified deadlines (B5). And an unverified obligation that was
overdue or due today matched none of the home queue's three groups, so it was
rendered *nowhere* — the outcome this decision exists to prevent (B3).

The half deliberately still waiting on step 6 is the harder one, restated here
so it is not read as finished: attribution verifies that the excerpt exists and
was supplied, **not** that the excerpt states the deadline the model attributed
to it. A model citing a real provision for a number that provision does not
contain still produces a `policy`-sourced row. Closing that means parsing the
deadline out of the provision text, and that wants real incidents to calibrate
against.

**Narrowed 2026-09-09.** A provision that states no time *at all* is now caught,
which needs no calibration. What still wants step 6 is the case where the
provision does state a time and the model derived a different one: an excerpt
runs to a thousand characters and may carry several provisions, so a clock found
anywhere in it currently satisfies the check.

---

## Before anyone beyond the pilot user

### 8. Hardening

| Item | Why it can wait, and why it can't wait forever |
|---|---|
| ~~Rate limiting~~ | **Done 2026-09-02.** It turned out not to be a can-wait item: sign-in ran bcrypt at cost 12 even for an address with no account, so a few hundred attempts a minute made the app unavailable to every administrator. Sign-in is limited by address in `middleware.ts`, chat and uploads by user id. The counters are per-process, so they must move to a shared store before `maxReplicas` is raised |
| ~~Upload OOM~~ | **Done 2026-09-02.** `readCappedFormData` bounds both upload bodies before they are parsed, by Content-Length and then by a counting stream that errors past the ceiling. Recorded above |
| DNS rebinding (partial) | Needs a hostname allowlist, which is a decision about permitted policy sources (**OQ-10**). The address blocklist was narrowed on 2026-09-08 — IPv4-mapped IPv6 in hex notation reached loopback and the cloud metadata endpoint straight through it — but the resolve-then-connect window is still open |
| CSP `script-src 'unsafe-inline'` | **Added 2026-09-08.** The app had no security headers at all; it now sends a CSP with `default-src 'none'`, `connect-src 'self'` and `frame-ancestors 'none'`, plus HSTS, nosniff and `Referrer-Policy: same-origin`. `script-src` still allows `'unsafe-inline'` because the App Router inlines bootstrap and flight data; removing it needs a nonce plumbed through `middleware.ts` |
| `x-forwarded-for` trust | The sign-in limiter keys on entry zero, which is client-written whenever an upstream *appends*. Correct behind Container Apps ingress; attacker-supplied under the `docker-compose.yml` arrangement, which has no proxy at all. Fixing it properly means declaring how many proxy hops to trust — an infrastructure decision, and the reason it is recorded rather than guessed |
| ~~Role revocation~~ | **Done 2026-09-09.** There had been no mechanism at all: `role` was read off the JWT and the `jwt` callback only writes it at sign-in, so a demotion took effect no sooner than the token expired — and `updateAge` rolls the token forward on activity, so an administrator demoted mid-shift kept access for as long as they kept working. `requireUser` re-reads the row on every guarded request; a deleted account is 401, not 403. `middleware.ts` still gates `/admin` on the token's role because Prisma cannot run on the Edge, but that is a page shell and every `/api/admin` handler re-checks against the row |
| ~~Unit tests~~ | **Done 2026-09-01.** Vitest, 79 tests over the pure logic: `describeDeadline`, `splitIntoChunks`, `cleanText`, `buildCoverageReport`, the upload path guards, the zod schemas, and the incident→category mapping. `npm run test:unit` runs in under a second; `npm test` runs unit then e2e, and CI runs unit before installing a browser. Writing them found three real bugs — see the audit record |

---

## Deliberately not doing

Kept here so it does not creep back in without a decision. All of it needs a
product call, none of it blocks the pilot, and several will look different after
step 6.

| Item | Blocked on |
|---|---|
| Classification confidence score | No such data. A hardcoded `0.9` was removed during the audit precisely because it was fake |
| Human-readable incident ids (`INC-0241`) | A sequence column |
| Cross-incident gap aggregation ("3 gaps") | A decision on what a district-level gap report is for |
| "Flag to the district" | Entirely new concept, no model |
| "Change classification" | No endpoint |
| Intake record panel (design 1e) | Needs per-field extraction the classifier does not do |
| Week view (design 1b) | Deferred by the design's own recommendation |
| Admin prompt authority | Deferred for the single-user pilot; revisit before a second admin account exists |
| `/incidents/pending` semantics beyond outstanding actions | Resolved as "outstanding compliance actions"; revisit only if that proves wrong in use |
| Vector search | Needs `OPENAI_API_KEY` **and** a running Chroma server. The keyword fallback works and is category-filtered; embeddings can be backfilled later with `policies:reindex` |

---

## Done

In short: the 2026-08-31 audit (153 findings) and its remediation, authentication and authorization, the policy
jurisdiction/category split, the UX redesign against the Claude Design brief,
CI, and pilot enablement (production migrated, re-indexed, retrieval verified
against real data).
