---
title: "WhatsApp connection pool (Baileys multi-instance)"
type: "concept"
updated: "2026-04-13"
sources: 1
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

## Reconnect handling

If a socket disconnects (phone offline, WA session expired), the pool marks the project `DISCONNECTED`. Queued jobs for that project will fail with an appropriate error and trigger failure notifications. The Settings screen surfaces the QR code for reauth.

## Risk note

Baileys is an **unofficial** WhatsApp client. Sending bulk or high-frequency messages can trigger account restrictions. NMCAS is designed for low-volume community posts. Each project should maintain a backup number for testing.

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`

## See also

- [[wiki/concepts/multi-project-architecture]]
- [[wiki/entities/project]]
- [[wiki/overview]]
