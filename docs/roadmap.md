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
| Unit tests | No runner exists. The pure functions — `describeDeadline`, `splitIntoChunks`, `assessCoverage`, `handlePrismaError`, the zod schemas — have no coverage, and this is where a silent regression would **misstate a statutory deadline** |

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
