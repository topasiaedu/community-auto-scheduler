---
title: "RDW 4.0 Value no-receipt FAILED, notify contact, Vercel pnpm (2026-09-09)"
type: "source-summary"
updated: "2026-09-09"
sources: 1
tags: ["nmcas", "whatsapp", "failed", "receipt", "notify", "vercel", "incident"]
---

# RDW 4.0 Value no-receipt FAILED, notify contact, Vercel pnpm (2026-09-09)

**Raw:** `raw/sources/2026-09-09-rdw4-value-no-receipt-notify-vercel.md`

## Summary

Dr Jasmine **11:00 MYT Value fan-out** (9 Sep 2026, `Jasmine_Post__13_.png`) marked **RDW 4.0** `FAILED` with “No WhatsApp server receipt” for `3EB0546133EC6E9CEC1F3D`. The operator DM is an **ops 1:1 alert**, not a group post. IPC **did accept** the send at 11:00:49; the whatsmeow Go process then exited, so no receipt arrived. Same run: base / 3.0 / 5.0 / 6.0 `SENT`; **RDW 2.0** `FAILED` with no `waMessageId`. If RDW 4.0 already shows the post, **do not Re-queue**.

Ops notify now always includes `60139968817` and `60176782206` (`246ffff`, production API restarted). Web GitHub Action had been failing since `bebc92c` (`pnpm-lock.yaml` → `spawn pnpm ENOENT`); fixed `270bdeb`.

## Cause

Stage B receipt timeout is working. Missing `message:receipt` after a Go crash is **not** proof of non-delivery (inverse of [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]]). Stage C echo still not implemented.

## Ops + CI

- Failure + digest DMs: `DEFAULT_NOTIFY_MSISDNS` in `apps/api/src/lib/notifyMsisdn.ts`. `NotifyRecipient` table unused.
- Vercel Actions must see **npm** lockfile only. Do not commit `pnpm-lock.yaml` ([[wiki/concepts/vercel-github-actions-deploy]]).

## See also

- [[wiki/entities/scheduled-message]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/entities/project]]
- [[wiki/overview]]
