# Audit remediation — 2026-09-08

What was done about [`2026-09-08-findings.md`](./2026-09-08-findings.md).
Branch `audit/2026-09-08`, cut from `dev` at `7565f5a`.

## Result

**All 12 blockers fixed. 21 of 46 majors fixed.** The rest are deferred with
reasons below — nine of them because they need a product decision, which the
audit's own rule says to log rather than guess.

| Gate | At cut | Now |
|---|---|---|
| `npm run typecheck` | 0 errors | 0 errors |
| `npm run lint` | 0 errors, 3 warnings | 0 errors, 3 warnings (the same three, pre-existing) |
| `npm run build` | succeeds | succeeds |
| `npm run test:unit` | 151 passed | **195 passed** |
| `npm run test:e2e` | 59 passed | **72 passed** |

Verified from a clean state: `rm -rf .next tsconfig.tsbuildinfo node_modules`,
`npm ci`, then all four gates.

**No suppressions were introduced.** The full diff against `dev` contains no
`@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`, no `.skip`/`.only`, no
`any` widening, and no removed or weakened assertion. `.github/workflows/`,
`tsconfig.json`, `eslint.config.mjs` and `vitest.config.mts` are untouched. One
new dependency was **not** added; nothing was installed.

Every new test was verified to fail with its fix reverted. That is recorded per
fix below rather than claimed in aggregate.

---

## The twelve blockers

### B1 — an unparseable classification was written as a real one
`src/lib/ai/claude-service.ts`. The FLOW-35 fix was applied one layer too high:
`IncidentClassifier` threw, but the inner `classifyIncident` still caught its own
parse failure and returned `other` / `medium` with two invented 24-hour
obligations, which the route then stamped permanently. Deleted; it throws now.
The parse is extracted as `parseClassification` so the boundary is testable
without a client. **8 unit tests**, including one asserting no input can produce
the shape the removed default had.

### B2 — a failure between classifying and deriving left an incident with no obligations, forever
`src/app/api/chat/route.ts`. `incidentType` was written in phase one, before
retrieval; `deriveObligations` guards its parse but not its model call. A timeout
there threw *after* the stamp committed, and the retry gate is
`!incident.incidentType`, so nothing ever re-derived. `complianceAction.create`
exists nowhere else in the tree. The result was a classified incident with zero
obligations, which looks complete.

`createObligations` became `commitClassification`, writing the incident update
and the obligation rows in one `prisma.$transaction` — the first transaction in
the codebase. The model call stays outside it. The gate also now re-runs for an
incident left with a type and no obligations by an earlier deploy.

### B3 — an unverified obligation that was late or due today was rendered nowhere
`src/app/page.tsx`. The three groups did not partition the open set: `Overdue`
and `Due today` were drawn from the policy-backed rows while `Later` required a
deadline after midnight or none. `deadlineSource` defaults to `'model'`, so this
was the common case, and the row that vanished was the urgent one. The code's own
comment promised those rows were "listed below", and the subhead counted them.

There is a fourth group, **Needs confirming**, so the four partition `open`
exactly. Neutral tone, so OQ-5's no-red-or-amber rule still holds. **The choice
of a separate group is provisional — see OQ-7.**
*Verified: reverting the group renders 2 rows against 3 open, and the test fails.*

### B4 — the headline said "You're clear." from an empty array
`src/app/page.tsx`. Computed unconditionally from `open.length`, which is 0
before the first fetch and 0 again when it fails — so the page opened by
asserting in 40px serif that nothing was outstanding, and said it permanently
after a 401 from an idle session, with "Could not load your obligations"
underneath it. Gated on a settled state.
*Verified: an e2e test intercepts `/api/obligations` with a 500 and asserts the
old copy is absent.*

### B5 — unverified deadlines were painted red and counted as late
Four surfaces ignored provenance: the incident page's "N overdue" pill, its stamp
bar, its timeline dots and meta, and the incidents-list countdown. Only
`DeadlineClock` honoured OQ-5, so the same row read grey in the aside and red in
the header 35 lines above.

The rule now lives in one place — `deadlineColor(state, deadlineSource)` beside
`DEADLINE_COLOR`, which is private to the module — with `isPolicyBacked` also
replacing the two predicates that had drifted (`=== 'policy'` server-side,
`!== 'model'` client-side, over a free-text column). Both page-level `Action`
interfaces gained `deadlineSource`, and the `as Obligation` cast that hid it from
the compiler is gone. **18 unit tests**, including one asserting no unverified,
uncompleted state can return red or amber.
*Verified: removing the provenance branch fails the colour test; removing the
count filter fails the incident-page test.*

### B6 — the `dueInHours → dueDate` conversion was pinned by nothing
Inline in two places, and no test anywhere read a `dueDate` produced from a
`dueInHours` — so `* 60 * 60 * 1000` → `* 60 * 1000` turned every 24-hour
mandatory-report clock into 24 minutes with all 210 tests green. Now
`dueDateFromHours` in `src/lib/deadline.ts`, used at both sites. **6 tests**,
including one asserting hours and not minutes.

### B7 — `scripts/clear-incidents.ts` deleted every incident and the audit log, unguarded
Five unfiltered `deleteMany({})` against whatever `.env` supplied — the hosted
pilot Postgres — with no dry run, no confirmation and no database-name guard. Not
wired into `package.json`, so it left no trace in the script list, and
`CLAUDE.md`'s warning list omitted it while reading as exhaustive. It deleted
`auditLog` first, so one run destroyed both the reports about minors and the
evidence of access to them.

Now refuses a non-test database, counts before it deletes, and is a dry run
unless `--apply` — the shape `policies:reindex` already uses. Wired in as
`npm run incidents:clear`.
*Verified by hand: refused a production-shaped URL with the password redacted;
dry-ran against the test database.*

### B8 — `scripts/test-rag.ts` inserted an active district bullying policy into `.env`'s database
Synthetic text, `isActive: true`, `jurisdiction: 'district'`,
`category: 'bullying'` — and bullying is the pilot's only fully covered subject.
The roadmap records that the previous synthetic bullying policy was deactivated
precisely because it "would have competed with the real JICK for every bullying
query". The same guard now covers `test-rag.ts`, `test-phase3.ts` and
`migrate-chat-titles.ts`, in `scripts/support/require-test-database.ts`.

### B9 — the e2e suite could run against a server Playwright did not start
Reproduced, not theorised. With an unrelated local app on port 3100, the
`webServer` command's listen failed, nothing aborted the run, and
`auth.setup.ts` drove the *foreign* application's sign-in page — the captured
snapshot shows a different product rejecting our seeded credential.
`reuseExistingServer: false` only governs whether Playwright *skips starting* its
own server; the readiness probe accepts any process that answers. The dangerous
variant is the same app: `npm run dev` on that port is this application with
`.env`.

The check is the first link of `webServer.command`, because that is the process
that binds the port. **It cannot live in `globalSetup`** — contrary to the
comment there, Playwright 1.56 starts `webServer` *before* `globalSetup`, which
is now recorded in that file. The readiness probe also moved to `/api/health`.
*Verified against both a free and an occupied port.*

### B10 — attachments had no test of any kind
The one `CLAUDE.md` invariant with zero coverage: no `Attachment` row existed
anywhere in the suite, so the ownership check, the 404-not-403 response, the
containment assertion and the three response headers were all deletable with a
green suite. The fixture seeds one attachment per user with real bytes on disk;
**6 tests** cover the owner path, the foreign path, indistinguishability from a
missing id, the headers, unreachability as a static file, and loss of access on
sign-out.
*Verified: disabling the ownership check fails the foreign-attachment test.*

### B11 — `incidentScope` was falsifiably tested on four of eight lookups
The four without a test included `GET /api/chat/[incidentId]`, which returns a
whole conversation transcript, and `POST /api/chat`, which would append a turn to
another reporter's incident and then classify it. All four are covered.
*Verified: removing `incidentScope` from the chat route fails the new test.*

### B12 — nothing in the fixture was ever overdue *and* policy-backed
Both seeded obligations were `deadlineSource: 'model'` by column default, and
every chat-created one is in the future — so `counts.overdue`, `counts.today` and
the whole Overdue group were always zero in the suite, and inverting the overdue
comparison was invisible. The fixture now seeds a policy-backed overdue
obligation with a `policyId` and a citation. That fixture is what B3, B5 and B6
all needed to be observable.

---

## Majors fixed

**Security.** SEC-30 (the bcrypt dummy hash was cost 10 against real hashes at
cost 12, inverting the timing equalisation into a 4× enumeration oracle —
measured at 69ms vs 281ms); SEC-32 (the SSRF blocklist missed IPv4-mapped IPv6 in
hex notation, so `[::ffff:7f00:1]` reached loopback and `[::ffff:a9fe:a9fe]` the
cloud metadata endpoint — **11 new tests**, the blocklist had none, which is how
it went unnoticed); SEC-33 (model output rendered markdown images, giving
prompt-injected text a persisted data-egress channel; `img` is now alt text and
`a` is restricted to http(s) with `rel="noopener noreferrer nofollow"`); SEC-36
(four admin write handlers hand-rolled truthiness checks while their zod schemas
sat unimported); SEC-37 (untrusted policy text held the *last* position in the
guidance prompt whenever coverage was complete, contradicting OQ-4's stated
ordering property — every branch now closes with an instruction); SEC-38 (there
were no security headers at all; now a CSP with `default-src 'none'`,
`connect-src 'self'` and `frame-ancestors 'none'`, plus HSTS, nosniff and
`Referrer-Policy: same-origin`); SEC-39 (`GET /api/incidents/[id]` returned whole
`Attachment` rows including the on-disk storage name, contradicting the upload
route's own comment).

**Journeys.** FLOW-53 (a failed `/api/chat` request was appended as an assistant
message with apology text — same component, same avatar, same place as real
guidance, and client-only, so a reload left the question unanswered and
unexplained; failures are now a distinct notice that says nothing was written and
offers the unsent text back); FLOW-55 (open redirect: `callbackUrl` went from the
query string straight into `router.push`); FLOW-64 (the incidents list counted
every *in-progress* obligation as done, because the endpoint fetched only
`status: 'pending'`); FLOW-65 (every mutation on the incident page was
`if (response.ok)` with no else — `Mark done` failed silently, on the control
whose only purpose is recording that a statutory obligation was discharged);
FLOW-67; FLOW-72 (`.doc` was read as UTF-8, so binary became chunked, retrievable
policy text cited under a real policy's title); FLOW-73 (both ingestion routes
created the policy *active* and then indexed, so a failure left an active,
unretrievable policy that the library counted as loaded — rows are now activated
only after chunks exist); FLOW-74 (the library rendered a zero-chunk policy
identically to an indexed one, and the thin-library warning counted rows rather
than retrievable rows); FLOW-75; FLOW-77 (a database error reading the advisor
profile silently substituted the built-in one mid-conversation); FLOW-83 ("no
matching district policy" was printed when nothing at *any* level had been
retrieved).

**Spec / dead code / docs.** SPEC-54 (the colour rule: severity chips, error
states, three green admin badges and the button component's red `destructive`
variant — the roadmap recorded these as repainted and they were not); SPEC-56
(the `AuthorityChip` had never rendered once, because no endpoint supplied
`jurisdiction`); SPEC-58 / SEC-40 (three unreferenced `LLMService` methods that
assembled a guidance prompt with neither `CORE_DIRECTIVES` nor the retrieval
guard, while instructing the model to cite policies — deleted, with
`claudeService.streamResponse`, their only consumer); DEAD-82 (one
`isPolicyBacked` predicate); DEAD-89 (`policies:batch-upload` posted to the route
OQ-2 deleted, so every upload 405'd while three docs recommended it); DOC-21
through DOC-33 and REPO-25/26/28.

---

## Deferred, and why

### Needs a product decision — logged, not guessed

The audit's rule is to record ambiguity rather than resolve it. These are in
[`2026-09-08-findings.md`](./2026-09-08-findings.md) as **OQ-6 to OQ-14**:

- **OQ-6** — does the no-red/amber rule apply to every surface or only the home
  page? B5 assumed the former. If the narrower reading was intended, B5 is too
  broad and should be narrowed.
- **OQ-7** — where does an unverified, already-late obligation belong in the
  queue? **B3 shipped a fourth "Needs confirming" group provisionally.** The
  alternatives are the time-correct group with a neutral tone, or *Later*
  regardless of date. The status quo — rendered nowhere — was not an option.
- **OQ-8** — 20 or 21 policy categories. `CLAUDE.md` says 20; the code has 21.
- **OQ-9** — is "any Azure tenant's compute" an acceptable perimeter for the
  database holding every incident record? (SEC-34, `--public-access 0.0.0.0`.)
- **OQ-10** — who may be a policy source? The DNS-rebinding gap needs a hostname
  allowlist. SEC-32 narrowed the address blocklist; the resolve-then-connect
  window is still open.
- **OQ-11** — should the app refuse to start on a weak `AUTH_SECRET`?
- **OQ-12** — what should closing an incident do to its open obligations?
  (FLOW-66: today they stay open, counted and accruing lateness.)
- **OQ-13** — should a classification be correctable? B1 and B2 both produce
  records only a correction endpoint can repair, and the roadmap lists "change
  classification" under *Deliberately not doing*.
- **OQ-14** — is `.doc` a supported policy format? FLOW-72 refuses it, which is
  the safe answer; supporting it properly needs a converter.

### Deferred as out of scope for this audit

- **SEC-31 — the sign-in limiter keys on `x-forwarded-for[0]`**, which is
  client-written whenever an upstream appends. Correct behind Container Apps
  ingress; attacker-supplied under `docker-compose.yml`, which has no proxy.
  Fixing it means declaring how many proxy hops to trust — an infrastructure
  decision. Documented in `docs/deploy-azure.md` and the roadmap's hardening
  table instead.
- **SEC-34** — the Azure Postgres perimeter. See OQ-9.
- **CSP `script-src 'unsafe-inline'`** — the App Router inlines bootstrap and
  flight data; removing it needs a nonce plumbed through `middleware.ts`, which
  is larger than this audit should attempt. Recorded in the hardening table.
- **SEC-35** (`safeFetchText` buffers before measuring), **SEC-41** (attachment
  access granted by a past upload rather than current scope), **SEC-19** (no role
  revocation), **SEC-25** — real, smaller than the above, and now tracked in the
  roadmap where three of them were previously open *and untracked*.

### Recorded, not deleted — per the remediation rule

"Do not delete or simplify code whose behavior isn't covered by a test or spec
line." These were confirmed unreferenced but left in place:

- **DEAD-88** — `Incident.timeline` is written and read by nothing, and
  `buildTimeline` is a fifth deadline bucketing that fabricates
  `reviewMilestones` into a persisted record. Removing it changes what is stored;
  that wants a decision.
- **DEAD-91/92/93/94** — three unused `EmbeddingsService` methods, `@prisma/client`
  declared but imported by nothing (the generated client is used instead),
  `@types/pdf-parse` superseded by a local declaration, four unreferenced exports.
- **REPO-27** — a 9.8MB PDF and a 34-byte stub in `sample-policies/`. The two
  unreferenced `sau24-logo` files in `public/` are district branding and were
  kept for the same reason; the five Next.js starter SVGs were deleted, being
  unambiguously boilerplate.

`src/generated/` was checked and is **not** committed; no build artefact is
tracked; nothing is imported undeclared.

### Test coverage still missing

TEST-55 to TEST-62 are unfixed and are the most valuable remaining work:
`src/lib/ai/rag.ts` — the path everything else rests on — still has no unit test;
the LLM-outage 503 path has none; rate limiting is wired into three routes and
tested on none; and `e2e/support/claude-stub.ts` is not tied to the prompt text
it answers, so stub drift would not be caught. TEST-61 also notes that CI's
`retries: 2` cannot pass the two state-mutating tests, which is latent flake.

---

## Two things worth the maintainer's attention

**The roadmap contained two claims that were not true of the code**, and both
have been corrected in place rather than silently: that SPEC-44's colour
violations were repainted (they were never in the 2026-09-01 fix list), and that
`ObligationRow` renders the `AuthorityChip` (no endpoint supplied
`jurisdiction`, so it had never rendered). Both are fixed now. The general point
is that a "done" entry describing intended state is worse than no entry.

**`docs/history/` was treated as a record, not a spec**, per `CLAUDE.md`. The
`docs/audit/` files from 2026-08-31 and 2026-09-01 were not rewritten. The
pass records for this audit are kept verbatim in
[`2026-09-08-passes/`](./2026-09-08-passes/) so the citations that were verified
during the read-only phase survive review.
