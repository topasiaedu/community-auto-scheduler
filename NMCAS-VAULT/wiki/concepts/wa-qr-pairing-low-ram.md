---
title: "WhatsApp QR pairing on low-RAM hosts"
type: "concept"
updated: "2026-08-27"
sources: 3
tags: ["whatsmeow", "whatsapp", "qr", "pairing", "digitalocean", "nmcas"]
---

# WhatsApp QR pairing on low-RAM hosts

## Problem

On NMCAS production (**512 MB DigitalOcean Droplet + swap**), operators saw:

- No QR in the UI (`hasQr: false`, `/wa/qr` → 204)
- `bootPhase: awaiting_scan` then **`qr:timeout`** in a loop
- Phone WhatsApp app: "connection failed" when scanning (when QR did appear)

The whatsmeow **QR channel can open** (`getQRChannel()` + `connect()` succeed) while the Go process **never emits the `qr` event**. Two production causes with the **same UI** (`hasQr: false`, `/wa/qr` 204, `awaiting_scan` then timeout / “QR never arrived”):

1. **RAM** — other warm Go processes on the 512 MB Droplet (see below and [[wiki/sources/2026-08-27-wa-qr-pairing-do512-incident-session]]).
2. **Client outdated** — WhatsApp 405 / `err-client-outdated`; bundled whatsmeow Web version expired. Confirmed 2026-08-27 with healthy RSS and `waWarmClients: 1` ([[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]]). **Check PM2** before assuming RAM.


## Correct pairing order (whatsmeow-node)

Per upstream docs and [[wiki/sources/2026-08-27-wa-qr-pairing-do512-incident-session]]:

1. Register `client.on("qr", …)` **before** pairing calls (NMCAS: in `attachClientEvents` at client creation).
2. `init()` — if no JID, device is not paired.
3. **`prepareForQrPairing`** — shut down **other** projects' Go processes on the same API host.
4. Dispose any stale client for this project; brief pause for RAM reclaim.
5. **New** `createClient()` + `init()` — spawn Go only after RAM is free.
6. `getQRChannel()` then `connect()` — QR arrives asynchronously via `qr` event.
7. Never call `getQRChannel()` on a client whose store was wiped without recreating the client.

## NMCAS implementation

| Mechanism | Location |
|-----------|----------|
| `openFreshQrPairing()` | `apps/api/src/wa/wa-manager.ts` |
| `prepareForQrPairing()` | `apps/api/src/wa/wa-pool.ts` |
| `onBeforeQrPairing` callback | Injected at pool `getManager()` |
| Auto-repair (max 3) | `scheduleQrRepair()` on `qr:timeout` / `qr:error` |
| Phone fallback | `POST /wa/pair-code`, `requestPairCode()` |
| Diagnostics | `bootPhase`, `pairing`, `lastError` on `/wa/status` |

## Environment tuning (512 MB)

| Variable | Recommended | Why |
|----------|-------------|-----|
| `WA_MAX_WARM_CLIENTS` | **`1`** | Each warm client ≈ tens of MB Go RSS + connect spikes ~700 MB total ([[wiki/sources/2026-07-16-do-migration-oom-incident-session]]) |
| `WA_ALWAYS_ON` | `true` for sends | OK for scheduling; pairing still needs RAM-first boot |
| Swap | 2 GB on DO | Absorbs spike lag; does not prevent QR failure if multiple Go processes compete |

## Fallback: phone number pairing

When QR never appears:

1. Web UI → WhatsApp → **Get pairing code** (digits + country code, no `+`).
2. API: `connect()` **then** `pairCode(phone)` (opposite order from QR).
3. Operator enters code in WhatsApp → Linked devices → Link with phone number.

## Anti-patterns (caused Aug 2026 incidents)

- Spawning Go via `init()` **before** evicting peer warm clients.
- Treating `isConnected()` as "linked" without `isLoggedIn()`.
- Unbounded auto-repair loop on `qr:timeout`.
- Running Render + DO API simultaneously (duplicate sends — separate incident class).
- Leaving **whatsmeow-node** on an old npm minor (e.g. 0.6.0) until WhatsApp returns **`err-client-outdated`** — Clear session cannot fix this.
- Trusting lastError `WA_MAX_WARM_CLIENTS=1` without PM2 confirmation.

## Sources

- `raw/sources/2026-08-27-wa-qr-pairing-do512-incident-session.md`
- `raw/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade.md`
- `raw/sources/2026-07-16-do-migration-oom-incident-session.md`

## See also

- [[wiki/concepts/wa-connection-pool]]
- [[wiki/sources/2026-08-27-wa-qr-pairing-do512-incident-session]]
- [[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]]
- [[wiki/sources/2026-07-27-wa-reliability-always-on-plan]]
