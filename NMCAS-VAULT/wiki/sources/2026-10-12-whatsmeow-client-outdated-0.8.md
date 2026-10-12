---
title: "WhatsApp client outdated: whatsmeow-node 0.7.0 → 0.8.0 (2026-10-12)"
type: "source-summary"
updated: "2026-10-12"
sources: 1
tags: ["nmcas", "whatsapp", "whatsmeow", "digitalocean", "operations", "post-mortem"]
---

# WhatsApp client outdated: whatsmeow-node 0.7.0 → 0.8.0 (2026-10-12)

**Raw:** `raw/sources/2026-10-12-whatsmeow-client-outdated-0.8.md`

## Summary

Operator saw the Connect UI `lastError` that WhatsApp rejected this app version (client outdated). Live `/health` was fine (`waWarmClients: 1`, RSS ~85–130 MB) — same shape as [[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]], not the 512 MB QR OOM class. Repo lockfile still resolved **whatsmeow-node 0.7.0** (June client **2.3000.1040847988**). Shipped **0.8.0** on `main` as `73489da` (advertises **2.3000.1047769893**). Droplet `update-server` was **not** run from this chat; operator must restart before Clear session / scan.

## Key claims

- The UI string is set only on `err-client-outdated` / (after the fix) `client_outdated`.
- Do **not** Clear session while still on 0.7.0 — wipe cannot get a QR from an expired binary.
- npm latest at session time was **0.8.0** (28 Sep). Upstream whatsmeow tip (7 Oct) is newer; no published binding of that tip yet.
- If 0.8.0 still 405s after deploy, stop and wait for the next whatsmeow-node release.

## Repo fix (`73489da`)

| Where | Change |
|-------|--------|
| `apps/api/package.json` + lockfile | Exact pin `0.8.0` |
| `wa-manager.ts` | `isClientOutdated`, `markClientOutdated()`, handle `client_outdated`; skip reconnect/QR repair/exit-spawn loop |

## Operator (open)

1. `cd /root/community-auto-scheduler && npm run update-server`
2. `pm2 logs nmcas-api` — `loggedIn` / `qr event codeLen=` / still outdated
3. Re-check `https://nmcas-server.nmmedia.app/health`

## See also

- [[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]]
- [[wiki/concepts/wa-connection-pool]]
- [[wiki/concepts/wa-qr-pairing-low-ram]]
- [[wiki/overview]]
- [[wiki/sources/2026-10-12-telegram-wa-disconnect-alert]]
