# P0 spike — Baileys + Supabase Storage

This folder validates the riskiest part of NMCAS before P1: **WhatsApp (Baileys) with auth JSON persisted in Supabase Storage** under `sessions/{NMCAS_PROJECT_ID}/`, so sessions survive process restarts without a local disk on Render.

## Prerequisites

- Node.js 20+ recommended
- A [Supabase](https://supabase.com) project
- A **private** Storage bucket (name is up to you; set `NMCAS_SESSION_BUCKET` to match)
- WhatsApp on your phone (to scan QR)

## Supabase setup

1. In the Supabase dashboard, open **Storage** → **New bucket**.
2. Name it (for example) `nmcas-sessions`, leave it **private**, create it.
3. For this spike only, the script uses **`SUPABASE_SERVICE_ROLE_KEY`** so Storage RLS policies are not required. **Do not** put that key in a frontend, commit it, or share it. For production, replace with a server-side secret and tight Storage policies.

## Local configuration

Use the **monorepo root** [`.env`](../.env) (same file as `apps/api`). The spike loads `../../.env` relative to `p0-spike/src`, so you do **not** keep a separate `p0-spike/.env` for normal runs.

Required variables (see also root [`.env.example`](../.env.example)):

- `SUPABASE_URL` — Project URL from **Settings → API**
- `SUPABASE_SERVICE_ROLE_KEY` — **service_role** secret (same screen)
- `NMCAS_SESSION_BUCKET` — bucket name you created
- `NMCAS_PROJECT_ID` — any stable id (e.g. `p0-local-test`); objects live under `sessions/<id>/`
- Optional: `NMCAS_TEST_GROUP_JID` — group you are in (`...@g.us`); after login, one short test message is sent there.

## Install and run

```bash
cd p0-spike
npm install
npm run spike
```

- First run: scan the QR printed in the terminal (**WhatsApp → Settings → Linked devices → Link a device**).
- Confirm in Supabase **Storage → your bucket** that files appear under `sessions/<NMCAS_PROJECT_ID>/`.
- Stop the script (Ctrl+C), run `npm run spike` again: you should reconnect **without** a new QR while the session is still valid on the device.

## What “success” looks like

- QR links once; Storage contains `creds.json` and various `*.json` key files.
- Second run connects without QR (proves read path from Storage).
- If `NMCAS_TEST_GROUP_JID` is set, the group receives the test line once per successful `open` event.

## Resetting a session

Delete all objects under `sessions/<NMCAS_PROJECT_ID>/` in the bucket (Supabase dashboard), then run `npm run spike` again to get a fresh QR.

## Typecheck

```bash
npm run typecheck
```
