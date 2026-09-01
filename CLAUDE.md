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
npm test              # Playwright; starts its own server and stub
```

`npm test` needs a Postgres whose database name contains `test` —
`e2e/global-setup.ts` refuses to reset anything else, so a mistyped
`DATABASE_URL` cannot wipe real data. It makes no billed API calls: Anthropic
requests go to a local stub via `ANTHROPIC_BASE_URL`.

```bash
DATABASE_URL="postgresql://$USER@localhost:5432/generalschat_test?schema=public" \
AUTH_SECRET="$(openssl rand -base64 32)" npm test
```

Give the URL an explicit role. Prisma does not fall back to the OS user the way
`psql` does, so a userless URL fails migrate with `P1010: User was denied
access` while `psql -l` on the same database works fine.

**`.env` points at production.** There is no local database in this checkout —
`DATABASE_URL` in `.env` is the hosted Postgres the pilot runs on. Any script
run without an explicit override writes to real data. `npm test` is safe by
construction (its setup refuses a database whose name lacks `test`), but the
`policies:*` and `prisma` commands are not, and neither are
`scripts/test-phase3.ts` and `scripts/test-rag.ts`, which create and delete
`User`, `Incident`, `Conversation` and `Policy` rows despite the `test-`
prefix. They take whatever `.env` gives them. Re-indexing against production with an unmigrated schema is what once
left every policy with zero chunks and retrieval silently returning nothing.
Prefer `npm run policies:reindex` with no flag — it is a dry run — and read what
it says it would do before passing `--apply`.

## Invariants — breaking these is a bug, not a style choice

**Identity comes from the session, never the request.** `requireUser()` /
`requireRole()` in `src/lib/session.ts`. No route may read a user id from a body
or query string; that was a real vulnerability. Every handler re-checks the
session even though `middleware.ts` also gates it — a matcher mistake must not
silently expose a route.

**Scope every by-id lookup.** `incidentScope(user)` — reporters see only what
they filed. An out-of-scope row returns **404, not 403**, so ids are not
confirmed to people who may not read them.

**Never assert policy the system did not retrieve.** If retrieval returns
nothing, the prompt gets an explicit instruction not to cite policy codes or
state district deadlines. Don't remove that guard.

**A missing local policy is information.** Coverage gaps are reported, not
hidden, and never papered over by passing a statute off as district procedure.

**Attachments are student records.** They live outside `public/` and are served
only through `GET /api/attachments/[id]`, which re-checks session and ownership.
Never reintroduce a direct file URL.

**Time-derived text needs `useMounted()`.** Anything from `new Date()` renders
differently on the server and the client — a countdown, a formatted date in a
different timezone. Rendering it unguarded is a hydration mismatch (React #418).

## The data model, in one paragraph

A `Policy` has a **jurisdiction** (`federal` / `state` / `district` / `school` —
who issued it) and a **category** (what it covers, 20 values). They are
orthogonal: the same subject is usually governed at several levels at once.
Classification picks the categories an incident implicates; retrieval pulls
matching policies from every jurisdiction; `mandatory_reporting` is always
included because "must I report this" is the question the tool exists to answer.
`ComplianceAction` rows are the obligations, created at classification with the
deadline the policy sets. `Mark done` is their only state change.

## Design rules

Tokens live in `src/app/theme.css`. There is no `globals.css` — it was deleted,
and its patterns should not come back.

- **Colour is earned.** It means a deadline state and nothing else: overdue
  (red), attention (amber), met (green). No brand accent — it would compete with
  the only signal the UI is allowed to raise its voice with.
- **Three fonts, three jobs.** DM Serif Display for titles and answers, DM Sans
  for body and obligation titles, JetBrains Mono with tabular numerals for every
  time, id and count — digits must not jitter as a countdown ticks.
- **Authority is carried by brightness**, federal brightest to school dimmest,
  consistently. Not by colour.
- The `.eyebrow` class is the only uppercase in the UI.

## Test contracts

These are asserted by the suite; move them deliberately and update the tests in
the same commit:

`data-testid="chat-input" | chat-send | chat-loading | chat-sources |
obligation-queue`, `aria-label="Send message"`, `nav[aria-label="Main"]`, the
`Incidents` `<h1>`, and the button names `Close Incident` / `Reopen Incident` /
`Generate Summary` / `Sign in` / `Sign out` / `Mark done`.

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
`docs/audit/` — what was found and fixed, with reasoning. Dated; do not rewrite.
`docs/history/` — snapshots that no longer describe the system. Dated; do not
rewrite.
