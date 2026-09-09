# Main-thread findings (observed while establishing the baseline)

### MT-1 — `reuseExistingServer: false` does not stop the suite running against a foreign server, which is the production-write scenario its own comment describes
**Severity:** blocker
**Location:** `playwright.config.ts:52-62` (`url: BASE_URL`, `reuseExistingServer: false`), `e2e/global-setup.ts:19-30` (the database guard that cannot cover this)

**Requirement.** The config's own comment at `playwright.config.ts:55-60`:
> "Never reuse. The env block below applies only to a server Playwright starts,
> so reusing one already on this port silently discards ANTHROPIC_BASE_URL and
> runs the whole suite against the real API and whatever DATABASE_URL that
> process was given -- and .env points at production. global-setup guards the
> database it resets; it cannot guard a server it did not start. (TEST-40)"

**Finding — reproduced, not theorised.** An unrelated local Next app was listening
on port 3100. Running `npm run test:e2e` produced:

- the `webServer` command's own listen failing (Playwright printed the bare error
  object: `address: '::', port: 3100`), with **no** `EADDRINUSE` abort and no
  suite-level failure from Playwright;
- Playwright's readiness probe against `url: BASE_URL` satisfied by the foreign
  process, so the run proceeded as if the webServer were ours;
- `e2e/auth.setup.ts:12` navigating to the **foreign application's** `/login`.
  The captured page snapshot in
  `test-results/auth.setup.ts-authenticate-as-admin-setup/error-context.md`
  is a different product's sign-in page ("Life on Books"), showing our seeded
  credential `e2e-admin@example.test` rejected with "Invalid email or password".

`reuseExistingServer: false` only governs whether Playwright *skips starting* its
own server. It does not assert the port is free, and the readiness probe accepts
any process that answers — so a server Playwright did not start is used anyway.

The run here failed loudly only because the squatter was a different product. The
dangerous case is the same app: `npm run dev` on port 3100 in another terminal is
this application with `.env`, i.e. **the hosted pilot Postgres and the real
Anthropic API**. The suite would then pass while `resetDatabase()` truncated the
`test` database and the browser drove production. `e2e/global-setup.ts:19-30`
cannot catch it — as the comment says, it guards the database it resets, not a
server it did not start.

**Proposed fix.** Two changes, both in the "fix the cause" spirit:
1. In `e2e/global-setup.ts`, preflight that the Playwright port is unoccupied and
   throw with the occupying port if it is not. global-setup runs *before*
   `webServer`, so this is the only place that can refuse before anything binds.
2. Point `webServer.url` at a route only this application serves
   (`${BASE_URL}/api/health`, `src/app/api/health/route.ts:19-21`) so the
   readiness probe is at least app-specific rather than "something answered".

**Baseline note.** Re-run on a free port (`PLAYWRIGHT_PORT=3187`), the suite is
green: 59 passed. So this is a harness defect, not a product regression.

---

### MT-2 — A failure inside `deriveObligations` leaves the incident classified with zero obligations, permanently and with no retry
**Severity:** blocker
**Location:** `src/app/api/chat/route.ts:141` (the retry gate), `:156-168` (the incident is committed first), `:209-211` (obligations created after), `src/lib/ai/claude-service.ts:640-644` (`generateResponse` inside `deriveObligations` is not guarded), `:646-657` (only the *parse* is guarded)

**Requirement.** `docs/roadmap.md`, OQ-5: "Suppressing the obligation is the worst
option: 'you must report this to DCYF' is worth saying even when the library
cannot cite a deadline, and *nothing* is how a mandated report gets missed." And
the FLOW-35 principle already established in `src/lib/ai/classifier.ts:72-85`: a
transient failure must not become a permanent record.

**Finding.** On the first substantive turn the route:
1. classifies (`:143`),
2. **writes `incidentType` to the incident** (`:156-168`),
3. retrieves (`:192-205`),
4. only then derives and writes the obligations (`:209-211`).

`deriveObligations` guards its JSON parse (`claude-service.ts:646-657`, returning
`[]` so the first-pass obligations are used) but it does **not** guard the model
call itself at `claude-service.ts:640`. A failure in that call — a timeout, a 429, a
5xx from Anthropic, or the "returned no text content" throw at
`claude-service.ts:391-395` — is wrapped into a plain `Error` at
`claude-service.ts:417` and propagates out of `createObligations`, out of the
route body, and into the outer catch. Because it is a plain `Error` and not an
`LLMUnavailableError`, it misses the 503 branch at `route.ts:255-261` and is
returned as a generic 500 by `createErrorResponse` at `route.ts:264-273`.

The incident update at `:156` has already committed. So on the next turn
`!incident.incidentType` at `:141` is **false**, `classification` stays `null`,
and the `if (classification)` guard at `:209` means `createObligations` is never
called again. The incident is left classified, with a severity and a timeline,
and with **zero `ComplianceAction` rows** — and there is no endpoint that can
create them, exactly as `classifier.ts:122-128` records for the defect it
replaced.

This is the same shape as FLOW-35, one step later in the pipeline: a transient
API failure produces a permanent record on the incident where the system knew
least. It is worse than FLOW-35 in one respect — an unclassified incident is
visibly unclassified and retries, whereas this one looks complete. An
administrator sees a classified `abuse_neglect` incident with an empty
obligation queue and no warning, which reads as "nothing is required of you".

**Contributing cause.** There is no `$transaction` anywhere in the codebase
(`grep -rn '\$transaction' src/ scripts/` returns nothing), so steps 2 and 4 are
independent writes with a failure window between them.

**Proposed fix.** Do not let the retry gate depend on a field written before the
obligations exist. Either:
- gate on the obligations rather than the classification — re-derive when the
  incident has an `incidentType` but no `ComplianceAction` rows; or
- write the classification and its obligations in one `prisma.$transaction`, so a
  failure in phase two rolls back the `incidentType` stamp and the next turn
  retries the whole thing.

The second is the smaller change and matches the FLOW-35 reasoning (leave
`incidentType` null so the next turn retries). It requires moving the incident
update below `createObligations` or wrapping both.

---

### MT-3 — `determineDataSensitivity` runs before classification, so the turn that discloses abuse is the one recorded as INTERNAL
**Severity:** major
**Location:** `src/app/api/chat/route.ts:123` (call site), `:141-168` (classification, which runs *after*), `:341-366` (the function), `:357-363` (the branch that reads `incident.incidentType`)

**Requirement.** `docs/roadmap.md`, OQ-3: `abuse_neglect` "is now a first-class
incident type, mapped narrowly to `mandatory_reporting`, and treated as
CONFIDENTIAL."

**Finding.** `determineDataSensitivity(message, incident)` is called at `:123`.
Classification does not run until `:141` and the `incidentType` column is not
written until `:160`. On the opening turn of a new incident, `incident` was
created at `:73-83` with no `incidentType` and no `severity`, so the branch at
`:357-363` compares `undefined`/`null` against `'title_ix'`, `'abuse_neglect'`
and `'critical'` and cannot match. Unless the message happens to contain one of
the nine keywords at `:343-346`, the first message of every incident is recorded
`INTERNAL`.

That first message is the disclosure — *"a student told the counsellor her
stepfather hits her"* is the roadmap's own example. It is the single most
sensitive message in the record and it is the one classified least sensitively.
Later turns, once `incidentType` is set, classify correctly, so the same
incident's messages carry inconsistent sensitivity for the same content.

**Mitigating.** Nothing reads the value. `grep -rn 'dataSensitivity' src/` shows
it is written into `conversation.metadata` at `:230` and read nowhere — it gates
no redaction, no access check and no UI. So this is a wrong audit record rather
than an exposure today, which is why it is major and not a blocker. It becomes a
blocker the moment anything acts on it.

**Proposed fix.** Move the call below the classification block and pass the
freshly computed classification, falling back to the stored incident fields:
compute sensitivity from `classification?.type ?? incident.incidentType` and
`classification?.severity ?? incident.severity`, the same expression `:201-202`
already uses for retrieval. Add a unit test pinning that an `abuse_neglect`
opening turn is `CONFIDENTIAL`.

---

### MT-4 — `claudeService` is imported twice in the chat route, once statically and once dynamically, and the dynamic one shadows it
**Severity:** minor
**Location:** `src/app/api/chat/route.ts:15` (static import), `:69` (`const { claudeService } = await import('@/lib/ai/claude-service')`), `:213` (a second dynamic import, of `llm-service`)

**Finding.** `claudeService` is imported at module scope on `:15` and used at
`:307`. At `:69` the same binding is re-imported dynamically into a block-scoped
`const` that shadows it. The dynamic import is redundant — the module is already
in the graph from `:15`, so it buys no code-splitting — and the shadowing means a
reader cannot tell which binding `:70` resolves to without checking scope.
`:213` dynamically imports `llm-service` inline in an expression, which is a
third style in one file.

**Covered by a test?** No. Behaviour is identical either way; this is
readability, not correctness.

**Proposed fix.** Delete the dynamic import at `:69` and use the module-scope
`claudeService`. Lift `llm-service` to a static import at `:213` unless a comment
records why it must be deferred (none present).

---

### MT-5 — 67 `console.*` calls in `src/` bypass the pino logger that exists to keep records about minors out of unstructured output
**Severity:** minor
**Location:** 67 occurrences across `src/`; concentrated in `src/lib/ai/chroma.ts` (12), `src/lib/ai/rag.ts` (12), `src/lib/ai/claude-service.ts` (4), `src/lib/ai/embeddings.ts` (4), `src/lib/ai/llm-service.ts` (3). Notably `src/lib/ai/claude-service.ts:655` on the obligation-derivation failure path and `src/lib/ai/rag.ts` on the retrieval failure paths.

**Requirement.** `src/lib/logger.ts` exists and is used by every API route
(`logRequest`/`logResponse`/`logError`). The point of routing through it in an
application holding incident records about minors is that what gets emitted, and
at what level, is decided in one place.

**Finding.** The AI and retrieval layer logs through `console` instead. Two
consequences: the failure of the obligation-derivation parse
(`claude-service.ts:655`) and the failure of retrieval (`rag.ts`) — the two
events that most change what an administrator is told — are invisible to
whatever consumes the structured stream; and `console.log` lines such as
`rag.ts` "Added policy … with N chunks" are unconditional stdout in production.

**Covered by a test?** No.

**Classification.** Needs a decision on scope: this is a 67-site change in files
this audit is not otherwise touching. Recording rather than fixing wholesale.
The subset worth fixing now is the failure paths that change guidance —
`claude-service.ts:655` and the `rag.ts` retrieval-failure sites.

**Proposed fix.** Replace `console.error`/`console.warn` on the guidance-relevant
failure paths with `logError`/`logger.warn`. Leave the Chroma diagnostics, which
are operator-facing and only run under a subsystem the roadmap records as
inactive.

---

### MT-6 — An orphaned doc comment in `classifier.ts` documents `actionTypeFor` but sits above `ClassificationUnavailableError`
**Severity:** minor
**Location:** `src/lib/ai/classifier.ts:4-11` (the comment), `:12-15` (a second comment), `:16-21` (`ClassificationUnavailableError`), `:23` (`actionTypeFor`, the function the first comment describes)

**Finding.** Two `/** */` blocks stack immediately before
`ClassificationUnavailableError`. The first ("Bucket an obligation by what it
asks the administrator to do… Exported because obligations are now created in
two places") describes `actionTypeFor` at `:23`. The second describes the error
class. So the class carries a comment about a function, and the function carries
none — and the first comment is the one recording *why* `actionTypeFor` is
exported, which is the fact a future reader most needs.

**Proposed fix.** Move `:4-11` down to immediately above `:23`.
