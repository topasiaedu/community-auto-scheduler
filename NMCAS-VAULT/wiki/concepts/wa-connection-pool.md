---
title: "WhatsApp connection pool (Baileys multi-instance)"
type: "concept"
updated: "2026-04-21"
sources: 5
tags: ["baileys", "whatsapp", "architecture", "nmcas"]
---

# WhatsApp connection pool (Baileys multi-instance)

## What it is

The API backend maintains a **connection pool** — a singleton Map that holds one active Baileys WebSocket instance per project, keyed by `projectId`:

```
connectionPool: Map<projectId, BaileysSocket>
  "project-abc" → BaileysSocket (state: CONNECTED)
  "project-xyz" → BaileysSocket (state: DISCONNECTED — needs QR)
```

When a scheduled job fires, the worker looks up `projectId` in the pool and sends via the correct socket. When the Settings screen is opened for a project, the pool creates or reconnects that project's socket and streams the QR code to the UI.

## Why personal WhatsApp (not Meta Cloud API)

Meta's Business API cannot manage WhatsApp communities — it cannot create groups, add members to community subgroups, or post to community announcement channels. Baileys (unofficial personal WA client) is the only option for community management use cases.

## Session persistence

Baileys generates auth credentials (JSON) that must persist across process restarts. In NMCAS these are stored in **Supabase Storage** (private bucket) rather than the local filesystem, using a custom `authState` adapter. This avoids the need for Render Persistent Disk.

Session folder naming convention: `sessions/{projectId}/` within the private Supabase Storage bucket.

## P4 implementation (current monorepo)

The API ships **`WaConnectionPool`** (`apps/api/src/wa/wa-pool.ts`): one **`WaManager(env, projectId)`** per project. HTTP routes under `X-Project-Id` delegate to `pool.getManager(projectId)`; the pg-boss worker calls `pool.start(projectId)` and `getSocket(projectId)`.

**`start()`** is **idempotent** — reuses a live WebSocket when healthy, boots only when `socket` is missing or `ws.isClosed`, and returns early without booting when a `reconnectTimer` is armed (critical: avoids bypassing Baileys' backoff and causing 440 loops).

## Reconnect handling and backoff

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

## Free-tier infrastructure notes (confirmed 2026-04-21)

- **Render free tier:** Adequate with UptimeRobot 5-min pings (prevents 15-min spin-down). 512MB RAM; `NODE_OPTIONS=--max-old-space-size=432` in Dockerfile.
- **Supabase free tier:** Adequate. Connection drops prevented by TCP keepalive params on pg-boss URL and Prisma `SELECT 1` heartbeat every 4 min. Project pausing prevented by UptimeRobot-triggered activity.

## Risk note

Baileys is an **unofficial** WhatsApp client. Sending bulk or high-frequency messages can trigger account restrictions. NMCAS is designed for low-volume community posts.

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`
- Implementation notes: `raw/sources/2026-04-16-p0-spike-completion.md`
- API stability (P2): `raw/sources/2026-04-17-wa-p2-api-stability.md`
- Implementation snapshot: `raw/sources/2026-04-18-nmcas-implementation-snapshot.md`
- Stability hardening: `raw/sources/2026-04-21-stability-hardening-session.md`

## See also

- [[wiki/concepts/multi-project-architecture]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/entities/project]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-04-21-stability-hardening-session]]
- [[wiki/overview]]
