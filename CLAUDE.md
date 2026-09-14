# Working in this repo

A K-12 school compliance assistant. An administrator describes an incident; the
app classifies it, finds the applicable policy across four levels of authority,
and tells them what they must do and by when.

**It handles incident reports about minors.** Confidentiality and correctness
are safety-critical, and a confidently wrong statutory deadline is worse than no
answer. When in doubt, say the system does not know.

## Commands that define "clean"

All four must pass. CI runs exactly these.

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint src scripts e2e
npm run build
npm test              # unit (vitest) then e2e (Playwright, own server + stub)
```

`npm test` is `npm run test:unit && npm run test:e2e` — vitest over the pure
logic first, then Playwright. CI runs the unit tests before installing a
browser, so failing them costs nothing.

The e2e half needs a Postgres whose database name contains `test` —
`e2e/global-setup.ts` refuses to reset anything else, so a mistyped
`DATABASE_URL` cannot wipe real data. It makes no billed API calls: Anthropic
requests go to a local stub via `ANTHROPIC_BASE_URL`.

It also needs its port free. `PLAYWRIGHT_PORT` defaults to 3100, and the first
link of `webServer.command` refuses to start if anything is already listening
there — otherwise the suite runs against a server Playwright did not start,
with that process's own `DATABASE_URL` and the real API. Pass
`PLAYWRIGHT_PORT=<free port>` if 3100 is taken.

```bash
DATABASE_URL="postgresql://$USER@localhost:5432/generalschat_test?schema=public" \
AUTH_SECRET="$(openssl rand -base64 32)" npm test
```

Give the URL an explicit role. Prisma does not fall back to the OS user the way
`psql` does, so a userless URL fails migrate with `P1010: User was denied
access` while `psql -l` on the same database works fine.

**`.env` points at production.** `DATABASE_URL` in `.env` is the hosted
Postgres the pilot runs on, so any script run without an explicit override
writes to real data — including `npm run dev`. Create a local database and
always pass it explicitly:

```bash
DATABASE_URL="postgresql://$USER@localhost:5432/generalschat_dev?schema=public" npm run dev
```

This file used to say "there is no local database in this checkout", which read
as "there is nothing to point at" and left the obvious way to run the app
pointing at real data about real minors. There is no local database *committed
here*; make one. `npm test` is safe by construction — its setup refuses a
database whose name lacks `test`.

The `prisma` commands are **not** safe and take whatever `.env` gives them; they
carry no guard. Every script that *writes* does: it accepts a database whose name
contains `test`, as the e2e setup does, or one whose name contains `dev` on
localhost, and refuses anything else. The `dev` allowance needs both halves — a
hosted `...-dev` database is still refused — so clearing a local checkout is
routine without the guard losing what it is for.

An audit found four writing scripts without it, including the re-index one whose
unguarded run is the outage described below. If you add a script that writes,
add the guard; `policy-coverage.ts` and `verify-db.ts` read only and need none:

| Script | What it does |
|---|---|
| `npm run incidents:clear` | Deletes **every** incident, conversation, attachment, compliance action and audit-log row. Dry run unless `--apply` |
| `scripts/test-rag.ts` | Creates an *active* district bullying policy, which competes with the real JICK for every bullying query |
| `scripts/test-phase3.ts` | Creates and deletes `User`, `Incident` and `Conversation` rows |
| `scripts/migrate-chat-titles.ts` | Rewrites `Incident` titles in place |
| `npm run policies:reindex` | Re-chunks and re-embeds every policy. Dry run unless `--apply` |
| `npm run policies:load` | Creates a `Policy` and its chunks |
| `npm run user:create` | Creates or updates a user and sets a password |
| `npm run db:seed-prompt` | Writes the advisor profile row |

The `test-` prefix on two of these does not mean they are tests; they are not
part of any gate. The guard lives in `scripts/support/require-test-database.ts`
and is the one thing under `scripts/` that vitest covers.
Re-indexing against production with an unmigrated schema is what once
left every policy with zero chunks and retrieval silently returning nothing.
Prefer `npm run policies:reindex` with no flag — it is a dry run — and read what
it says it would do before passing `--apply`.

## Invariants — breaking these is a bug, not a style choice

**Identity comes from the session, never the request.** `requireUser()` /
`requireRole()` in `src/lib/session.ts`. No route may read a user id from a body
or query string; that was a real vulnerability. Every handler re-checks the
session even though `src/middleware.ts` also gates it — a matcher mistake must not
silently expose a route.

**The session says who you are; the row says what you may do.** `requireUser()`
re-reads the user on every guarded request, so `role` is never taken from the
JWT: the token records the role held at sign-in, and `updateAge` rolls it
forward on activity, so a demotion would otherwise not take effect while the
user kept working. A deleted account is 401, not 403. `src/middleware.ts` still
gates `/admin` on the token's role because Prisma cannot run on the Edge — that
is a page shell, and every `/api/admin` handler re-checks against the row.

**Scope every by-id lookup, and read is not write.** Two helpers in
`src/lib/incident-scope.ts`, and which one a handler imports is the whole of its
access decision. `incidentScope(user)` is the reporter and staff: every write
takes it. `incidentReadScope(user)` adds anyone the incident is shared with:
every read takes it. An out-of-scope row returns **404, not 403**, so ids are
not confirmed to people who may not read them.

A share grants reading and nothing else — not changing the incident, not
discharging an obligation, not attaching a student record, not adding a turn to
the transcript, not sharing onward. That rule fits in a sentence, which is why
it is that rather than a capability matrix. `GET /api/attachments/[id]` resolves
through the read scope for the same reason: it once compared `reporterId`
inline, so a shared incident listed its attachments and 404d every download.

**Revoking is not deleting.** `AuditLog.userId` is a required relation so the
record of who read which student's incident outlives the account. A revoked user
is `deactivatedAt`: `authorize` refuses sign-in *after* the bcrypt compare so
timing does not separate revoked from never-existed, and `requireUser` answers
401 — a 403 would confirm the account exists.

**Never assert policy the system did not retrieve.** If retrieval returns
nothing, the prompt gets an explicit instruction not to cite policy codes or
state district deadlines. Don't remove that guard.

**A missing local policy is information.** Coverage gaps are reported, not
hidden, and never papered over by passing a statute off as district procedure.
They are reported in the sources rail beside the transcript, which is on screen
for every turn that gives guidance: a dashed local rung labelled `gap`, or —
when nothing the incident is about is loaded at all — the scope note, which
names what the system thinks the incident is so the reader can disagree. One
telling, not three: the transcript used to carry an amber card restating the
gap under every answer, above prose in which the answer had already admitted
it, and a warning repeated that often reads as furniture.

A clarifying question contributes nothing to the rail, because provenance is a
claim about text the assistant wrote and a question makes no claim — the model
labels its own turn and `parseTurnLabel` resolves anything unreadable to
`guidance`, so a turn is excluded only by an explicit question label. Sources
accumulate across the conversation; coverage does not, because it describes the
incident rather than the turn and classification is refined as the
administrator says more. The decision lives in `src/lib/provenance.ts`,
apart from the components that draw it, because it is the part that can be
wrong and neither gate can reach the page: vitest runs in `node` over
`.test.ts` files, and no e2e fixture can produce a turn with zero citations.

**A report form is the district's, not ours.** `/incidents/[id]/report` parses
the form out of the document the district loaded (`src/lib/report-template.ts`)
and fills in only facts the incident record holds, each labelled with where it
came from. Which document is a form is a property of the row —
`Policy.documentKind`, set at upload — never a guess from its title: `Form` is
a substring of `Uniform`, and a Uniform Complaint Procedure printed under
"Mandatory report" is the mistake the page exists to prevent. Names, ages, grades and dates of the incident stay blank: they are
in the reporter's prose, and inferring them from it is how a report names the
wrong child. A deadline fills only from the earliest policy-backed obligation, ordered
rather than found, because which of several prints must not depend on the
query planner. Times cross the wire as instants and are formatted in the
reader's zone, not the server's. An unclassified incident gets no form rather
than a guessed one — and `other`, which is a classification that maps to no
category, is told that no form maps to it rather than that it is
unclassified. The form's text
crosses the wire only as parsed blocks, for one incident, to a user the
incident scope already lets read it — `GET /api/policies` still withholds
`content` and `filePath` from everyone.

**Attachments are student records.** They live outside `public/` and are served
only through `GET /api/attachments/[id]`, which re-checks session and ownership.
Never reintroduce a direct file URL.

**Notifications are derived, never stored.** `src/lib/notifications.ts` builds
them from rows that already exist: a deadline from `ComplianceAction`, an unseen
share from `IncidentShare.seenAt`, unread messages from
`ThreadParticipant.lastReadAt`. There is no notification table and no scheduler,
so nothing can drift from what it describes. Only a policy-backed deadline may
be shown as overdue — colour means what it means everywhere else. In-app only:
there is no mail transport, so a deadline that passes while nobody is signed in
waits until somebody is, and the UI does not imply otherwise.

**An invitation link is a credential.** There is no mail transport, so the
sharer copies the link and sends it. One address, single use, seven days,
revocable, and only a SHA-256 of a 32-byte token is stored. Acceptance claims it
with a conditional update inside the transaction, not on the strength of the
read above it. The body carries a name and a password and nothing else — the
address comes from the invitation row and the role is `reporter` in code.

`/invite/` and `/api/invitations/` are the only paths added to the
deny-by-default gate since it was written, and accepting is the *second*
unauthenticated write path: it hashes a password, so it is rate limited in
`middleware.ts` on the same key as sign-in.

**Person-to-person messaging is never called chat.** `Conversation` is the
assistant's transcript. People talk in `MessageThread` / `Message`, shown as
"Messages". A thread may name an incident; membership grants nothing over it.

**Time-derived text needs `useMounted()`.** Anything from `new Date()` renders
differently on the server and the client — a countdown, a formatted date in a
different timezone. Rendering it unguarded is a hydration mismatch (React #418).

## The data model, in one paragraph

A `Policy` has a **jurisdiction** (`federal` / `state` / `district` / `school` —
who issued it) and a **category** (what it covers, 21 values, the last of
which is `other`). They are
orthogonal: the same subject is usually governed at several levels at once.
Classification picks the categories an incident implicates; retrieval pulls
matching policies from every jurisdiction; `mandatory_reporting` is always
included because "must I report this" is the question the tool exists to answer.
`ComplianceAction` rows are the obligations, created at classification with the
deadline the policy sets. `Mark done` is their only state change.

## Design rules

Tokens live in `src/app/theme.css`. There is no `globals.css` — it was deleted,
and its patterns should not come back.

- **Colour is earned.** It means a deadline state — overdue (red), attention
  (amber), met (green) — or a coverage gap (amber). Nothing else. No brand
  accent, and never severity, error states or decoration: those would compete
  with the only signal the UI is allowed to raise its voice with.

  A coverage gap is on this list because it is the same class of signal as a
  deadline: an actionable compliance warning the administrator has to do
  something about. It was a documented design decision that this rule
  contradicted; the rule was widened rather than the components repainted.
- **Three fonts, three jobs.** DM Serif Display for titles and answers, DM Sans
  for body and obligation titles, JetBrains Mono with tabular numerals for every
  time, id and count — digits must not jitter as a countdown ticks.
- **Authority is carried by brightness**, federal brightest to school dimmest,
  consistently. Not by colour.
- Uppercase is the eyebrow treatment and nothing else — small, letterspaced,
  used to label a region rather than to shout. `.eyebrow` in `theme.css` is the
  canonical form; a handful of sites (the incidents-list and incident-page
  status pills, `SourceLadder` and `AuthorityChip`) inline the same three
  properties at 10px instead of using the class. That is a duplication to collapse, not a second treatment: if you want
  uppercase anywhere else, you do not.

## Test contracts

These are asserted by the suite; move them deliberately and update the tests in
the same commit:

`data-testid="chat-input" | chat-send | chat-loading | chat-sources |
chat-history-item | obligation-queue | obligation-row | incident-summary |
incident-report | report-gap | incident-transcript | completion-suggestion |
share-panel | share-row | share-email | message-row | message-input |
message-send | person-option | notification-bell | user-row | user-name |
user-email | new-credentials | first-run-note | profile-status |
profile-read-only | chat-error`, `aria-label="Send message"`,
`nav[aria-label="Main"]`, `nav[aria-label="Documents"]`,
`aside[aria-label="Sources"]`, `region[aria-label="Notifications"]`,
the `Incidents` `<h1>`, and the button names `Close Incident` / `Reopen Incident` /
`Generate Summary` / `Sign in` / `Sign out` / `Mark done` / `Share` /
`Stop sharing` / `Add reporter` / `Revoke` / `Restore` / `Print` / `Download` /
`New` / `Start conversation`.

This list is what the suite actually asserts. An audit found a third of a
previous version of it naming things no test touched — including the whole
`/invite/[token]` page, which is covered at the API level and not through its
form. A contract nothing asserts is a comment, and it reads like a promise.

`obligation-row` exists so a test can assert the queue is **exhaustive** — that
the number of rows rendered equals the number of open obligations the API
reports. Three groups of filters can each drop an unverified late row on the
floor with nothing able to see it.

## Conventions

- Write tests that can fail. `expect(locator).toBeTruthy()` passes for any
  locator; `if (await x.count() > 0)` turns a missing feature into a pass. Both
  were removed from this repo for that reason — don't reintroduce them.
- No suppressions to get a gate green: no `@ts-ignore`, no `any` widening, no
  `eslint-disable`, no `.skip`/`.only`.
- Prefer fixing the cause. The CSS migration here failed twice because an
  unlayered stylesheet beat every Tailwind utility; layering it was the fix, not
  working around each collapsed element.

## Where things are written down

`docs/roadmap.md` — **the living to-do list.** Priority order, ownership, and an
explicit list of what is deliberately *not* being built. Edit it in place.

**Open work is an issue, not a document.** Anything an audit leaves unfixed goes
to the tracker before the audit's own files stop being tracked — a finding that
lives only in a dated file is a finding nobody will read again.

`docs/audit/` and `docs/history/` are untracked and `.gitignore`d. They are
working documents — dated records of what was found and fixed, and snapshots
that no longer describe the system — so they are not part of what a stranger
clones. Nothing tracked should cite a finding ID, because a fresh clone cannot
resolve one: state the substance instead. The existing records stay readable in
git history at `cc759fc`.

Committed Markdown is limited to what a stranger needs: `README.md`, the
licence, and docs written in the present tense about how the system works
today.
