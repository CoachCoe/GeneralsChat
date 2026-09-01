# Roadmap

**This is a living document — edit it in place.** It is the one file here that
is meant to change; `docs/audit/` and `docs/history/` are dated records that
should not be rewritten. This repo previously accumulated four status files that
all drifted out of date, so keep this one current or delete it.

Last reviewed: 2026-09-01. Context: entering a single-user pilot.

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
  statutory citation into retrieval — the exact SPEC-5 failure mode.
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

SPEC-35 and DEAD-12 closed together. Both summary endpoints are now thin
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

### Audit 2026-09-01 — **done, with one blocker deferred**

Six parallel read-only passes; 142 findings, 6 blockers. Five fixed. See
[`docs/audit/2026-09-01-findings.md`](./audit/2026-09-01-findings.md) and
[`-work-completed.md`](./audit/2026-09-01-work-completed.md).

The one not fixed is the important one, and it changes what step 6 below is
for: **obligation deadlines are produced by a classification call that is
never shown a policy.** `classifyIncident` is invoked with two arguments, so
its `policyContext` parameter is undefined and the model is asked to recall
New Hampshire law. Until that is fixed, every countdown in the product is the
model's guess, and `ComplianceAction` has no `policyId` to reconcile it
against.

The fix needs a product decision first — **OQ-5: what should the product do
when the library cannot support a deadline?** Suppress the obligation, show it
without a countdown, or show it marked unverified. Settle that and the
two-phase re-classification is straightforward. The UI has been corrected in
the meantime so it no longer claims the deadline came from the policy.

Three other things that were true and are no longer:

- A policy row with no chunks used to *cancel* the coverage gap for its
  category, so one bad upload silently removed a safety warning.
- An `other`-classified incident — the classifier's own failure default —
  retrieved no mandatory-reporting policy and reported no gap.
- The cross-user authorization tests attempted ids that do not exist, so
  deleting `incidentScope` from the incident and obligation routes left the
  suite green. That is SEC-7 with a passing test.

---

## Decisions on the audit's open questions — 2026-09-01

The 2026-09-01 audit logged five questions rather than guessing them. All five
are now decided. Two are done; three are queued below.

**OQ-1 — amber for coverage gaps: allowed. Done.** `CLAUDE.md` said colour meant
a deadline state and nothing else; `theme.css` and the redesign brief recorded
amber-for-gaps as deliberate. The rule was widened rather than the components
repainted: a coverage gap is the same class of signal as a deadline — an
actionable compliance warning — not decoration. The rule still bites, which is
why severity chips and error states lost their colour in the audit (SPEC-44).

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
urgency, mark the provenance.** *(Queued — this is the B1 fix.)*

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

Also fix `FLOW-35` alongside it: a failed classification should leave
`incidentType` null so the next turn retries, rather than stamping `other`
permanently with no way to correct it.

**OQ-2 — canonical ingestion: `/api/admin/policies/upload`. Done 2026-09-02.**
Delete `POST /api/policies`; keep `POST /api/admin/policies` for the paste-text
path the admin UI uses. The deleted route is called by no client, sits outside
the `/api/admin` prefix so `isAdminPath` does not cover it, and is the route
SEC-3 exploited. It is documented in README, so this needs a doc change — that
is the decision, not an obstacle. Standardised the uploads directory at the same time
(DEAD-62). There were four resolutions across six call sites, and two were
wrong in ways only a deployment shows:

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
absolute case. SEC-27 closed alongside: `GET /api/policies` returned whole
rows, including absolute server paths, to any authenticated user.

**OQ-4 — the admin-editable system prompt: invert it, but not yet.** *(Queued,
lowest priority.)* The row replaces the in-code prompt for the chat path only —
not `classifyIncident`, not `generateChatSummary` — so an admin editing "the
system prompt" changes one of three calls and silently drops the
citation-discipline and clarifying-question paragraphs. SEC-20 closed the
accountability half. The structural fix is to make the row an *appended*
district-context block with the compliance instructions in code. Until then the
UI label overstates what it controls; with one admin, that mislabel is the real
cost.

---

## Next — gated on real use

### 6. Run a real incident end to end, and watch it — *maintainer*

This is the actual gate on everything below. One real incident will teach more
than another week of building against assumptions, and the two most uncertain
design questions — how reliably obligations can be attributed to a policy, and
whether chat is the right intake at all — are exactly what it will answer.

### 7. Link obligations to their source policy — *~half a day*

An administrator currently sees *"Notify the superintendent — in 3h 18m"* with
no authority attached and no way to verify it. The whole proposition is *here is
your obligation and here is the law behind it*.

`AuthorityChip` is built and renders a citation the moment one exists. Needs
`policyId` + `citation` on `ComplianceAction`, and the classifier attributing
each action to one of the retrieved policies.

Step 5a makes this materially better than it would have been: an obligation can
now cite the provision it came from rather than the policy, so the chip can read
`JICK §D` instead of `Policy JICK`. The section label is already on the chunk
the guidance was drawn from, so attribution has something precise to attach to.

Deliberately after step 6: watching which obligations come back attributable
decides whether the citation is a required field or best-effort. Building it
blind risks designing for attribution that does not hold up.

---

## Before anyone beyond the pilot user

### 8. Hardening

| Item | Why it can wait, and why it can't wait forever |
|---|---|
| Rate limiting (SEC-11) | Irrelevant at one user; one signed-in account can still run up the Anthropic bill |
| Upload OOM (SEC-10, partial) | Size limits reject oversized files, but `request.formData()` buffers the body first, so a large POST still lands in memory |
| DNS rebinding (SEC-4, partial) | Needs a hostname allowlist, which is a decision about permitted policy sources |
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
| Admin prompt authority (SPEC-32) | Deferred for the single-user pilot; revisit before a second admin account exists |
| `/incidents/pending` semantics beyond outstanding actions | Resolved as "outstanding compliance actions"; revisit only if that proves wrong in use |
| Vector search | Needs `OPENAI_API_KEY` **and** a running Chroma server. The keyword fallback works and is category-filtered; embeddings can be backfilled later with `policies:reindex` |

---

## Done

Recorded properly in `docs/audit/`. In short: the 2026-08-31 audit (153
findings) and its remediation, authentication and authorization, the policy
jurisdiction/category split, the UX redesign against the Claude Design brief,
CI, and pilot enablement (production migrated, re-indexed, retrieval verified
against real data).
