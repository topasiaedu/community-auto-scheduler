---
title: "WhatsApp connection pool (Baileys multi-instance)"
type: "concept"
updated: "2026-04-18"
sources: 4
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

## Session persistence

Baileys generates auth credentials (JSON) that must persist across process restarts. In NMCAS these are stored in **Supabase Storage** (private bucket) rather than the local filesystem, using a custom `authState` adapter. This avoids the need for Render Persistent Disk.

Session folder naming convention: `sessions/{projectId}/` within the private Supabase Storage bucket.

## P0 reference implementation

The repo contains a runnable spike at **`p0-spike/`** (Supabase-backed multi-file auth state + QR connect). Operator notes, env vars, bucket setup, and Baileys troubleshooting live in `raw/sources/2026-04-16-p0-spike-completion.md` and [[wiki/sources/2026-04-16-p0-spike-completion]].

## P4 implementation (current monorepo)

The API ships **`WaConnectionPool`** (`apps/api/src/wa/wa-pool.ts`): one **`WaManager(env, projectId)`** per project. HTTP routes under `X-Project-Id` delegate to `pool.getManager(projectId)`; the pg-boss worker calls `pool.start(projectId)` and `getSocket(projectId)` for the row’s `projectId`. **`start()`** remains **idempotent** (reuse live WebSocket when healthy) — still required because `/wa/status` and `/wa/qr` are polled.

Historical **P2** behaviour (single default `WaManager`) is superseded by this pool; operational lessons (428 vs 515, Storage `keys.set` latency, cred-save ordering) remain valid and are captured in [[wiki/sources/2026-04-17-wa-p2-api-stability]]. Snapshot: [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]].

## Reconnect handling

If a socket disconnects (phone offline, WA session expired), the pool marks the project `DISCONNECTED`. Queued jobs for that project will fail with an appropriate error and trigger failure notifications. The Settings screen surfaces the QR code for reauth.

## Risk note

Baileys is an **unofficial** WhatsApp client. Sending bulk or high-frequency messages can trigger account restrictions. NMCAS is designed for low-volume community posts. Each project should maintain a backup number for testing.

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`
- Implementation notes: `raw/sources/2026-04-16-p0-spike-completion.md`
- API stability (P2): `raw/sources/2026-04-17-wa-p2-api-stability.md`
- Implementation snapshot: `raw/sources/2026-04-18-nmcas-implementation-snapshot.md`

## See also

- [[wiki/concepts/multi-project-architecture]]
- [[wiki/entities/project]]
- [[wiki/overview]]
