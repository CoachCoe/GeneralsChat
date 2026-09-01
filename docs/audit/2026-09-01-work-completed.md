# Audit remediation — 2026-09-01

**Reading note.** This is the record of what was done. The findings are in
[`2026-09-01-findings.md`](./2026-09-01-findings.md). The previous cycle is
[`2026-08-31-work-completed.md`](./2026-08-31-work-completed.md).

Branch `audit/2026-09-01`, cut from `dev` at `d62eb61`. 35 files changed,
+1376 / −186.

## Gates

All four pass from a clean build directory. CI runs exactly these.

| | before | after |
|---|---|---|
| `npm run typecheck` | 0 errors | 0 errors |
| `npm run lint` | 0 errors, 3 warnings | 0 errors, 3 warnings |
| `npm run build` | ✓ | ✓ |
| `npm run test:unit` | 97 | **114** |
| `npm run test:e2e` | 52 | **53** |

The 3 lint warnings are pre-existing and untouched (unused vars in
`scripts/test-phase3.ts` and `scripts/test-rag.ts`).

**No suppressions were introduced.** Verified by reading the whole diff:
no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`, no `any`
widening, no `.skip`/`.only`. `tsconfig.json`, `eslint.config.mjs` and
`.github/` are untouched.

**One assertion was removed** — `expect(Array.isArray(obligations)).toBe(true)`
in the cross-user obligation test, which was true for any successful GET. It
is replaced by an assertion that the foreign obligation is absent from the
caller's list, plus a real 404 on the foreign id. That is a strengthening; it
is called out here because removing an assertion otherwise looks like exactly
what this process forbids.

## What was fixed

Six blockers were found. **Five are fixed. One is a product decision and was
not guessed** (B1, below).

### The system no longer vouches for policy it does not have

**B2** — `assessCoverage` counted any active policy row as coverage with no
requirement that it have chunks. A row whose chunks are missing is invisible
to retrieval, so counting it suppressed the very gap warning that says the
library is empty. `policy-coverage.ts` already stated this rule for the
offline report; the live path that decides what the administrator is told was
more permissive than it. Production has been in exactly this state.

**B3** — `categoriesForIncidentType` returns `[]` for `other` and for
unclassified incidents. Correct as a search *filter*; it was also being used
as the guaranteed set, so `ensureCategoryRepresentation` short-circuited and
`assessCoverage` reported no gaps. An `other` incident retrieved no
mandatory-reporting policy and raised no warning — and `other` is the
classifier's own failure default, so that was the state an incident landed in
precisely when the system knew least. Split into `guaranteedCategoriesFor`.

**B4** — the summary prompt had no retrieval guard and still named `"JICK"`,
`"ACAC"`, `"JLF"` as examples, which is what the guidance path was fixed for:
with nothing retrieved they are the only codes the model has to reach for. The
summary is persisted and rendered in the incident timeline, so it is the
artefact most likely to be printed and filed. The guard is now a shared
constant rather than inlined in one of its two callers.

**FLOW-34** — the coverage card printed *"It is sound"* over guidance whose
authority may not exist, because it rendered from `categoriesWithoutLocalPolicy`
alone. `byCategory` carried the distinction between "only the local procedure
is missing" and "the library holds nothing at any level", and no consumer read
it. Card and prompt now separate the two.

**B5** — no policy write path validated jurisdiction or category; all four
defaulted the misses. Retrieval matches on category, so a typo makes a policy
unfindable — and because `assessCoverage` queries the same column, the system
then reports a coverage gap for an area the district has in fact loaded. A bad
jurisdiction is worse: the excerpt is dropped from the model's context while
`buildCitations` still lists it as a source. Also: an extraction producing no
text no longer becomes an active policy, and the admin UI reports
`chunksCreated` instead of saying "uploaded successfully" on any 2xx.

**B6** — README described all six `scripts/test-*.ts` as needing a running
server. Two import Prisma directly and create and delete `User`, `Incident`,
`Conversation` and `Policy` rows. `.env` points at production. Both documents
now name them.

### Security

**SEC-21** — `POST /api/admin/prompts` read `createdBy` from the request body.
This is the named invariant, and it was the last such route. Also dropped the
field from `createPromptSchema`, which encoded the same mistake.

**SEC-20** — not one admin mutation wrote an audit record. All eight now do.
The prompt update captures the previous content so a change to mandated-reporting
advice is reconstructable, and the delete captures it before the row goes.

### Tests that could not fail

Three tests named an invariant and asserted something else. Each fix was
verified by reintroducing the defect and watching the test fail:

- **TEST-27** — dropping `incident: incidentScope(guard.user)` from
  `obligations/[id]` lets any reporter discharge any obligation in the
  district. Old test passed. New test: expected 404, received 200.
- **TEST-28** — dropping `...incidentScope(guard.user)` from the `incidents/[id]`
  GET and PATCH lets every reporter read and rewrite every incident in the
  district. That is SEC-7. Old test passed, because it only re-checked the
  *list*, which a different call site filters. New test: expected 404,
  received 200.
- **B2** — the fixture now seeds an active district policy with **no chunks**.
  Reverting B2 makes `school_safety` gain phantom coverage and drop out of the
  reported gaps; verified the assertion fails.

The fixture could not express these tests: it seeded obligations only on the
reporter's own incident, so no foreign row existed to attempt. The admin's
incident now carries one, and `global-setup` writes both ids to
`e2e/.auth/seed.json` — on disk, because Playwright runs specs in separate
processes.

**TEST-35** — admin API authorization had no test at all; only the page
redirect was covered. Eight admin mutations are now asserted to return 403 for
a reporter.

**TEST-40** — `reuseExistingServer` meant the `webServer` env block, including
`ANTHROPIC_BASE_URL`, was discarded whenever something was already on the port,
so the suite could run against the real API and production data while
reporting normally. `global-setup` guards the database it resets; it cannot
guard a server it did not start.

**TEST-32** — the e2e stub dispatched on the bare substring `'title'`, and the
coverage-gap instruction interpolates a category list containing `title_ix`.
One live test's compliance call was therefore returning a *title* string, which
it rendered and persisted without noticing. Dispatch is now on wording unique
to each prompt, and an unrecognised prompt throws.

### Real bugs found while writing tests

**TEST-36** — `describeDeadline` rendered times that do not exist. Each unit
was rounded independently, so `Math.round` could return 60: 59m30s rendered
`in 60m`, 23h59m30s rendered `in 23h 60m`. The last thirty seconds of every
hour, on the app's most prominent element, set in tabular mono precisely so it
reads cleanly. Every existing case sat comfortably inside its unit, so none
crossed a carry.

**FLOW-36** — chat 503'd intermittently once a transcript passed 20 messages.
The history window is a fixed row count from the end, so its first entry is an
assistant turn whenever an odd number of rows was dropped — and the API rejects
a leading assistant message. The failure alternated, because the rejected turn
persisted the user message and flipped the parity. Reported by a user, this
would look like "it keeps erroring".

**SPEC-43** — 120 references to 13 CSS custom properties that no stylesheet
defines, left behind when `globals.css` was deleted. Verified against the built
stylesheet: none of them appear in it, so every declaration using them did
nothing. User message bubbles on `/chat` rendered with no background; the 44px
minimum touch target was absent on every `<Button>`; the destructive "End Chat"
variant painted nothing. Mapped to the tokens that exist and confirmed each
resolves in the built CSS.

## Review round (/bastion)

Six findings, four of them correctness. All addressed.

1. **The empty-extraction guard covered one of three ingestion paths.** The
   worst of the six, and the same class of bug this audit is about: the
   findings named "three parallel ingestion endpoints" as a major finding, and
   the fix patched the handler that happened to be open. `POST /api/policies`
   still created an active zero-chunk policy. The rule now lives once, in
   `src/lib/uploads.ts`, and all three routes call it — as an `UploadError`
   with 422, since the request is well-formed and the content is the problem.
2. **A rejected upload left the file on disk.** The guard sat after
   `writeFile`, so a refused upload orphaned the bytes with no `Policy` row —
   violating a rule stated in a comment forty lines above it, in the same
   function, about the same failure. Unlinked on that path now.
3. **The PUT validated the facets and wrote the raw ones.** `facets.data` was
   discarded. Equivalent today because `z.enum` does not transform, and a
   silent bypass the moment it does.
4. **`new Date(effectiveDate)` was still unguarded** in the object that had
   just been given a schema for its neighbours. `Invalid Date` reached Prisma
   and returned 500 for a bad request.
5. **Commit batching.** One commit carried five unrelated concerns. The review
   fixes are split into three.
6. **Comments.** Seven blocks reconstructed how a bug was found rather than
   what a reader needs at that line. Cut to the non-obvious why; the narrative
   is already in this directory.

Four new unit tests cover the shared guard, including whitespace-only input —
which every truthiness check in those three routes lets through.

## Deferred, with reasons

**B1 — obligation deadlines are invented by the model.** The worst finding in
the audit. `classifyIncident` is called with two arguments, so its
`policyContext` parameter is `undefined` and the prompt that produces every
`dueInHours` contains no policy text; the model is asked to recall New
Hampshire law. `ComplianceAction` has no `policyId` and no `citation`, so
nothing can be reconciled afterwards.

The fix is a two-phase classification that re-derives obligations after
retrieval and drops any deadline it cannot attribute to an excerpt — but that
requires deciding what the product does when the library cannot support a
deadline: suppress the obligation, show it without a countdown, or show it
marked unverified. Each is a different product. **Logged as OQ-5 and not
guessed.**

What *was* done: the two UI strings that claimed the deadline came from the
policy no longer say so. The home empty state and the thin-library banner now
tell the administrator to confirm each deadline against the cited policy.
`ObligationRow` already renders its `AuthorityChip` conditionally; it simply
never has a citation to show.

**Deferred majors**, recorded in the findings and untouched here: SEC-19 (no
way to revoke a user's access — needs a schema change and a product decision
about session lifetime), SEC-22 (upload size checked after buffering, SEC-10
still open), SEC-23 (no rate limiting, SEC-11 still open), SEC-25 (retrieved
policy text concatenated into the *system* prompt unfenced — the prompt-injection
surface), FLOW-37 (retrieval ranks by recency before relevance and the current
question often contributes no search terms), FLOW-35, FLOW-40, FLOW-41,
SPEC-41, SPEC-42/FLOW-38, DEAD-58 through DEAD-63, DEAD-80.

**Not deleted, per the standing rule.** Every dead-code finding whose behaviour
is not covered by a test or a spec line was recorded and left. Eight items were
identified as unambiguously removable; none were removed in this pass, because
removal is not what any blocker needed and the rule is there to stop exactly
that kind of opportunistic change. They are listed at the end of the findings.

## Open questions

Five, unresolved and not guessed. **OQ-5 blocks the real fix for B1** and is
the first thing to settle. OQ-1 (is amber permitted for a coverage gap?) is a
direct contradiction between `CLAUDE.md` and `theme.css` plus the ux-redesign
doc; `CLAUDE.md` is binding, so the code follows it today and the documents
should be reconciled either way.

## Known remaining work

The docs findings (DOC-3 through DOC-20, REPO-17 through REPO-22) are largely
untouched: `POLICY_MAPPING.md` and `QUICK_START_POLICY_UPLOAD.md` still
advertise the deactivated fabricated `DISC-001` as loaded, still point Method 3
at a page whose upload control was deleted, and still call
`policies:batch-upload` recommended when it cannot authenticate. These mislead
an operator but do not change what the running system does, so they were
sequenced behind the blockers and the cycle cap was reached first.
