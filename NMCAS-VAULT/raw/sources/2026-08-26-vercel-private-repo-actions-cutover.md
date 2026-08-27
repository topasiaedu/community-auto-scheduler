# Private GitHub repo + Vercel Actions deploy cutover (NMCAS web)

**Date:** 2026-08-26  
**Repo:** `topasiaedu/community-auto-scheduler` (private; GitHub owner type = personal user `topasiaedu`, not a GitHub Organization)  
**Vercel project:** `community-auto-scheduler-web` under Pro team `topasiaedu's projects` (`topasiaedus-projects`)  
**Working checklist in repo:** `GitHub-Vercel-Private-Repo-Deploy-CHECKLIST.md`  
**Purpose:** Record why native Vercel Git deploys were blocked, how GitHub Actions + company Vercel token fixed it, what shipped, and what was deferred.

---

## Problem

Native Vercel Git integration blocked production/preview deploys when the Git commit author was not a member of the Vercel team. Example on PR #1: Vercel commented that `@KWen-22` (personal Gmail) must be added to **topasiaedu's projects** to deploy. Latest production deploy before cutover was **BLOCKED**.

Paying for extra Vercel seats solely so personal GitHub accounts can trigger deploys was rejected. Goal: keep the repo **private**, keep personal commit emails, keep auto-deploy, **$0** extra seats.

---

## Solution (method)

GitHub Actions runs:

1. `vercel pull`
2. `vercel build` (or `--prod`)
3. `vercel deploy --prebuilt` (or `--prebuilt --prod`)

Authenticated with a scoped company/owner **`VERCEL_TOKEN`**, plus `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` secrets. Native Git commit-author membership checks no longer gate the web deploy path.

Workflows (pinned CLI **`vercel@59.5.0`**):

- `.github/workflows/vercel-production.yml` — push to `main` + `workflow_dispatch`
- `.github/workflows/vercel-preview.yml` — in-repo PRs only (forks skipped); posts/updates a PR comment with the preview URL

**Not used** (unlike some community workarounds): `VERCEL_DEPLOYER_EMAIL` / CI `git commit --amend --reset-author`. Other TopAsia repos pass with token-only; this repo matched that pattern.

---

## Repo / project facts at cutover

| Item | Value |
|------|--------|
| Default branch | `main` |
| `orgId` | `team_EiCBlv6Nk8Ms1DpqavqTEmVJ` |
| `projectId` | `prj_Ytxg1SAlyDgoOBI0nj3Y5BYmQyKW` |
| Web stack | Vite SPA (`apps/web`); root `vercel.json` drives install/build/output + SPA rewrites |
| API | DigitalOcean (`nmcas-server.nmmedia.app`) — out of scope for these workflows |
| System env vars (`VERCEL_URL`, `VERCEL_GIT_*`, …) | Not read by app source; Appendix A not required |
| Build-time env | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Production + Preview on Vercel) |

---

## Phases executed (2026-08-26)

### Phase 0 — Pre-flight

- Confirmed Pro team ownership, private repo, Actions enabled, no app `VERCEL_*` system-env usage, pin `59.5.0`.
- CORS note: Render/DO API `WEB_ORIGIN` is an exact allowlist; preview origins may need explicit adds.
- **Open / dashboard:** Root Directory in Vercel UI had been `apps/web`; monorepo-preferred root is repo root (`vercel.json` at root). Confirm/clear Root Directory if builds mis-target (checklist 0.9).

### Phase 1 — Credentials

- CLI login `topasiaedu`; `vercel link` to `community-auto-scheduler-web`.
- Human created token `github-actions-deploy` and stored it outside git.

### Phase 2 — Secrets (human)

GitHub Actions secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` = `team_EiCBlv6Nk8Ms1DpqavqTEmVJ`
- `VERCEL_PROJECT_ID` = `prj_Ytxg1SAlyDgoOBI0nj3Y5BYmQyKW`

Vercel project env confirmed to include the three `VITE_*` keys.

### Phase 3 — Prove Actions

- [PR #1](https://github.com/topasiaedu/community-auto-scheduler/pull/1) added workflows + checklist + `.gitignore` / `DEPLOY.md` updates.
- **Vercel Preview** Actions green (`32942281759`); workflow posted preview URL comment.
- Native Vercel Git check still **FAILURE** (expected — personal author seat block).
- Merged to `main`; **Vercel Production** Actions green (`32942525858`).

### Phase 4 — Cut over

- Root `vercel.json` gained:

```json
"git": {
  "deploymentEnabled": false
}
```

- [PR #2](https://github.com/topasiaedu/community-auto-scheduler/pull/2) merged.
- Production Actions green (`32943809514`); latest deploy **READY** via CLI/Actions, aliased to `https://community-auto-scheduler-web.vercel.app`.
- Brief cutover window may show an extra production entry; thereafter deploys should be Actions-only.

### Phase 5 — Personal accounts (treated done)

Proven during Phase 3 with personal GitHub user **`KWen-22`** (Gmail commit identity rejected by native Vercel, accepted by Actions):

- Preview job green + URL comment on in-repo PR.
- Merge to `main` → production Actions succeed without adding that person as a paid Vercel seat.

Repo remains **private**. Success criteria met for the cutover goal.

### Phase 6 & 7 — Deferred (owner choice, 2026-08-26)

Not done now:

- Branch protection on `main`, require **Vercel Preview** status check, disallow direct pushes.
- Do **not** enable “Require deployments to succeed” (expects native Git).
- Deployment Protection for Preview URLs; token rotation schedule; secret access review.
- Developer handover messaging (preview URLs come from workflow comments, not Vercel bot; branches not forks; CORS/`WEB_ORIGIN` note).

---

## Operational notes

- **Ignored Build Step** in Vercel Git settings must stay **Automatic** (do not `exit 0` / “Don’t build anything”).
- Rollback: remove `git.deploymentEnabled: false` from `vercel.json` and push — native Git resumes (subject to seat rules).
- Preview CORS: API allowlist may block new `*.vercel.app` preview origins until `WEB_ORIGIN` updated.
- Docs: `DEPLOY.md` describes Actions-owned web deploys; full tick checklist in repo root.

---

## Key URLs / IDs (non-secret)

- Production alias: `https://community-auto-scheduler-web.vercel.app`
- Team slug: `topasiaedus-projects`
- Checklist: `GitHub-Vercel-Private-Repo-Deploy-CHECKLIST.md`
