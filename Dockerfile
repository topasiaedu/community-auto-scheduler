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
# Give V8 a soft heap ceiling below the container RAM so the GC runs before OOM kills the process.
# Render free (512 MB RAM): reserve ~80 MB for OS/native libs → 432 MB for Node heap.
# Adjust if you upgrade to a larger instance.
ENV NODE_OPTIONS="--max-old-space-size=432"

EXPOSE 3001

CMD ["/app/docker-entrypoint.sh"]
