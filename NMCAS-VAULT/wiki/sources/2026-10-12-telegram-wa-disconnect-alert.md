---
title: "Telegram alert when WhatsApp disconnects"
type: "source-summary"
updated: "2026-10-12"
sources: 1
tags: ["nmcas", "telegram", "whatsapp", "notification"]
---

# Telegram alert when WhatsApp disconnects

Digest of `raw/sources/2026-10-12-telegram-wa-disconnect-alert.md`.

The operator asked for a Telegram group message when a warm WhatsApp session is down, in addition to the 8:00 AM WhatsApp daily digest. They chose a 3-minute wait, an immediate alert on logout, and one message when the session can send again. Brief reconnects stay silent.

Shipped as `e04313e` on `main`. Wording revised in `c7d5448`: a down session starts with 🔴 and a recovered session starts with 🟢. The `[NMCAS]` label is gone. See `raw/sources/2026-10-12-telegram-alert-message-wording.md`. The bot is `@nmcas_status_bot`. The group is **NMCAS Status Update**. The token and the negative chat id live only in the droplet `.env`. `npm run update-server` does not copy that file.

A test run on the server returned `Telegram token or chat id is empty` while the values existed only on the operator's PC. After the lines were added on the droplet, the operator said the live WhatsApp check and the Telegram send run correctly. This chat did not see the group message.

This is not the withdrawn "arrived in the community" Telegram plan. See [[wiki/analysis/telegram-wa-disconnect-alert]], [[wiki/analysis/telegram-post-status-implementation-plan]].

## Key claims

- The alert is an in-process loop beside the daily digest, not a pg-boss job.
- Logout and "client outdated" alert immediately. Other drops wait `NMCAS_WA_DOWN_GRACE_MS` (default 3 minutes), once.
- An on-screen QR pauses the clock. Recovery is sent only after the down message was accepted.
- Missing token or chat id does not stop API startup.
- `/health` `waWarmClients` is not a connected/disconnected signal. `/wa/status` requires a bearer token.

## Links

- [[wiki/analysis/telegram-wa-disconnect-alert]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/entities/project]]
- [[wiki/overview]]
