# Roadmap

**This is a living document — edit it in place.** It is the one file here that
is meant to change; `docs/audit/` and `docs/history/` are dated records that
should not be rewritten. This repo previously accumulated four status files that
all drifted out of date, so keep this one current or delete it.

Last reviewed: 2026-09-01. Context: entering a single-user pilot.

---

## Now

### 1. Clear the six pre-fix test incidents — *needs a go-ahead*

Production holds **32 obligations, all of them overdue**, clustered at −302d,
−300d and −298d. They came from November 2025 test incidents, and the 22 sitting
together at −300d are the fingerprint of the index-pairing bug (FLOW-17) falling
through to its hardcoded three-day default.

So the home queue currently reads **"32 things are late."** — every one
fabricated. For a product whose entire headline is that sentence, this is the
first thing a pilot user will see and the first thing they will stop trusting.

Destructive, so it needs an explicit go-ahead.

### 2. Rotate the admin password — *maintainer*

The password generated for `demo@example.com` during pilot enablement appears in
a session transcript.

```bash
npm run user:create -- --email demo@example.com --name "..." --role admin --password "..."
```

### 3. Load the real district policies — *maintainer, in flight*

Guidance quality is entirely a function of this library. Each policy needs a
**jurisdiction** (who issued it) and a **category** (what it covers) — retrieval
matches on category, so anything loaded as `other` will never be found.

Load order by what actually gates guidance:

1. `mandatory_reporting` — retrieved for **every** incident regardless of type
2. `suicide_prevention` — shortest statutory clocks
3. `restraint_seclusion`, `title_ix`, `bullying`, `discrimination`
4. the rest

Currently nothing is loaded in the first two, so every incident reports a
coverage gap on them.

### 4. Policy-coverage report — *~30 min*

`npm run policies:coverage`: per category, which jurisdictions hold a policy and
which have no local one. Turns "there should be a district or school policy for
everything" into a checklist, and makes the sparse-library state legible while
the library is being filled.

### 5. Persist the incident-page summary — *~20 min, SPEC-35*

`POST /api/incidents/[id]/summary` generates a summary and writes nothing. A
user generates one, refreshes, and loses it — after paying for a
multi-thousand-token call. `/api/chat/summary` already does this correctly; copy
that behaviour.

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
