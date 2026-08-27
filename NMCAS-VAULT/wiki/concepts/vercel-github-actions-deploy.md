---
title: "Vercel + GitHub Actions deploy (private repo)"
type: "concept"
updated: "2026-08-26"
sources: 1
tags: ["deploy", "vercel", "github-actions", "ci"]
---

# Vercel + GitHub Actions deploy (private repo)

## Idea

For a **private** GitHub repo connected to a Vercel Pro project, native Git auto-deploy can require the **commit author** to be a Vercel team member (seat cost). An alternative official path is to disable native Git deployments and deploy with the **Vercel CLI from GitHub Actions**, authenticated as the company/owner via `VERCEL_TOKEN`.

## NMCAS application (2026-08-26)

Applies to the **web** SPA only (`community-auto-scheduler-web`).

| Piece | Detail |
|-------|--------|
| Disable native Git | Root `vercel.json` → `"git": { "deploymentEnabled": false }` |
| Production | `.github/workflows/vercel-production.yml` on `main` |
| Preview | `.github/workflows/vercel-preview.yml` on in-repo PRs; URL as workflow PR comment |
| Secrets | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| Build env | `vercel pull` loads `VITE_*` from the Vercel project |
| Not used | CI git-author amend / `VERCEL_DEPLOYER_EMAIL` |

## What stays the same

- Instant Rollback, domains, edge, analytics on Vercel.
- API deploy path (DigitalOcean / PM2) is independent.
- Supabase unchanged.

## Trade-offs

- No Vercel bot preview comment (workflow comment instead).
- Branch-specific `*-git-*.vercel.app` URLs may stop; use per-deployment URL from the PR comment.
- Preview origins may need API `WEB_ORIGIN` updates (exact CORS allowlist).
- Builds consume GitHub Actions minutes.

## Sources

- [[wiki/sources/2026-08-26-vercel-private-repo-actions-cutover]]
- `raw/sources/2026-08-26-vercel-private-repo-actions-cutover.md`
