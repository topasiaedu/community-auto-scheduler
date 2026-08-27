---
title: "WA QR pairing failure on DO 512 MB (2026-08-27)"
type: "source-summary"
updated: "2026-08-27"
sources: 1
tags: ["nmcas", "whatsapp", "whatsmeow", "digitalocean", "oom", "qr-pairing", "operations", "post-mortem"]
---

# WA QR pairing failure on DO 512 MB (2026-08-27)

**Raw:** `raw/sources/2026-08-27-wa-qr-pairing-do512-incident-session.md`

## Summary

Production operators could not link WhatsApp: the UI never showed a QR (`GET /wa/qr` → **204**), phone scan reported connection failure, and after partial recovery the app looped **awaiting_scan → QR timeout**. Secondary symptom: **infinite Loading groups** after link. Root cause on the shared **512 MB DigitalOcean** API host: whatsmeow Go subprocess started **before** evicting other warm clients, so the QR channel opened but the **`qr` event never fired** under memory pressure. Fixes on `main` (Aug 26–27): RAM-first `openFreshQrPairing()`, zombie-state repair, capped auto-retry, groups timeouts, and **`POST /wa/pair-code`** phone fallback in the web UI.

## Diagnostic signatures

| Snapshot | Meaning |
|----------|---------|
| `startWorkInFlight: true`, `hasQr: false` | Boot hung in `init()` / reconnect (up to 120 s) |
| `state: connected`, `pairing: true`, `hasQr: false` | Zombie: socket up, not logged in; retries blocked |
| `bootPhase: awaiting_scan`, then `QR timed out` | Channel open, no QR payload — classic low-RAM failure mode |

## Root causes (condensed)

1. **512 MB + multiple warm Go clients** — same class of issue as [[wiki/sources/2026-07-16-do-migration-oom-incident-session]] but during **pairing**, not send.
2. **Wrong boot order** — `createClient()` + `init()` ran before `prepareForQrPairing()` freed RAM.
3. **`isConnected()` ≠ linked** — UI state `connected` without `isLoggedIn()`.
4. **Groups IPC unbounded** — 120 s `getJoinedGroups()` hung the browser spinner.

## Fixes shipped

| Area | Change |
|------|--------|
| Boot | `openFreshQrPairing()`: evict peers → dispose → sleep → **then** spawn Go |
| Repair | Max **3** QR auto-retries; immediate `close()` on `qr:timeout` |
| Fallback | `POST /wa/pair-code` + web "Link with phone number" |
| Status | `bootPhase`, `shouldKickStartForQr()`, `isSendReady()` requires login |
| Groups | 25 s API cap, 30 s client abort, 503 on timeout |

**Commits:** `ca712be`, `f022040`, `6bbc743`, `460fc9c` (2026-08-26 — 2026-08-27).

## Operator actions

1. Deploy: `npm run update-server` on DO; hard-refresh web.
2. Set **`WA_MAX_WARM_CLIENTS=1`** in API `.env` on 512 MB hosts.
3. Prefer **phone pairing code** if QR still fails after deploy.
4. After connect, wait 30–60 s then **Refresh groups**.

## Contradictions / wiki updates

- **Always-on + `WA_MAX_WARM_CLIENTS=4`** ([[wiki/sources/2026-07-27-wa-reliability-always-on-plan]]) is **unsafe for QR pairing** on 512 MB without forcing `1` warm client. See [[wiki/concepts/wa-connection-pool]] (updated 2026-08-27).
- Prior DO note (idle eviction, max 1 warm) helped sends but did not cover **QR boot ordering**.
- **UI signature is not unique to RAM** — later same day, [[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]] showed identical `awaiting_scan` / 204 from **expired whatsmeow client version**.

## See also

- [[wiki/concepts/wa-connection-pool]] — QR pairing on low RAM, env tuning
- [[wiki/sources/2026-07-16-do-migration-oom-incident-session]] — host RAM / swap context
- [[wiki/sources/2026-07-27-wa-reliability-always-on-plan]] — always-on design (pairing caveat)
- [[wiki/overview]] — production topology

## Later same day

[[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]] — identical UI with **healthy RAM**; cause was **whatsmeow-node 0.6.0** / `err-client-outdated`. Do not treat every `awaiting_scan` + 204 as this RAM incident.
