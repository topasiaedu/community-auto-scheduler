#!/bin/sh
set -e
cd /app
node scripts/migrate-deploy.mjs
exec node apps/api/dist/index.js
