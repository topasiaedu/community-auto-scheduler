# Private Repo + Vercel Auto-Deploy: Execution Checklist

**Repo:** `topasiaedu/community-auto-scheduler` (NMCAS)  
**Companion pattern:** GitHub Actions + Vercel CLI with a company/owner token  
**Goal:** Keep the GitHub repo **private**, let developers use **personal Gmail/Yahoo GitHub accounts**, keep **Vercel auto-deploying** the web app, avoid paying for extra Vercel seats.  
**Method:** GitHub Actions runs `vercel pull` → `vercel build` → `vercel deploy --prebuilt` with a scoped Vercel token, so native Git commit-author checks do not gate deploys.

**How to use:** work top to bottom. Tick each `[ ]` as you finish it. Do **not** skip ahead — the ordering prevents an outage.

---

## This repo (facts for NMCAS)


| Fact                                              | Value                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GitHub remote                                     | `https://github.com/topasiaedu/community-auto-scheduler.git`                        |
| GitHub owner type                                 | **Personal user** `topasiaedu` (not a GitHub Organization)                          |
| Visibility                                        | **Already private**                                                                 |
| Default branch                                    | `main`                                                                              |
| Vercel team                                       | `topasiaedu's projects` (`topasiaedus-projects`) — **Pro**                          |
| Vercel project                                    | `community-auto-scheduler-web`                                                      |
| `orgId`                                           | `team_EiCBlv6Nk8Ms1DpqavqTEmVJ`                                                     |
| `projectId`                                       | `prj_Ytxg1SAlyDgoOBI0nj3Y5BYmQyKW`                                                  |
| CLI login                                         | `topasiaedu` (pinned CLI `59.5.0`)                                                  |
| What Vercel hosts                                 | Static Vite SPA (`apps/web` → prefer **repo-root** `vercel.json` build)             |
| What Render hosts                                 | Fastify API + pg-boss + whatsmeow (`Dockerfile` / `render.yaml`)                    |
| What Supabase hosts                               | Postgres, Auth, Storage                                                             |
| System env vars (`VERCEL_URL`, `VERCEL_GIT_*`, …) | **Not used** in app source — Appendix A not required                                |
| Existing root `vercel.json`                       | Keep install/build/output/rewrites; add `git.deploymentEnabled` only in **Phase 4** |
| Latest native production deploy (as of Phase 0)   | **BLOCKED** — Actions cutover is the fix path                                       |


> **Why still use this plan on a personal private repo?**  
> Official Vercel docs say the private-repo commit-author seat check targets **org-owned** repos. This plan still gives you: (1) deploy identity owned by one company/owner token, (2) a path that keeps working if you later transfer the repo to a GitHub Organization, (3) explicit preview URLs via Actions comments. If native Vercel Git already deploys every committer today, you can still cut over so deploys are token-driven and seat-independent.

---

## Verification status (load-bearing claims)


| Claim                                                                          | Verdict       | Source                                                                                                      |
| ------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------- |
| Private **org** repos require the commit author to be a Vercel team member     | Confirmed     | [Vercel Git docs](https://vercel.com/docs/git)                                                              |
| That check does **not** apply to collaborators on **personal** GitHub accounts | Confirmed     | [Vercel Git docs](https://vercel.com/docs/git) (“does not apply to collaborators on personal Git accounts”) |
| Free Vercel **Viewer** seats cannot deploy                                     | Confirmed     | [Troubleshoot collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)        |
| GitHub Actions + `vercel deploy --prebuilt` is supported                       | Confirmed     | [Use GitHub Actions with Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)      |
| `git.deploymentEnabled: false` disables native Git deploys                     | Confirmed     | [Git configuration](https://vercel.com/docs/project-configuration/git-configuration)                        |
| CLI may still inspect git author metadata (community reports since ~v44)       | Optional risk | Other TopAsia repos pass with token-only Actions; no deployer-email amend here                              |


### Corrections applied vs older drafts


| Original said                            | Corrected to                                                                       | Why                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Ignored Build Step = `exit 0`            | Keep Ignored Build Step **Automatic**; disable via `git.deploymentEnabled`         | Supported switch; “Don’t build anything” can cancel broadly |
| Pin `vercel@39.3.0`                      | Pin `**59.5.0**` (tested pin for this checklist)                                   | Old pin is stale                                            |
| Go private early                         | Prefer Actions green first; **this repo is already private** — use careful cutover | No public fallback                                          |
| Empty `vercel.json`                      | **Merge** into existing root `vercel.json`                                         | This repo already configures the Vite SPA build             |
| Token alone always bypasses author check | Token-only (3 secrets), matching other working repos                               | Revisit only if author errors appear later                  |


---

## Phase 0 — Pre-flight (do not skip)

- [x] **0.1** Vercel project `community-auto-scheduler-web` is under Pro team `**topasiaedu's projects`** (`team_EiCBlv6Nk8Ms1DpqavqTEmVJ`). CLI user: `topasiaedu`. Latest production deployment was **BLOCKED** — confirms why this plan is needed.
- [x] **0.2** GitHub remote is `topasiaedu/community-auto-scheduler`; default branch is `main`.
- [x] **0.3** **Blocking check — System Environment Variables.** App source does not read `VERCEL_URL` / `VERCEL_ENV` / `VERCEL_GIT_`* / `VERCEL_BRANCH_URL`. Re-run anytime:

```powershell
git grep -n "VERCEL_URL\|VERCEL_ENV\|VERCEL_GIT_\|VERCEL_BRANCH_URL" -- . ":(exclude).github" ":(exclude)GitHub-Vercel-Private-Repo-Deploy-CHECKLIST.md"
```

- [x] **0.4** Phase 0.3 returned **no app results** — Appendix A not required.
- [x] **0.5** GitHub Actions is **enabled** on this private repo (`allowed_actions: all`). Free private repos include **2,000** Linux minutes/month; a Vite build here is typically 1–3 minutes.
- [x] **0.6** Pinned Vercel CLI version: `**59.5.0`** (installed globally on this machine; matches `npm view vercel version`). Re-check before rotating:

```powershell
npm view vercel version
```

- [x] **0.7** Policy recorded: developers must use **branches inside the repo**, not forks. Preview workflow already skips fork PRs (`if: head.repo == github.repository`).
- [x] **0.8** **NMCAS-specific — CORS.** Documented for cutover. Production web origin today:
  `https://community-auto-scheduler-web-topasiaedus-projects.vercel.app`
  Ensure Render `WEB_ORIGIN` includes that origin. For PR previews, either add each preview origin later or verify cutover on production only first. Without this, preview UI loads but API calls fail in the browser.

- [ ] **0.9** **Align Vercel Root Directory (do before relying on Actions builds).** Dashboard currently shows Root Directory = `apps/web`, but this monorepo’s supported build is the **repo-root** `vercel.json` (`npm ci` + `npm run build:web` + copy to `dist`). In Vercel → Project → Settings → General → **Root Directory**, clear it to the repository root (empty / `.`), then save. Leave unchecked until you confirm in the dashboard.

---

## Phase 1 — Company / owner credentials

- [x] **1.1** Signed in to Vercel CLI as `**topasiaedu`** (owner of team `topasiaedus-projects`).
- [ ] **1.2** **You do this (browser):** [Account Settings → Tokens](https://vercel.com/account/tokens). Create a token named `github-actions-deploy`, **scoped to team** `topasiaedu's projects` **/** `topasiaedus-projects`.

> Wrong token scope is the number one cause of cryptic auth failure later.

- [ ] **1.3** **You do this:** store the token in the company password manager. Never commit it. You will paste it into GitHub secret `VERCEL_TOKEN` in Phase 2.
- [x] **1.4** Pinned CLI installed and project linked from repo root:

```powershell
npm install --global vercel@59.5.0
vercel login
vercel link --yes --scope topasiaedus-projects --project community-auto-scheduler-web
```

Linked: `topasiaedus-projects/community-auto-scheduler-web`.

> Note: `vercel link` may append `VERCEL_OIDC_TOKEN` to local `.env.local`. That file stays gitignored. Do not commit it.

- [x] **1.5** Recorded from `.vercel/project.json`:


| Field       | Value                              |
| ----------- | ---------------------------------- |
| `orgId`     | `team_EiCBlv6Nk8Ms1DpqavqTEmVJ`    |
| `projectId` | `prj_Ytxg1SAlyDgoOBI0nj3Y5BYmQyKW` |


- [x] **1.6** `.vercel/` is listed in `.gitignore`.

**Phase 1 handoff values for your Phase 2 secrets**


| Secret name         | Value to paste                     |
| ------------------- | ---------------------------------- |
| `VERCEL_TOKEN`      | from 1.2 (you create)              |
| `VERCEL_ORG_ID`     | `team_EiCBlv6Nk8Ms1DpqavqTEmVJ`    |
| `VERCEL_PROJECT_ID` | `prj_Ytxg1SAlyDgoOBI0nj3Y5BYmQyKW` |


---

## Phase 2 — GitHub secrets

- [x] **2.1** Repo → **Settings → Secrets and variables → Actions**.
- [x] **2.2** Add all three. Names are **case-sensitive** and must match the workflows.


| Secret name         | Value                              | Added |
| ------------------- | ---------------------------------- | ----- |
| `VERCEL_TOKEN`      | token from 1.2                     | [x]   |
| `VERCEL_ORG_ID`     | `team_EiCBlv6Nk8Ms1DpqavqTEmVJ`    | [x]   |
| `VERCEL_PROJECT_ID` | `prj_Ytxg1SAlyDgoOBI0nj3Y5BYmQyKW` | [x]   |


- [x] **2.3** Confirm Vercel project **Environment Variables** include Production + Preview:


| Variable                 | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `VITE_API_URL`           | HTTPS Render API origin, no trailing slash |
| `VITE_SUPABASE_URL`      | Supabase project URL                       |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key                          |


`vercel pull` in Actions is what injects these into the GitHub runner build.

---

## Phase 3 — Prove Actions (repo is already private)

> Classic checklist keeps the repo public until Actions is green. **This repo is already private**, so native Git may already be the only fallback. Prove Actions carefully before relying on `deploymentEnabled: false`.

Workflow files are **already in the repo**:

- `.github/workflows/vercel-production.yml`
- `.github/workflows/vercel-preview.yml`

- [x] **3.1** Confirm both workflow files exist and pin `vercel@59.5.0`.
- [x] **3.2** Confirm root `vercel.json` still has SPA build settings. **Do not** add `git.deploymentEnabled: false` until Phase 4 (Actions must be green first).
- [x] **3.3** After secrets (Phase 2) are set, open a throwaway PR from a developer account **inside** the repo (not a fork).
- [x] **3.4** Confirm the **Vercel Preview** Actions job is green.
- [x] **3.5** Confirm a preview URL was posted as a PR comment by the workflow.
- [x] **3.6** Open that URL and click through: sign-in, project picker, schedules, WhatsApp panel. Check browser console for CORS errors against Render (`WEB_ORIGIN` / Phase 0.8).
- [x] **3.7** Merge to `main` (or push a trivial commit) and confirm **Vercel Production** Actions job is green.
- [x] **3.8** Confirm production domain serves the new deployment.

At this stage you may see **two** deploys (native Git + Actions). That is expected until Phase 4.

If Actions fails, keep using native Git and fix secrets/token scope before Phase 4.

---

## Phase 4 — Cut deployment over to Actions

- [x] **4.1** Merged `"git": { "deploymentEnabled": false }` into the existing root `vercel.json` (SPA build fields kept).
- [ ] **4.2** Leave Vercel **Settings → Git → Ignored Build Step** on **Automatic**. Do not set `exit 0` or “Don’t build anything”. *(Confirm in dashboard — cannot be set from repo.)*
- [ ] **4.3** Merge the `vercel.json` change to `main`.
- [ ] **4.4** Push a trivial commit to `main` (or merge a tiny PR).
- [ ] **4.5** Confirm **exactly one** production deployment appears in Vercel, sourced from the CLI / Actions path.
- [ ] **4.6** Confirm the production domain serves that deployment.
- [ ] **4.7** Confirm no red native **Vercel** Git check blocks PRs. Require the **Vercel Preview** workflow check instead (Phase 6).

---

## Phase 5 — Stay private (already done) + prove personal accounts

- [x] **5.1** Repo is **Private**.
- [ ] **5.2** From a **personal** GitHub account with repo access, open a PR. Confirm preview job green + URL comment.
- [ ] **5.3** From that account, merge to `main`. Confirm a single production deploy via Actions succeeds.
- [ ] **5.4** If 5.2 and 5.3 pass, personal commit emails no longer block web deploys.

---

## Phase 6 — Lock it down

- [ ] **6.1** Branch protection on `main`: require a pull request before merging.
- [ ] **6.2** Require the **Vercel Preview** workflow status check to pass.
- [ ] **6.3** Disallow direct pushes to `main`.
- [ ] **6.4** **Do NOT** enable “Require deployments to succeed before merging”. That setting expects native Git deploys and will block merges after they are disabled.
- [ ] **6.5** Restrict who can push to `main`. Anyone with that access can ship production via the company token.
- [ ] **6.6** Turn on **Deployment Protection** for Preview environments in Vercel project settings (previews stay URL-reachable even when the repo is private).
- [ ] **6.7** Schedule `VERCEL_TOKEN` rotation; rotate when a repo admin leaves.
- [ ] **6.8** Review who has access to repository secrets.
- [ ] **6.9** Keep Render `WEB_ORIGIN` limited to known production (and any approved preview) origins.

---

## Phase 7 — Handover to developers

- [ ] **7.1** Workflow unchanged: personal GitHub account, personal commit email, normal push and PR.
- [ ] **7.2** Preview URLs arrive as a **workflow comment on the PR**, not from the Vercel bot.
- [ ] **7.3** Branches in the repo, not forks.
- [ ] **7.4** API/CORS: if preview API calls fail, ask an admin to update Render `WEB_ORIGIN` (or use protected production testing).
- [ ] **7.5** Optionally align commit identity for attribution (not required for deploys):

```powershell
git config --global user.email "12345678+username@users.noreply.github.com"
git config --global user.name "Your GitHub Username"
```

Copy the exact noreply address from GitHub → **Settings → Emails**. Do not guess it.

---

## Known trade-offs you are accepting


| Trade-off                                                         | Impact                              | Mitigation                                     |
| ----------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| No Vercel bot PR comment                                          | Cosmetic                            | Workflow posts its own comment                 |
| No branch-specific preview URLs (`project-git-branch.vercel.app`) | Bookmarked branch URLs stop working | Use the per-deployment URL from the PR comment |
| System Env Vars absent at build time                              | Can break builds that read them     | Phase 0.3 — clear for NMCAS                    |
| Static `VERCEL_TOKEN`                                             | Rotation burden                     | Phase 6.7                                      |
| Fork PRs cannot deploy                                            | External contributors blocked       | Use in-repo branches                           |
| Builds consume GitHub Actions minutes                             | 2,000/month on Free                 | Monitor; cheaper than $20/seat/month           |
| Preview CORS vs Render                                            | Preview UI may not talk to API      | Phase 0.8 / 6.9                                |


Unaffected on Vercel: Instant Rollback, custom domains, edge network, analytics.  
Unaffected outside Vercel: Render API, Supabase, pg-boss, WhatsApp session behaviour.

---

## Rollback plan

If Actions cutover breaks production:

- [ ] **R.1** Remove `"git": { "deploymentEnabled": false }` from root `vercel.json` (keep SPA build fields) and push — or temporarily delete that `git` block only.
- [ ] **R.2** Native Vercel Git auto-deploy resumes (subject to Vercel’s private-repo rules for your account type).
- [ ] **R.3** Diagnose Actions (token scope, org/project IDs, `VITE_`* env, deployer email), then re-enable `deploymentEnabled: false`.

Optional nuclear option for org-transfer scenarios only: temporarily make the repo public — **not** preferred for NMCAS; treat as last resort.

---

## Troubleshooting


| Symptom                                            | Cause                                                    | Fix                                                                          |
| -------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Error: The specified token is not valid`          | Secret name mismatch, token revoked, or wrong team scope | Recreate token scoped to the correct team; re-add `VERCEL_TOKEN`             |
| `Project not found`                                | `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` mismatch vs token  | Re-copy from `.vercel/project.json` after `vercel link` as the owner account |
| Git author must have access…                       | CLI author check (rare with token-only)                  | Confirm token scope; re-add a CI author amend only if this appears           |
| Two production deploys per push                    | Native Git still enabled                                 | Confirm `deploymentEnabled: false` is on `main`                              |
| Actions green but GitHub shows failed Vercel check | Native Git integration still active                      | Same as above; require workflow check instead                                |
| Preview deploys, production does not               | Wrong branch filter                                      | Production workflow must use `main`                                          |
| Build fails on missing `VITE_*`                    | Vars only in local `.env`                                | Add them in Vercel → Environment Variables for Production **and** Preview    |
| App builds but API calls fail from preview         | CORS / `WEB_ORIGIN`                                      | Phase 0.8 — add origin on Render or test via production                      |
| PR comment missing                                 | Missing permission                                       | `permissions.pull-requests: write`; org/user must allow `GITHUB_TOKEN` write |
| Secrets empty on a PR                              | PR from a fork                                           | Use an in-repo branch                                                        |
| Merging blocked                                    | “Require deployments to succeed” is on                   | Turn it off; require the Actions workflow check instead                      |


---

## Appendix A — Replacing System Environment Variables

**Not required for NMCAS** (Phase 0.3 clear). Kept for future regressions.

If app code later reads `VERCEL_GIT_*` at build time, add to the job `env:` block:

```yaml
env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  VERCEL_GIT_COMMIT_SHA: ${{ github.sha }}
  VERCEL_GIT_COMMIT_REF: ${{ github.ref_name }}
  VERCEL_GIT_REPO_SLUG: ${{ github.event.repository.name }}
  VERCEL_GIT_REPO_OWNER: ${{ github.repository_owner }}
```

Do not rely on `VERCEL_URL` at build time; use a stable configured value if needed.

---

## Appendix B — Production workflow

Path: `.github/workflows/vercel-production.yml`  
(Pinned CLI is already in the file in this repo.)

---

## Appendix C — Preview workflow

Path: `.github/workflows/vercel-preview.yml`  
(Pinned CLI, fork skip, and PR comment upsert are already in the file in this repo.)

---

## Appendix D — Monorepo note (NMCAS)

Vercel **Root Directory** for this project is the **repository root**. Root `vercel.json` builds `@nmcas/web` and copies `apps/web/dist` → `dist`.  

Do **not** set workflow `working-directory: apps/web` unless you also change the Vercel project Root Directory to match.

The API on Render is **out of scope** for these workflows. Render continues to deploy from the same GitHub repo via its own integration.

---

## Sign-off


| Phase                                | Owner                            | Date       | Done |
| ------------------------------------ | -------------------------------- | ---------- | ---- |
| 0 — Pre-flight                       | agent + you (0.9 Root Directory) | 2026-08-26 | [~]  |
| 1 — Credentials + `vercel link`      | agent; you finish 1.2 / 1.3      | 2026-08-26 | [~]  |
| 2 — GitHub secrets + Vercel `VITE_*` | you                              |            | [ ]  |
| 3 — Prove Actions                    |                                  |            | [ ]  |
| 4 — Confirm cutover                  |                                  |            | [ ]  |
| 5 — Prove personal accounts          |                                  |            | [ ]  |
| 6 — Lock it down                     |                                  |            | [ ]  |
| 7 — Developer handover               |                                  |            | [ ]  |


**Success criteria:** a developer using a personal Gmail or Yahoo GitHub account opens a PR against this **private** repo, receives a working preview URL comment, merges to `main`, and the Vercel production web app updates via Actions — without buying extra Vercel seats. Render API + Supabase keep working independently.

---

## References

- [Deploying Git repositories with Vercel](https://vercel.com/docs/git)
- [Troubleshoot project collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)
- [Use GitHub Actions with Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)
- [Git configuration](https://vercel.com/docs/project-configuration/git-configuration) (`git.deploymentEnabled`)
- [Why commits are not triggering deployments](https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel)
- [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan)
- NMCAS deploy notes: `[DEPLOY.md](DEPLOY.md)`

