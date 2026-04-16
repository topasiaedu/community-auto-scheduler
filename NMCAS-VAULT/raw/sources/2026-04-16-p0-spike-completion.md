# NMCAS P0 spike — completion notes

**Date:** 2026-04-16  
**Repository path:** `community-auto-scheduler` (root)  
**Spike code:** `p0-spike/` (Node + TypeScript, not committed as part of this ingest instruction set beyond what already exists in the repo)

---

## Purpose of P0

Validate the highest-risk integration before P1: **Baileys** (personal WhatsApp Web) with **session credentials persisted in Supabase Storage** instead of the local filesystem, so future Render deploys do not require a persistent disk for WA auth files.

---

## Supabase: bucket vs table (terminology)

| Concept | What it is | Used in P0 for |
|--------|-------------|----------------|
| **Postgres table** | Relational rows/columns, SQL, migrations, RLS on rows. | *Not* used for raw Baileys multi-file auth in this spike. Future app data (projects, messages, jobs) lives here. |
| **Storage bucket** | Object store (files keyed by path, similar to S3). | **Yes.** Baileys’ multi-file auth maps to many small JSON objects under `sessions/{NMCAS_PROJECT_ID}/` inside a **private** bucket. |

Session files are **objects** (`upload` / `download` / `remove`), not SQL `INSERT` rows, unless the product is redesigned to store key material in tables (not the current NMCAS choice).

---

## What was implemented

- **`p0-spike/src/supabase-multi-file-auth-state.ts`** — Supabase-backed equivalent of Baileys `useMultiFileAuthState`: same mutex-per-path pattern, `BufferJSON` replacer/reviver, `sessions/{projectId}/` prefix.
- **`p0-spike/src/spike.ts`** — Connects with `makeWASocket`, `fetchLatestBaileysVersion`, QR in terminal, `creds.update` → `saveCreds`, optional one-off test message to a group JID from env.
- **`p0-spike/src/env.ts`** — Validates required environment variables.
- **`p0-spike/README.md`** — Operator runbook (bucket setup, `.env`, run, reset session).
- **`p0-spike/.env.example`** — Template for local secrets (never commit real keys).

---

## Environment variables (spike)

| Variable | Role |
|----------|------|
| `SUPABASE_URL` | Project API URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Local spike only:** bypasses Storage RLS; must not ship to browsers or public clients. Production should use server-held secrets and explicit Storage policies. |
| `NMCAS_SESSION_BUCKET` | Name of the **private** Storage bucket. |
| `NMCAS_PROJECT_ID` | Logical project id; all session objects live under `sessions/<id>/`. |
| `NMCAS_TEST_GROUP_JID` (optional) | WhatsApp group JID ending in `@g.us`; if set, sends one short test message after `connection === "open"`. |

---

## How to run (recap)

```bash
cd p0-spike
npm install
npm run spike
```

Typecheck: `npm run typecheck`.

---

## Success criteria (P0 gate)

1. First run: QR scan succeeds; objects appear under `sessions/<NMCAS_PROJECT_ID>/` in the bucket (`creds.json` plus key files).
2. Second run (after stopping the process): reconnect **without** scanning QR again (proves read path from Storage).
3. Optional: test group receives the probe message when `NMCAS_TEST_GROUP_JID` is set.

If these pass, **P0 is satisfied** and P1 (monorepo, Prisma, pg-boss, Fastify skeleton) can proceed.

---

## Resetting a session

Delete all objects under `sessions/<NMCAS_PROJECT_ID>/` in the Storage bucket (dashboard or API), then run the spike again for a fresh QR.

---

## Operational troubleshooting

### Baileys logs: `unexpected error in 'init queries'`, `bad-request`, or HTTP 400/500 in stack traces

WhatsApp Web and Baileys occasionally hit **transient** failures during initial sync (`executeInitQueries` / `fetchProps`). Common mitigations:

1. **Retry** — stop the process and run `npm run spike` again; transient WA-side errors often clear.
2. **Version** — the spike uses `fetchLatestBaileysVersion()` so the client tracks current WA Web protobuf expectations; if issues persist after Baileys upgrades, check upstream Baileys issues for breaking WA changes.
3. **Corrupt partial state** — if loops persist, clear Storage objects for that `NMCAS_PROJECT_ID` and re-scan QR.
4. **Network / region** — unstable connectivity can surface as closed connections or init failures.

Do not treat a single stack trace as proof that Storage is misconfigured if uploads/downloads and second-run login already succeeded.

---

## Security reminders

- Never commit `.env` or the service role key.
- Service role key is for **trusted server / local dev only**; the eventual Render worker must hold secrets via env, not the Vercel frontend.

---

## Next engineering phase (product plan)

After P0 sign-off: **P1** — monorepo scaffold, Prisma schema against Supabase Postgres, pg-boss wiring, Fastify API skeleton, and port or reuse the Storage auth adapter as a shared package used by the worker.
