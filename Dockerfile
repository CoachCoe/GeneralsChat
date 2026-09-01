# Multi-stage build. The previous single stage ran `npm run dev` as the
# container entrypoint (SEC-14), which sets NODE_ENV=development and so turned
# three "development only" error-detail guards into live disclosure in the
# deployed container, enabled the dev overlay and source maps, and enabled the
# hot reload that turned an arbitrary file write into RCE. Node was also pinned
# to 18, which is end-of-life and inconsistent with the rest of the repo.
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
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated

# Uploads must be a writable volume, not part of the image.
RUN mkdir -p uploads && chown -R nextjs:nodejs uploads

USER nextjs
EXPOSE 3000
CMD ["npm", "start"]
