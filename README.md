# community-auto-scheduler (NMCAS)

Internal monorepo for **NMCAS** — compose, schedule, and auto-send WhatsApp messages to community groups. Product context and phased plan live in [`NMCAS-VAULT/wiki/overview.md`](NMCAS-VAULT/wiki/overview.md).

## Prerequisites

- Node.js **20+**
- A [Supabase](https://supabase.com) project (Postgres + Storage for WA sessions + Auth for the web app)

## Workspace layout

| Path | Role |
|------|------|
| `apps/api` | Fastify HTTP API, Prisma, **pg-boss** worker, Baileys (P2 Post + **P3 Poll** slice) |
| `apps/web` | Vite + React + TypeScript UI shell |
| `packages/db` | Prisma schema and `@nmcas/db` client export |
| `packages/wa-session-storage` | Supabase Storage–backed Baileys auth state (from P0) |
| `p0-spike` | Standalone WhatsApp + Storage spike — see [`p0-spike/README.md`](p0-spike/README.md) |

## First-time setup

1. Copy [`.env.example`](.env.example) to **`.env` in the repo root`** and fill in values. The API loads **repo root `.env`**, then `apps/api/.env` (optional overrides). The P0 spike also reads the **root** `.env` (not `p0-spike/.env`).
2. Use a Postgres URL that works with **pg-boss** (session/direct connection). Supabase **transaction pooler** (port `6543`) can break `LISTEN` / long-lived workers — prefer **session mode** on port **5432** for `DATABASE_URL` when running the API locally.
3. Install and build workspace packages:

   ```bash
   npm install
   npm run build -w @nmcas/db
   npm run build -w @nmcas/wa-session-storage
   ```

4. Apply database migrations (loads root `.env` and `apps/api/.env` via [`scripts/migrate-deploy.mjs`](scripts/migrate-deploy.mjs)):

   ```bash
   npm run db:deploy
   ```

   Manual equivalent: `cd packages/db` then `npx prisma migrate deploy` with `DATABASE_URL` in the environment.

   For local iteration with new migrations, use `npm run migrate:dev -w @nmcas/db` instead (creates/applies dev migrations).

5. **Seed the default project** (required for `POST /messages`). This uses [`scripts/seed.mjs`](scripts/seed.mjs), which loads the **repo root** `.env` (and optional `apps/api/.env`) before Prisma runs — same pattern as `npm run db:deploy`.

   ```bash
   npm run db:seed
   ```

6. **Supabase Storage:** ensure two **private** buckets exist (names must match `.env`): **`NMCAS_SESSION_BUCKET`** (Baileys session JSON, same as P0) and **`NMCAS_POST_MEDIA_BUCKET`** (scheduled post images).

### Prisma and poolers

If `DATABASE_URL` uses **PgBouncer in transaction mode**, `prisma migrate` may need a separate **direct** Postgres URL. Supabase documents this pattern as `DATABASE_URL` + `DIRECT_URL` in the Prisma + Supabase guide: [Prisma — Supabase](https://www.prisma.io/docs/guides/database/supabase). This repo’s initial schema uses only `DATABASE_URL` in [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma); add `directUrl` when you introduce a pooler URL for the app.

## Development

Run API and web together (API on port **3001** by default, Vite on **5173**). Vite reads **`PORT` from the repo root `.env`** so the dev proxy targets the same port the API uses. If `3001` is already used, set **`PORT=3002`** (or free the port) — the proxy follows automatically. Set **`VITE_API_URL`** only when calling the API without the Vite proxy (e.g. production preview).

```bash
npm run dev
```

`npm run dev` uses **`concurrently --kill-others-on-fail`**: if the API cannot bind (e.g. `EADDRINUSE` on `3001`) or Vite cannot bind (**`strictPort`** on **5173**), the whole dev command stops instead of leaving a half-broken stack (for example Vite on **5174** while CORS still only allows **5173**).

**If dev exits immediately:** free **5173** and **3001** (or change `PORT` in root `.env`). On Windows PowerShell, for example: `Get-NetTCPConnection -LocalPort 3001,5173 -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess`.

**`WEB_ORIGIN`:** comma-separated list of allowed browser origins for CORS (must include the exact origin you open in the browser, including port). Example: `http://localhost:5173,http://localhost:5174`.

**Auth (production-shaped):** the API expects **`Authorization: Bearer`** (Supabase session JWT) and **`X-Project-Id`** on scoped routes. Set **`SUPABASE_ANON_KEY`** on the API and **`VITE_SUPABASE_URL`** / **`VITE_SUPABASE_ANON_KEY`** for the web app (see [`.env.example`](.env.example)). The web UI signs in with Supabase; **`GET /projects`** lists memberships; **`POST /projects`** creates a project (signed-in users).

**Supabase Storage `fetch failed` on `sessions/.../creds.json`:** the API machine cannot reach your Supabase project over HTTPS (wrong `SUPABASE_URL`, VPN/firewall/DNS, project paused, or a short network blip). Session writes retry a few times; if it still fails, fix connectivity and restart the API. Until creds save reliably, WhatsApp stays disconnected and scheduled posts fail with **WhatsApp is not connected** (see the row error in **Scheduled messages**).

**WhatsApp status flashing / terminal `connectionReplaced` (440):** another client is using the same session (second `npm run dev`, WhatsApp Web in a browser, or another linked device). Only one process should use the Storage session; close extra Web sessions and duplicate API processes. The API waits longer before reconnecting after 440 and only shows **connected** after the socket stays open for a few seconds, to avoid UI flicker.

- **API:** `GET /health`, `GET /ready` (public); `GET`/`POST /projects` (auth); scoped routes: `GET/POST /messages`, `GET /wa/*`, `POST /wa/session/reset`, `POST /uploads/post-image` (auth + `X-Project-Id`). See [`apps/api/src/index.ts`](apps/api/src/index.ts).
- **Web:** sign-in, project switcher, schedule **Post** or **Poll**, message list, WhatsApp QR ([`apps/web/src/App.tsx`](apps/web/src/App.tsx)). Dev: Vite proxies `/api/*` ([`apps/web/vite.config.ts`](apps/web/vite.config.ts)). Production: set **`VITE_API_URL`** to the API origin.

## Deployment

Production layout matches the vault: **API** (Docker-friendly Node process) and **Vercel** for the static web build. Step-by-step env vars, Render Docker, and caveats (including free-tier sleep vs PRD Starter) are in [`DEPLOY.md`](DEPLOY.md). Root [`Dockerfile`](Dockerfile) and [`vercel.json`](vercel.json) support that flow.

Typecheck all workspaces:

```bash
npm run typecheck
```

## pg-boss

The API creates the queue **`send-scheduled-message`** ([`apps/api/src/queues.ts`](apps/api/src/queues.ts)). Creating a scheduled post enqueues a job with **`startAfter`** = `scheduledAt`; the worker sends via Baileys and updates row status.

## P2 / P3 manual test (e.g. “NMCAS test” group)

1. `npm run dev` — link WhatsApp from the web QR if needed.
2. **Refresh groups** — confirm your community test group (e.g. **NMCAS test**) appears in the picker.
3. **Post:** choose the group, enter short text, set **Send at (MYT)** a minute or two ahead, click **Schedule**. Watch **Scheduled messages** until **SENT**; confirm the message appears in the group.
4. **Poll:** select **Poll**, enter a question and at least two options (up to 12), optionally **Allow multiple answers**, schedule ahead, confirm a native poll arrives at send time.
5. Optional post: attach an image and repeat (object path stored in DB; worker downloads from `NMCAS_POST_MEDIA_BUCKET`).

## Related docs

- WhatsApp P0 spike: [`p0-spike/README.md`](p0-spike/README.md)
- Vault / PRD / implementation snapshot: `NMCAS-VAULT/` (e.g. [`NMCAS-VAULT/wiki/overview.md`](NMCAS-VAULT/wiki/overview.md), [`NMCAS-VAULT/wiki/sources/2026-04-18-nmcas-implementation-snapshot.md`](NMCAS-VAULT/wiki/sources/2026-04-18-nmcas-implementation-snapshot.md))
