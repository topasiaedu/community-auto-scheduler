---
title: "WhatsApp post-update notification shipped (2026-10-09)"
type: "source-summary"
updated: "2026-10-09"
sources: 1
tags: ["nmcas", "whatsapp", "notification", "deploy"]
---

# WhatsApp post-update notification shipped (2026-10-09)

**Raw:** `raw/sources/2026-10-09-post-update-whatsapp-ship.md`

## Summary

The Telegram “arrived in every community” idea stays withdrawn. The shipped replacement is one WhatsApp DM to `60139968817` and `60176782206` when a scheduled batch finishes, Sent or Failed. It replaces the immediate `[NMCAS] Failed to send scheduled message…` DM. The daily digest is unchanged. The text does not claim the post is visible in the group.

Code is commit `4450312` on `main` (pushed). Migration `20261009120000_post_status_notice` adds `ScheduledMessage.fanOutBatchId` and `PostStatusNotice`. The operator reported `npm run update-server` on the droplet as done the same evening. This chat did not re-check `/health`, the new table, or a message on either phone.

## Claims

| Claim | Status in this source |
|-------|------------------------|
| One DM per `fanOutBatchId` after rows settle | Stated as implemented in `4450312` |
| Immediate failure DM removed | Stated |
| Production process restarted via `update-server` | Operator said “ok done”; not re-checked here |
| Both phones received a post-update DM | Not observed. Plan phase 4 still open |

## See also

- [[wiki/analysis/telegram-post-status-implementation-plan]]
- [[wiki/analysis/telegram-post-status-delivery-tracking]]
- [[wiki/entities/scheduled-message]]
- [[wiki/entities/project]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]]
- [[wiki/sources/2026-09-09-rdw4-value-no-receipt-notify-vercel]]
