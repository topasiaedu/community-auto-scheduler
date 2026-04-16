# NMCAS implementation snapshot (repo state)

**Date:** 2026-04-18  
**Purpose:** Record what the `community-auto-scheduler` monorepo implements as of this date, operational notes, and decisions that differ from or extend the V1 PRD digest.

---

## Product phases (vault alignment)

| Phase | Vault intent | Repo state (2026-04-18) |
|-------|----------------|-------------------------|
| P0 | Baileys + Storage spike | **Done** (see prior ingests). |
| P1–P3 | Monorepo, Post + Poll E2E | **Done** — Fastify, Prisma, pg-boss, worker send, web compose/list. |
| P4 | Multi-project pool + switcher | **Implemented** — `WaConnectionPool`, per-project `WaManager`, `X-Project-Id`, `GET/POST /projects`, web project picker + `POST /projects` for any signed-in user. |
| P5 | Failure notifications, live status, responsive UI | **Partial** — Worker sends **one** WhatsApp DM to configured MSISDN on `FAILED` (`NMCAS_FAILURE_NOTIFY_MSISDN`, default `60139968817`). No `NotifyRecipient` CRUD UI. **Live status:** HTTP polling only (no SSE). **Responsive / dashboard UX overhaul:** explicitly deferred. |
| P6 | Hardening + deployment | **Partial** — `Dockerfile`, `docker-entrypoint.sh` (migrate + start), `.dockerignore`, root `vercel.json`, `DEPLOY.md`. **No** Render Blueprint (`render.yaml` removed); Docker deploy documented for Render + Vercel. |

---

## Authentication and access control

- **Supabase Auth** in the browser (`@supabase/supabase-js`); API verifies **`Authorization: Bearer`** with **`SUPABASE_ANON_KEY`** via `auth.getUser`.
- **Prisma `ProjectMember`** links Supabase `user.id` to `Project` (`@@unique([userId, projectId])`).
- **`AUTH_AUTO_JOIN_DEFAULT_PROJECT`** (default on): first authenticated user with zero memberships gets a row for `DEFAULT_PROJECT_ID` if that `Project` exists (seed).
- Scoped routes require **`X-Project-Id`** plus membership check.
- **`/health`** and **`/ready`** stay public.

---

## API surface (non-exhaustive)

- Public: `GET /health`, `GET /ready`.
- Auth only: `GET /projects`, `POST /projects`.
- Auth + `X-Project-Id`: `GET/POST /messages`, `GET /wa/status`, `GET /wa/qr`, `GET /wa/groups`, `POST /wa/session/reset`, `POST /uploads/post-image`.

---

## Worker behaviour

- **`handleSendScheduledMessageJobs`** uses **`WaConnectionPool`**: `start(projectId)` then send on that socket.
- On **`FAILED`**, DB is updated then a **failure alert** WhatsApp text is sent to **`{NMCAS_FAILURE_NOTIFY_MSISDN}@s.whatsapp.net`** using the **same project’s** socket. If WhatsApp is not connected, **no alert** can be sent (same limitation as PRD: send via that project’s instance).

---

## Deployment

- **Docker:** root `Dockerfile` runs `npm ci`, `npm run build:api`; entrypoint runs `prisma migrate deploy` then `node apps/api/dist/index.js`.
- **Render:** Documented as **Docker** Web Service; **free tier** allowed but **spins down** — PRD still recommends **Starter** for reliable scheduling; optional external HTTP pings (e.g. uptime monitors) may reduce sleep but are **not** a guarantee.
- **Vercel:** Static build `apps/web/dist`; **`VITE_API_URL`** must point at the API origin in production.

---

## Intentional non-goals (this snapshot)

- **RLS** on Postgres tables not implemented (API uses Prisma with service-level DB URL).
- **Full P5 UI** (Settings screen, per-project notify list, SSE, mobile polish) not started beyond minimal web + polling.
- **README / vault UX overhaul** deferred to a later pass.

---

## Files worth knowing

| Area | Paths |
|------|--------|
| API entry | `apps/api/src/index.ts` |
| Auth hooks | `apps/api/src/auth/supabase-auth.ts` |
| WA pool | `apps/api/src/wa/wa-pool.ts`, `apps/api/src/wa/wa-manager.ts` |
| Worker + failure notify | `apps/api/src/worker/send-scheduled-message.ts` |
| Env | `apps/api/src/env.ts`, `.env.example` |
| Deploy | `DEPLOY.md`, `Dockerfile`, `docker-entrypoint.sh`, `vercel.json` |
