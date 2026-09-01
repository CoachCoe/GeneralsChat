# UI/UX redesign brief — GeneralsChat

Paste this into a design session. Fill in the four decisions marked **[YOU DECIDE]** first — everything else is factual and verified against the codebase.

---

## The product

A compliance assistant for K-12 school administrators. An incident happens — bullying, a Title IX allegation, a disclosure that may be abuse, a fight. An administrator describes it in their own words. The system classifies it, finds the district, state and federal policies that apply, and tells them **what they must do and by when**.

## Who is using it, and in what state

A principal or assistant principal, mid-incident. Often within minutes of a distressing conversation with a student. Frequently on a phone or a laptop in a hallway. They are not a lawyer, they are not calm, and they are accountable for statutory deadlines they cannot recall from memory.

Design consequences that follow from that, and should not be traded away:

- **Deadlines are the product.** "Notify DCYF within 24 hours" is the thing they came for. Everything else is supporting detail.
- **Wrong is worse than slow.** If the system has no district policy on something, saying so plainly beats a confident-sounding answer. There is an explicit signal for this (below) that currently has no visual treatment at all.
- **They will be interrupted.** State must survive leaving and coming back.
- **This is a student record.** Screens may be visible to others in a hallway or office.

## The jobs to be done

1. Describe an incident and be told what to do about it, with timeframes.
2. See what is still outstanding across all their incidents, soonest deadline first.
3. Go back to an incident and see what was decided, what was done, what remains.
4. Produce a written summary for the file.
5. (Admin) Load district policy documents so the guidance has something to stand on.

---

## Current state — verified, not assumed

### Stack
Next.js 15 App Router, React 19, TypeScript. Prisma + PostgreSQL. Auth is NextAuth v5, credentials, three roles (`admin`, `investigator`, `reporter`), deny-by-default middleware. Playwright e2e, 23 tests passing.

### Styling — read this carefully, it is unusual

**Tailwind is not installed.** There is no `tailwindcss` package, no config, no `@tailwind` directive. What exists instead:

- `src/app/globals.css` — **1,161 lines**, a hand-maintained partial reimplementation of Tailwind: 213 hand-written utility classes (`.flex`, `.grid`, `.gap-6`, `.bg-blue-500`, `.rounded-full`) plus an Apple-derived design-token layer (`--primary`, `--foreground`, `--muted-foreground`, `--radius`, `--blur`, …) and semantic component classes (`.card-apple`, `.badge-apple`, `.btn-primary`, `.navbar-link`, `.input-apple`).
- Heavy inline `style={{…}}` objects — 42–46 per page on the main screens.
- Only three shared components exist: `ui/button.tsx`, `ui/badge.tsx`, `ui/card.tsx`.

**Coverage is patchy and fails silently.** Markup uses Tailwind-shaped class names that were never defined, so they do nothing. Verified inert: `animate-spin` (used on every loading spinner), `sm:flex-row`, `lg:max-w-md`, `lg:grid-cols-4`, `lg:col-span-1`, `lg:col-span-3`. Verified working: `md:grid-cols-2`, `md:grid-cols-3`, `lg:grid-cols-3`.

The practical effect: **there is no working responsive story**, loading spinners do not spin, and any new Tailwind-looking class a designer writes has a coin-flip chance of doing nothing. This is the single biggest thing to resolve before styling work starts. **[YOU DECIDE]** — adopt real Tailwind and migrate, or formalise the existing hand-rolled system.

### Screens

| Route | State |
|---|---|
| `/` | Dashboard. Three cards → active / pending / closed incidents |
| `/login` | Email + password. Functional, visually plain |
| `/chat` | Main interface. 651 lines, sidebar + message list + composer |
| `/incidents/new` | **A second chat, doing the same thing as `/chat`** |
| `/incidents` | All incidents, with in-page filter buttons |
| `/incidents/active` | Open incidents — separate page, 152 lines |
| `/incidents/closed` | Closed incidents — separate page, 228 lines |
| `/incidents/pending` | Incidents with outstanding compliance actions — 233 lines |
| `/incidents/[id]` | Detail: description, status toggle, attachments, AI summary. 459 lines |
| `/admin/policies` | Policy upload + list (admin only) |
| `/admin/prompt` | System prompt editor (admin only) |
| `/policies` | **A second, weaker policy page** overlapping `/admin/policies` |
| `/about` | Static |

---

## Problems worth solving

Listed strongest first. These are design problems, not bugs — the bugs are fixed.

### 1. The product is a deadline tracker wearing a chat app's clothes

There is a full `ComplianceAction` model — `actionType`, `description`, `dueDate`, `status`, `assignedTo` — populated automatically on every classified incident, with real timeframes derived from policy. **It has essentially no UI.** No calendar, no "due in 6 hours", no overdue state, no completion affordance, no cross-incident view of what is outstanding.

This is the largest opportunity in the product. An administrator's actual question on Monday morning is "what am I late on?", and nothing on screen answers it.

### 2. Four list pages that are the same list

`/incidents`, `/incidents/active`, `/incidents/closed`, `/incidents/pending` are near-identical implementations — two of them are 95% byte-identical to each other. Three are reached from dashboard cards, one from the navbar. A user cannot tell where they are or how these relate. Almost certainly one list with filters, or a single view with saved segments.

### 3. Two chat entry points

`/chat` and `/incidents/new` now both post to the same endpoint and do the same job. One should go.

### 4. Guidance renders as raw markdown

The model is instructed to reply with `## Section headers`, numbered lists and bold. There is no markdown renderer, so users literally see `## Immediate Legal Requirements` and `**within 24 hours**` as characters. Every response is a wall of unformatted text — in a product whose entire value is a scannable, prioritised action list.

### 5. Two new signals have no visual language yet

Both were just built and are returned by the API on every chat response:

- **Citations** — which policies the guidance rests on, each with a title and a jurisdiction (`federal` / `state` / `district` / `school`). Currently a plain grey list under the message. This is the trust surface: it is how an administrator verifies the system is not making things up.
- **Coverage gaps** — `coverage.categoriesWithoutLocalPolicy`. When an incident implicates something the district has no policy for, the system says so. This is both a safety signal *and* a genuine finding the district wants to know about. It has no treatment at all right now.

Federal/state/district/school is a **hierarchy of authority**, and the design should make that legible — the statutory floor versus the local procedure that implements it.

### 6. Incident detail is a flat dump

Description, status toggle, attachments, summary button — no sense of chronology, no "what happened / what we did / what's left", no evidence of an investigation in progress.

### 7. Accessibility and state handling

- The navbar "Settings" control is a `<span onClick>` — not focusable, not keyboard-operable, no role.
- Loading spinners rely on the inert `animate-spin`.
- Empty, loading and error states are ad hoc and differ per page.
- Icon-only buttons: the chat send button was given an `aria-label`; others have not been audited.

---

## Hard constraints — do not break these

The test suite and the auth model depend on them.

- **Test hooks must survive**, or be moved deliberately with the tests: `data-testid="chat-input"`, `chat-send`, `chat-loading`, `chat-sources`; `aria-label="Send message"`; the `<h1>Incidents</h1>` on `/incidents`; buttons named `Close Incident` / `Reopen Incident` / `Generate Summary`; the login form's `Email` / `Password` labels and `Sign in` button; a `Sign out` button reachable from the navbar.
- **Routes are gated.** `/login` and `/about` are public; everything else requires a session. `/admin/*` requires the `admin` role and redirects non-admins to `/`.
- **Roles change what is visible.** A `reporter` sees only incidents they filed; `investigator` and `admin` see all. The UI should reflect that rather than showing empty admin affordances.
- **Attachments are student records.** They download through an authenticated route (`/api/attachments/[id]`), never a public URL. Do not reintroduce direct file links.
- **API response shapes are fixed** unless changed deliberately: `/api/chat` returns `{ response, citations[], coverage, incidentId, classification }`.

---

## What to produce

1. **Information architecture** — the screen set and navigation, resolving the four-list-pages and two-chat-entries problems. Say what merges, what splits, what is removed.
2. **The deadline surface** — the highest-value new work. How does an administrator see what is outstanding and overdue, across incidents?
3. **The guidance response** — how a classified, cited, deadline-bearing answer should look. Include the citation treatment and the coverage-gap state.
4. **Incident detail** — a real timeline of the incident and its obligations.
5. **A design system pass** — tokens, type scale, spacing, the component set needed. Resolve the CSS decision above.
6. **States** — loading, empty, error, offline, and the degraded state where no policy matched.
7. **Responsive** — there is currently no working mobile layout. **[YOU DECIDE]** how much this matters for the pilot.

## Please state your reasoning on

- Whether chat is the right primary interface at all, or whether a structured intake with conversational assist would serve a stressed user better.
- How to convey authority hierarchy (federal → state → district → school) without making the response feel like a legal document.
- How prominent a coverage gap should be. It is important, but it must not read as "the system is broken".

---

## Decisions to fill in before sending

- **[YOU DECIDE] Visual direction.** Current styling is Apple-derived (SF Pro stack, Apple spacing and tracking, `.card-apple` / `.badge-apple`). Keep, evolve, or replace? Is there a district or SAU brand to respect?
- **[YOU DECIDE] Light or dark.** Pages currently mix a `gradient-bg` dark treatment with a white `body` background. There is no dark-mode implementation — pick one and commit.
- **[YOU DECIDE] Mobile priority.** Real administrators are mobile mid-incident, but the pilot is one desktop user. First-class, or later?
- **[YOU DECIDE] CSS foundation.** Adopt real Tailwind (and migrate ~2,200 lines of page markup plus 1,161 lines of CSS), or formalise the hand-rolled system. This constrains everything else.

## Context worth knowing

- Single-tenant, Docker-deployed, currently entering a **one-user pilot**. Optimise for that user being able to do the job, not for scale.
- Guidance quality depends on district policy documents being loaded. Early on the library will be sparse, so **the sparse state is the common state** — design for it rather than treating it as an edge case.
