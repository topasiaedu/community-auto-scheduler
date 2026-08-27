---
title: "2026-08-26 Vercel private-repo Actions cutover"
type: "source-summary"
updated: "2026-08-26"
sources: 1
tags: ["deploy", "vercel", "github-actions", "hosting"]
---

# Source digest — Vercel private-repo Actions cutover

**Raw:** `raw/sources/2026-08-26-vercel-private-repo-actions-cutover.md`

## Summary

On 2026-08-26 the NMCAS **web** app cut over from native Vercel Git auto-deploy to **GitHub Actions + Vercel CLI** (`pull` → `build` → `deploy --prebuilt`) using a company/owner token. Goal: keep the GitHub repo private and let personal Gmail/Yahoo GitHub accounts ship without buying extra Vercel seats.

Native Git was blocking non-team commit authors (e.g. `@KWen-22` on PR #1; production previously **BLOCKED**). After cutover, root `vercel.json` sets `git.deploymentEnabled: false`; production aliases to `community-auto-scheduler-web.vercel.app` via Actions.

## Key claims

- Hosting split unchanged: **Vercel = web**, **DigitalOcean = API**, **Supabase = DB/Auth/Storage** (API workflows out of scope).
- Three secrets only: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (no deployer-email amend).
- CLI pin: `vercel@59.5.0`.
- Phases 0–5 completed same day; **Phase 6 (lock-down) and Phase 7 (handover) deferred** by owner.
- Phase 5 treated done via personal-account PR #1 (preview + production Actions) without adding that user as a Vercel seat.

## Links

- Concept: [[wiki/concepts/vercel-github-actions-deploy]]
- Overview hosting: [[wiki/overview]]
- In-repo checklist: `GitHub-Vercel-Private-Repo-Deploy-CHECKLIST.md`
- PRs: https://github.com/topasiaedu/community-auto-scheduler/pull/1 , https://github.com/topasiaedu/community-auto-scheduler/pull/2

## Open questions

- Confirm Vercel dashboard **Root Directory** is repo root (not `apps/web`) — checklist 0.9.
- Confirm **Ignored Build Step** remains Automatic — checklist 4.2.
- On a post-cutover PR, confirm native Vercel check is quiet — checklist 4.7.
- Preview CORS vs API `WEB_ORIGIN` allowlist when testing preview URLs.
