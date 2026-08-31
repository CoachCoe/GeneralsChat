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
# Set DATABASE_URL and ANTHROPIC_API_KEY at minimum.

# Start a local Postgres if you don't have one:
docker compose up -d db

npm run migrate          # apply Prisma migrations
npm run db:seed-prompt   # seed the active system prompt
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
| `npm run test:e2e` | Playwright suite — **requires a running server**, see below |
| `npm run migrate` | `prisma migrate deploy` |
| `npm run db:studio` | Prisma Studio on :5555 |
| `npm run db:seed-prompt` | Seed the active `SystemPrompt` row |
| `npm run db:verify` | Print row counts per table |
| `npm run policies:batch-upload` | Bulk-upload policy documents |

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
npm run dev          # in one terminal
npm run test:e2e     # in another
```

The Playwright config has no `webServer`, so the server must already be
running, and the suite writes to whatever database `DATABASE_URL` points at and
makes real, billed Claude API calls. **Do not run it against a shared or
production database.** The suite also has substantial known problems — several
tests cannot fail as written. See `docs/audit/2026-08-31-findings.md`, TEST-1
through TEST-23.

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

## Security status

An audit on 2026-08-31 found blocking issues. Several are fixed; the largest is
not:

- **There is no authentication or authorization anywhere in this application.**
  Every API route is public. `GET /api/incidents` returns every incident with
  reporter names and emails; `GET /api/chat/<id>` returns full consultation
  transcripts. `next-auth` is not wired up and the schema lacks the models an
  adapter would need. **Do not deploy this with real student data.**
- Attachments are written into `public/` and are therefore downloadable by URL
  with no access check. Relocating them depends on the auth work above.
- There is no rate limiting on the unauthenticated LLM endpoints.
- The `AuditLog` table exists for FERPA disclosure accounting and is never
  written to.

Fixed in the audit branch: arbitrary file write on both upload paths, SSRF in
the policy URL fetch, missing upload size and type limits, unvalidated write
bodies and pagination, and a production container that ran the dev server.

Full detail: `docs/audit/2026-08-31-findings.md`.

## License

See [LICENSE](LICENSE).
