---
title: "WhatsApp connection pool (whatsmeow-node)"
type: "concept"
updated: "2026-07-16"
sources: 7
tags: ["whatsmeow", "whatsapp", "architecture", "nmcas"]
---

# WhatsApp connection pool

> **2026-07 migration:** Production API uses **`@whatsmeow-node/whatsmeow-node`**, not Baileys. Pool shape is unchanged (`WaConnectionPool`, one manager per `projectId`). Sessions: **local SQLite** persisted to Postgres **`WhatsAppSessionBlob`**. Community Announcements sends include **`messageSecret`**. Sections below that mention Baileys describe the **pre-2026-07** implementation unless noted.

## What it is

The API backend maintains a **connection pool** — a singleton Map that holds one active WhatsApp Web instance per project, keyed by `projectId`:

```
connectionPool: Map<projectId, WaManager>
  "project-abc" → connected
  "project-xyz" → disconnected — needs QR
```

When a scheduled job fires, the worker looks up `projectId` in the pool and sends via the correct connection. Connect UI streams QR for that project's session.

## Why personal WhatsApp (not Meta Cloud API)

Meta's Business API cannot manage WhatsApp communities — it cannot create groups, add members to community subgroups, or post to community announcement channels. An unofficial personal WA client (Baileys historically; **whatsmeow-node** now) is the option used for community management.

## Session persistence (current — 2026-07)

- Runtime: SQLite file per project (whatsmeow store).
- Durability: bytea row in **`WhatsAppSessionBlob`** via Prisma + `DATABASE_URL` (Supabase pooler OK).
- Post images: still **Supabase Storage** (`NMCAS_POST_MEDIA_BUCKET`).
- Optional local dev: `WHATSAPP_STORE_URL=file:./data/wa-sessions`.
- Legacy: P0 spike and Supabase Storage Baileys adapter — **not** used by shipped API.

## P4 implementation (current monorepo)

The API ships **`WaConnectionPool`** (`apps/api/src/wa/wa-pool.ts`): one **`WaManager(env, projectId)`** per project. HTTP routes under `X-Project-Id` delegate to `pool.getManager(projectId)`; the pg-boss worker calls `pool.start(projectId)` and uses whatsmeow send helpers.

**`start()`** remains **idempotent** — reuse healthy connection, boot when missing; avoid fighting library reconnect backoff.

---

## Historical: Baileys implementation (pre-2026-07)

The following described Baileys; behaviour concepts (timeout→FAILED, no `forceRestart` in worker, rescue sweep) still apply to the worker layer.

### Baileys pool shape

```
connectionPool: Map<projectId, BaileysSocket>
```

### Baileys session persistence (superseded)

Auth credentials in **Supabase Storage** private bucket, `sessions/{projectId}/`.

### Reconnect handling and backoff (Baileys)

Baileys fires `connection.update` with `connection: 'close'` on disconnect. `handleConnectionClosed` schedules a reconnect via `scheduleBootAfterClose`:

| Disconnect reason | Delay |
|---|---|
| `restartRequired` (515) | 500ms |
| Default | 2500ms |
| `connectionClosed` (428) | 8000ms |
| `connectionReplaced` (440) | 45000ms |

The worker **must not call `forceRestart()`** from timeout paths — doing so bypasses this backoff and causes a 440 replacement loop. `forceRestart()` exists on `WaManager` and `WaConnectionPool` for future administrative use only.

## Worker interaction with pool

When the worker fires for a scheduled message:

1. `waPool.start(projectId)` — ensures socket is booting/connected (idempotent).
2. `waPool.getSocket(projectId)` — returns live socket or `undefined`.
3. **`sock === undefined`** (reconnecting, backoff armed): reset row to `PENDING`, return. Rescue sweep retries when WA is back.
4. **`sock.ws.isClosed`** (TCP half-open, not yet detected by Baileys): reset row to `PENDING`, return.
5. **Send timeout (120s) on a connected socket**: mark row `FAILED` with "may have been delivered" message. **Do not retry automatically** — Baileys transmits immediately on `sendMessage`, so the message likely reached WhatsApp before the ACK timeout. Automatic retry would duplicate.

## Timeout = "unknown delivery"

Baileys' `sendMessage` returns a Promise that resolves only when WhatsApp ACKs. On a slow/unstable connection the ACK can arrive after our 120s timeout. The message was likely delivered but we cannot confirm. The correct response is:
- Mark `FAILED` with a clear message to the user.
- User checks the group and uses the **Re-queue** button only if the message was not there.

## Baileys logger

Set to `pino({ level: "silent" })` in production (`NODE_ENV === "production"`). Without this, Baileys emits verbose Signal Protocol debug logs (`[rtkcc]`, `Closing session: SessionEntry`) that flood Render logs on every reconnect.

## Free-tier infrastructure notes

### Render (superseded for API — 2026-07-16)

Prior assessment (2026-04-21): Render free tier adequate with UptimeRobot pings. **Superseded** after whatsmeow-node production OOM on 512 MB — connect spikes to ~700 MB RSS. API moved to DigitalOcean with swap. See [[wiki/sources/2026-07-16-do-migration-oom-incident-session]].

Historical Render settings (Docker): `NODE_OPTIONS=--max-old-space-size=256` after commit `16b811a` (was 432).

### DigitalOcean (current API host)

- **Shared 512 MB Droplet** + **2 GB swap**; PM2 process `nmcas-api` on port **3002**; nginx TLS at `nmcas-server.nmmedia.app`.
- Steady state ~175–265 MB with one warm WA client; connect/hydrate spike ~700 MB — swap absorbs lag; PM2 restarts on hard failure.
- **Idle eviction:** `wa-pool.ts` evicts WA after 10 min dashboard idle; max 1 warm client.
- **Session persist throttle:** 5 min interval; skip unchanged `WhatsAppSessionBlob` (mtime/size fingerprint).
- **Never run Render + DO API together** — shared pg-boss queue risks duplicate sends.

### Supabase

Free tier adequate. Connection drops prevented by TCP keepalive params on pg-boss URL and Prisma `SELECT 1` heartbeat every 4 min.

## Risk note

Unofficial WhatsApp clients (Baileys / whatsmeow) can trigger account restrictions if abused. NMCAS is designed for low-volume community posts.

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`
- Implementation notes: `raw/sources/2026-04-16-p0-spike-completion.md`
- API stability (P2): `raw/sources/2026-04-17-wa-p2-api-stability.md`
- Implementation snapshot: `raw/sources/2026-04-18-nmcas-implementation-snapshot.md`
- Stability hardening: `raw/sources/2026-04-21-stability-hardening-session.md`
- whatsmeow migration + deploy: `raw/sources/2026-07-06-whatsmeow-deploy-product-ux-session.md`
- DO migration + OOM incident: `raw/sources/2026-07-16-do-migration-oom-incident-session.md`

## See also

- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/concepts/multi-project-architecture]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/entities/project]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-04-21-stability-hardening-session]]
- [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]]
- [[wiki/sources/2026-07-16-do-migration-oom-incident-session]]
- [[wiki/overview]]
