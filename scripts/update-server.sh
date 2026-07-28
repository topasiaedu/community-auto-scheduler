#!/usr/bin/env bash
# Update NMCAS API on the DigitalOcean droplet (run from repo root on the server).
# Typical usage: cd /path/to/community-auto-scheduler && npm run update-server
#
# Expects PM2 process name `nmcas-api` (override with PM2_APP_NAME).
# `npm start` already runs migrate-deploy then the API; PM2 restart re-runs that.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PM2_APP_NAME="${PM2_APP_NAME:-nmcas-api}"
BRANCH="${UPDATE_SERVER_BRANCH:-main}"

echo "==> git fetch + pull ($BRANCH)"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> npm ci"
npm ci

echo "==> build API (+ @nmcas/db)"
npm run build:api

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found on PATH — build finished; start the API manually."
  exit 1
fi

if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  echo "==> pm2 restart $PM2_APP_NAME"
  pm2 restart "$PM2_APP_NAME" --update-env
else
  echo "==> pm2 process '$PM2_APP_NAME' missing — starting (PORT from .env, usually 3002)"
  pm2 start npm --name "$PM2_APP_NAME" -- start
fi

pm2 save
echo "==> done. Check: pm2 logs $PM2_APP_NAME --lines 50"
echo "    curl -sS https://nmcas-server.nmmedia.app/health"
