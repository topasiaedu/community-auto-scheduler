# NMCAS API — monorepo build (Fastify + Prisma + whatsmeow-node + pg-boss).
# Intended for Render Docker, Fly.io, etc. Free tiers may sleep; scheduling needs an always-on plan in production.

FROM node:20-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Workspace install + compile API and its packages (see package.json "build:api").
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts

RUN npm ci \
  && npm run build:api

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
# Cap V8 heap well below container RAM so native whatsmeow (Go) RSS + SQLite/media buffers fit.
# Render free/Starter (512 MB): ~256 MB heap leaves room for OS + Go subprocess (~15–40 MB) + spikes.
# On Standard (2 GB) you can raise this (e.g. 1536) via Render env override.
ENV NODE_OPTIONS="--max-old-space-size=256"

EXPOSE 3001

# ENTRYPOINT (not CMD) so Render dashboard dockerCommand overrides cannot skip
# baseline + migrate deploy in docker-entrypoint.sh.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
