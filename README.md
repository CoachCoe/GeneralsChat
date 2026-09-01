# GeneralsChat — School Compliance Assistant

A Next.js application that helps K-12 school administrators handle incident
reporting and investigation correctly. Staff describe an incident in chat; the
app classifies it, retrieves the relevant district policy, and returns
compliance guidance with required actions and deadlines. Incidents are tracked
through their lifecycle with generated end-of-chat summaries.

It handles incident reports about minors — Title IX, harassment, abuse
disclosures — so confidentiality and correctness matter. Read
[Security status](#security-status) before deploying this anywhere.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19 |
| Database | PostgreSQL via Prisma 6 |
| LLM | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Retrieval | Chroma vector search, with a keyword fallback over `PolicyChunk` |
| Embeddings | OpenAI `text-embedding-3-small` (optional) |
| E2E tests | Playwright |

## Prerequisites

- Node.js 20+
- PostgreSQL 16 (or use the bundled `docker compose` service)
- An Anthropic API key

## Setup

```bash
git clone https://github.com/CoachCoe/GeneralsChat.git
cd GeneralsChat
npm install

cp .env.example .env
# Set DATABASE_URL, ANTHROPIC_API_KEY and AUTH_SECRET at minimum.
# Generate a secret with: openssl rand -base64 32

# Start a local Postgres if you don't have one:
docker compose up -d db

npm run migrate          # apply Prisma migrations
npm run db:seed-prompt   # seed the active system prompt

# There is no self-registration. Create the first admin:
npm run user:create -- --email you@district.org --name "Your Name" --role admin

npm run dev              # http://localhost:3000
```

`DATABASE_URL` must be a `postgresql://` URL. The Prisma datasource is
PostgreSQL, so a `file:` SQLite URL fails with `P1012` — note that
`prisma generate` succeeds with a bad URL, so `npm install` and `npm run build`
will not catch it; `npm run migrate` is where it surfaces.

### Optional: vector search

Without `OPENAI_API_KEY` and a reachable Chroma server, retrieval runs on the
keyword fallback over `PolicyChunk` rows. That works, but recall is lower than
vector search. To enable it:

```bash
docker run -p 8000:8000 chromadb/chroma
# then set OPENAI_API_KEY and CHROMA_URL in .env
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | `prisma generate` then a production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over `src scripts e2e` |
| `npm test` | Playwright suite — starts its own server, see below |
| `npm run test:e2e` | Same as `npm test` |
| `npm run migrate` | `prisma migrate deploy` |
| `npm run db:studio` | Prisma Studio on :5555 |
| `npm run db:seed-prompt` | Seed the active `SystemPrompt` row |
| `npm run db:verify` | Print row counts per table |
| `npm run policies:batch-upload` | Bulk-upload policy documents |
| `npm run user:create` | Create or update a user and set a password |

`scripts/test-*.ts` are **manual demo scripts, not automated tests** — they
print a transcript and assert nothing. They need a running server and read
`APP_BASE_URL` (default `http://localhost:3000`).

## Loading policy documents

Guidance quality depends entirely on having district policies indexed. Three
paths exist; see `QUICK_START_POLICY_UPLOAD.md` for detail.

1. `npm run policies:batch-upload` — edit the `policies` array in
   `scripts/batch-upload-policies.ts` first, and put the files in
   `sample-policies/`.
2. The admin UI at `/admin/policies` (`.txt`, `.md`, `.pdf`, `.docx`).
3. `POST /api/policies` directly.

All three now index through the same chunker (1000 words, 200-word overlap)
and generate embeddings when configured.

> Policy rows created before this audit were chunked by an older, broken
> splitter and have no embeddings. They need re-indexing — see
> `docs/audit/2026-08-31-work-completed.md`.

## Testing

```bash
createdb generalschat_test
DATABASE_URL="postgresql://localhost:5432/generalschat_test?schema=public" \
AUTH_SECRET="$(openssl rand -base64 32)" \
npm test
```

The suite starts its own server, resets and seeds the database, and serves
Anthropic calls from a local stub — so it makes **no billed API calls** and
needs no hand-started server.

`global-setup` refuses to run unless the database name contains `test`, so
pointing `DATABASE_URL` at a real database cannot wipe it.

Set `ANTHROPIC_BASE_URL` to route model calls at a gateway, proxy, or stub;
leave it unset to use the real API.

## Architecture notes

```
src/app/api/chat        POST → classify → retrieve policy → Claude → persist
src/lib/ai/claude-service.ts   prompt assembly and all Anthropic calls
src/lib/ai/rag.ts              retrieval: Chroma, with keyword fallback
src/lib/ai/classifier.ts       incident type, severity, required actions
src/lib/uploads.ts             upload path safety (see Security status)
src/lib/safe-fetch.ts          SSRF-guarded outbound fetch
```

The system prompt is **database-driven**: `ClaudeService.getActiveSystemPrompt()`
reads the `SystemPrompt` row with `isActive: true` on every request, and that
row completely replaces the in-code default. It is editable at `/admin/prompt`.
`LAWYER_PERSONA_UPDATE.md` describes an earlier, different persona and is
superseded on this point.

## Authentication

Single tenant, credentials-based, with JWT sessions. There is **no
self-registration** — accounts are created with `npm run user:create`.

Roles:

| Role | Can |
|---|---|
| `admin` | Everything, including `/admin/*` (policies and the system prompt) |
| `investigator` | Read and update every incident |
| `reporter` | Read and update only incidents they filed |

`middleware.ts` denies by default: only `/login`, `/about` and `/api/auth/*`
are reachable without a session. API routes answer 401/403; page routes
redirect. Every route handler re-checks the session independently, so a
middleware matcher mistake cannot silently expose a route.

`AUTH_SECRET` is required. In Docker, set it and `NEXTAUTH_URL` in the
environment; `docker-compose.yml` will refuse to start without `AUTH_SECRET`.

## Security status

An audit on 2026-08-31 found 153 issues. The blocking ones are fixed:
authentication and authorization, arbitrary file write on both upload paths,
SSRF in the policy URL fetch, attachments served from `public/` with no access
check, missing upload size and type limits, unvalidated write bodies and
pagination, a production container running the dev server, and a page that
fabricated compliance determinations with `Math.random()`.

Still open, and worth knowing before you deploy:

- **No rate limiting** on the LLM endpoints. They are authenticated now, so
  this is a cost and abuse concern rather than an open door, but a single
  signed-in user can still run up the Anthropic bill.
- **DNS rebinding** is not fully mitigated in the policy URL fetch; the
  hostname allowlist described in SEC-4 is the real fix.
- **Upload size limits** reject oversized files but do not prevent memory
  exhaustion, because `request.formData()` buffers the body first.
- **Vector search is unverified.** Two config bugs that made it fail in every
  environment are fixed, but a successful round-trip has not been observed
  against a running Chroma server.

Full detail: `docs/audit/2026-08-31-findings.md` and
`docs/audit/2026-08-31-work-completed.md`.

## License

See [LICENSE](LICENSE).
