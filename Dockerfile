# Multi-stage build. The previous single stage ran `npm run dev` as the
# container entrypoint (SEC-14), which sets NODE_ENV=development and so turned
# three "development only" error-detail guards into live disclosure in the
# deployed container, enabled the dev overlay and source maps, and enabled the
# hot reload that turned an arbitrary file write into RCE.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate inside the image: the query engine is platform-specific, and the one
# committed by a developer's machine is for their platform, not linux-musl.
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
# Migration runner. A separate target, not a step in the app's entrypoint.
#
# The Prisma CLI needs its own transitive dependencies, which the standalone
# tree does not carry -- shipping them would put the whole CLI and its
# dependency graph into the production image for the sake of one command that
# runs once per deploy.
#
# Splitting it also removes a race: N replicas starting together would each
# attempt the same migration. Run this as a job before rolling the app
# revision, so the schema is never behind the code. This repo has already had
# one production outage from that ordering -- a re-index ran against a database
# missing a column, deleted every policy chunk, could not write the
# replacements, and retrieval silently returned nothing.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/generated ./src/generated
COPY prisma ./prisma
COPY package*.json tsconfig.json ./
# src and scripts as well, so this doubles as the ops image. The app image is
# deliberately too lean to run them, and the operational commands this system
# needs -- create-user, policies:load, policies:coverage, policies:reindex --
# have to run somewhere against the real database.
COPY src ./src
COPY scripts ./scripts
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 && chown -R nextjs:nodejs /app
USER nextjs
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# The standalone tree carries its own traced node_modules and server.js.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# The generated client and its linux-musl query engine. Standalone tracing does
# not reliably carry the .node binary, so it is copied explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

# Uploads are attachments and policy source documents -- student-record
# material and re-index provenance. This directory must be a mounted volume in
# any real deployment; the mkdir only makes the container start cleanly when it
# is not, and anything written to it then dies with the container.
RUN mkdir -p uploads && chown -R nextjs:nodejs uploads

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
