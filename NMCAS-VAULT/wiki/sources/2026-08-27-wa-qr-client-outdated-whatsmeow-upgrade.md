---
title: "WA QR missing: whatsmeow client outdated (2026-08-27)"
type: "source-summary"
updated: "2026-08-27"
sources: 1
tags: ["nmcas", "whatsapp", "whatsmeow", "digitalocean", "qr-pairing", "operations", "post-mortem"]
---

# WA QR missing: whatsmeow client outdated (2026-08-27)

**Raw:** `raw/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade.md`

## Summary

Same UI as the morning RAM pairing incident — **no QR**, `/wa/qr` **204**, `bootPhase: awaiting_scan` then “QR never arrived” — but **RAM was healthy** (`rssMb` ~122, `waWarmClients: 1`). PM2 showed **`err-client-outdated`** and **no** `qr event` while `@whatsmeow-node/whatsmeow-node` was **0.6.0**. WhatsApp rejected the bundled Web client version (405). Hotfix: install **0.7.0** on the droplet and restart `nmcas-api`. Proof: `qr event … codeLen=277`; operator scanned successfully.

## Diagnostic signatures

| Signal | This incident |
|--------|----------------|
| `awaiting_scan` + `hasQr: false` | Channel open; **no QR payload** |
| `GET /wa/qr` 204 | `latestQr` never set |
| PM2 `event=err-client-outdated` | Protocol / client version expired |
| PM2 `qr event … codeLen=` missing | Distinguishes from “QR exists but UI failed” |
| `/health` low RSS, 1 warm client | **Not** the 512 MB spawn-under-pressure class |

## Root cause

Pinned **whatsmeow-node 0.6.0** (2026-04-24) while **0.7.0** existed on npm (2026-06-20). The Node package does not auto-refresh WhatsApp’s advertised version. Secondary: after 3 QR repairs, `/wa/status` still kicked `start()`, spawning Go in a loop (misleading `WA_MAX_WARM_CLIENTS=1` lastError).

## Fixes

| Where | Change |
|-------|--------|
| Droplet | `npm install @whatsmeow-node/whatsmeow-node@0.7.0 -w @nmcas/api`; `pm2 restart nmcas-api` |
| Repo | `^0.7.0` in `apps/api/package.json` + lockfile |
| Pairing | Do not kick `start()` after max QR repairs; fail fast on `err-client-outdated` |

## Contradictions

- [[wiki/sources/2026-08-27-wa-qr-pairing-do512-incident-session]] and [[wiki/concepts/wa-qr-pairing-low-ram]] treated **`awaiting_scan` + timeout + 204** as **classic low-RAM**. That signature is **not unique** — **client outdated** looks the same in the UI. Always check PM2 for `err-client-outdated` vs timeout-only.
- The lastError text pointing at `WA_MAX_WARM_CLIENTS=1` can be **wrong** when the engine is expired.

## Operator

1. `pm2 logs nmcas-api` — `err-client-outdated` → bump whatsmeow-node; timeout-only + many warm clients → RAM pairing runbook.
2. Commit lockfile so `git pull` + `update-server` does not downgrade the droplet.
3. Expect this class of failure again when WhatsApp expires the next bundled version.

## See also

- [[wiki/concepts/wa-qr-pairing-low-ram]]
- [[wiki/concepts/wa-connection-pool]]
- [[wiki/sources/2026-08-27-wa-qr-pairing-do512-incident-session]]
- [[wiki/overview]]
