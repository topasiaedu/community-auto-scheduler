#!/bin/sh
set -e
cd /app
echo "docker-entrypoint: running db:deploy (baseline + prisma migrate deploy)"
node scripts/migrate-deploy.mjs
echo "docker-entrypoint: starting API"
exec node apps/api/dist/index.js
