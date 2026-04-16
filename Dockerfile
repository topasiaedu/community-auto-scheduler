# NMCAS API — monorepo build (Fastify + Prisma + Baileys + pg-boss).
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

RUN npm ci \
  && npm run build:api

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production

EXPOSE 3001

CMD ["/app/docker-entrypoint.sh"]
