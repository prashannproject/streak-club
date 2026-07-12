# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --include=optional

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
ENV SESSION_SECRET=build-only-session-secret-at-least-32-characters
ENV INVITE_CODE_SECRET=build-only-invite-secret-at-least-32-characters
RUN npm run build

FROM base AS tools
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY tests ./tests
COPY vitest.config.ts vitest.integration.config.ts ./
USER node
CMD ["npm", "run", "db:migrate"]

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 streak && \
    useradd --system --uid 1001 --gid streak --create-home streak && \
    mkdir -p /app/data/avatars && chown -R streak:streak /app/data
COPY --from=builder --chown=streak:streak /app/.next/standalone ./
COPY --from=builder --chown=streak:streak /app/.next/static ./.next/static
COPY --from=builder --chown=streak:streak /app/public ./public
# Next's file tracer can omit native optional binaries; copy Sharp's runtime explicitly.
COPY --from=builder --chown=streak:streak /app/node_modules/@img ./node_modules/@img
COPY --from=builder --chown=streak:streak /app/node_modules/sharp ./node_modules/sharp
USER streak
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
