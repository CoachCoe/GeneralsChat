# UX redesign — work completed — 2026-09-01

Branch `ux/redesign`, cut from `dev` after the audit merge (`16157f3`).
Design source: `GeneralsChat Redesign.dc.html` (Claude Design), turn 1.
Brief: [`docs/design-brief.md`](../design-brief.md).

## Gates

Run from a clean state — `rm -rf node_modules .next`, fresh `npm ci`:

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** — 0 errors, 2 warnings |
| `npm run build` | **PASS** |
| `npm test` | **PASS — 44/44**, exits 0 |

Test blocks grew 21 → 35 (44 runs across the reporter and admin projects).

### No suppressions introduced

| | dev | this branch |
|---|---|---|
| `any` in `src/` (excl. generated) | 16 | **16** |
| `eslint-disable` | 4 | **1** |
| `@ts-ignore` / `@ts-expect-error` | 0 | **0** |
| `.only` / `.fixme` | 0 | **0** |
| conditional `test.skip` | 0 | **0** |
| `.github/workflows/` changed | — | **0 files** |
| `tsconfig.json` changed | — | **0 lines** |

`eslint-disable` fell because three pages carrying
`react-hooks/exhaustive-deps` suppressions were rewritten with proper
`useCallback` dependencies.

## Decisions taken

| Question | Answer |
|---|---|
| Home candidate | **1a** — the action queue. Lateness first. |
| Guidance candidate | **1c**, borrowing 1d's indented source ladder |
| "Accept into queue" flow | **Dropped.** Obligations are created at classification; "Mark done" is the only state change |
| CSS foundation | **Adopt Tailwind** (the design's own recommendation) |
| Theme | Dark, stone palette, DM Serif Display / DM Sans / JetBrains Mono |

## What shipped

**Foundation.** Tailwind v4 with the design's tokens as theme, fonts via
`next/font`. Colour is earned: overdue red, attention amber, met green, and
nothing else. `.tabular` for every time and count, `.eyebrow` as the only
uppercase in the UI.

**Markdown renders.** The prompt has always asked for `## headers` and lists,
nothing rendered them, and users saw the literal characters. `GuidanceBlock`
fixes the most visible defect in the product.

**The obligation queue.** `GET /api/obligations` and
`PATCH /api/obligations/[id]`, and `/` is now the queue with the finding as the
headline. `ComplianceAction` rows were being written on every classified
incident and never read back — an administrator could not answer "what am I
late on?".

**Source ladder and coverage gaps.** Citations render as an indented ladder,
federal → school, so the hierarchy is literal; an empty local rung is dashed
and labelled rather than hidden. Coverage gaps are amber, not red — attention,
not alarm.

**Incident detail** is a timeline built from the intake exchange, attachments
and every obligation's deadline state, with a stamp bar and an obligations rail.

**Routes collapsed.** Four list routes → `/incidents?segment=` (old URLs kept as
redirects), `/incidents/new` → `/chat`, and the navbar `Settings` `<span>` is a
real `<button>`.

**Mobile works.** It did not before, structurally — see below.

## Bugs found while building

Four real defects surfaced, none of them cosmetic:

1. **`globals.css` was unlayered, so it beat every Tailwind utility.**
   Unlayered CSS wins over any cascade layer regardless of specificity. Its
   hand-rolled `.w-full` silently beat Tailwind's `lg:w-[340px]` and collapsed
   the incident-detail timeline to **zero width**. Not a one-off: *any*
   responsive override of a class `globals.css` also defines would lose the
   same way, which would have made the page-by-page migration impossible to
   reason about. It now imports into a `legacy` layer beneath Tailwind.

2. **The mobile menu was dead code.** The button was `className="hidden"` with
   no breakpoint — permanently invisible — while the desktop link row had no
   breakpoint either, so it overflowed a 375px viewport by 40px. There has
   never been a working mobile layout.

3. **The chat sidebar made the composer unreachable on a phone.** 260px fixed,
   defaulted open, leaving 115px for the conversation.

4. **The source ladder dropped policies.** My first implementation keyed one
   source per jurisdiction, so a bullying incident showed only one of the
   district's two relevant policies. Caught by an e2e assertion.

## Deviations from the design

**`/policies` was kept.** The design proposed removing it and giving
`/admin/policies` a read-only view for non-admins. That requires loosening the
`/admin/*` middleware gate built during the audit — a security regression
traded for a routing preference. Instead `/policies` is the read-only library
any signed-in user can read, `/admin/policies` stays admin-only for management,
and the duplicate upload control on `/policies` (the actual duplication) is
gone. Same two surfaces, no weakening.

**Session shortened to 30 minutes idle**, from a working day, because the
design's login copy says so and it is right for student records — but the copy
is only there because the behaviour now matches it.

## Not built, and why

| Design element | Status |
|---|---|
| `confidence 0.91` on classification | **No such data.** The classifier produces no confidence score. The audit removed a hardcoded `0.9` precisely because it was fake; re-adding a fabricated one would be worse than omitting it. |
| `AuthorityChip` on each obligation | **Would mislabel.** `ComplianceAction` has no link to the policy that produced it — the classifier returns actions as text. Inferring jurisdiction from the incident's categories would put a wrong statutory citation on a deadline. Needs a schema + classifier change. |
| `INC-0241` human IDs | Needs a sequence column. |
| "Two other incidents hit the same gap" / "See the 3 gaps" | Needs cross-incident gap aggregation. |
| "Flag to the district" | Entirely new concept, no model. |
| "Change classification" | No endpoint. |
| 1e record panel ("6 of 8", missing fields amber) | Needs per-field extraction the classifier does not do. |
| 1b week view | Deferred by the design's own recommendation (a tab beside 1a). |

## Migration state

`globals.css` is still 1,161 lines and still styles six files:
`admin/policies`, `admin/prompt`, `error.tsx`, `ErrorBoundary`, `Navbar`, and
the `.navbar-*` classes generally. Pass 3 of the design's plan — delete
`globals.css` and drop the `legacy` layer — is not done. The layering makes
that safe to do incrementally; it was not safe before.

## Contracts verified intact

`chat-input`, `chat-send`, `chat-loading`, `chat-sources` test ids;
`aria-label="Send message"`; the `Incidents` `<h1>`; `Close Incident` /
`Reopen Incident` / `Generate Summary`; login `Email` / `Password` / `Sign in`;
`Sign out`. Route gating and role-scoped visibility unchanged — a reporter
still gets 404 on another user's incident and is redirected away from `/admin`.
