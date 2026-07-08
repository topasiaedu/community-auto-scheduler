---
title: "Source digest: whatsmeow deploy + Value vs Reminder (2026-07-06)"
type: "source-summary"
updated: "2026-07-08"
sources: 1
tags: ["nmcas", "whatsmeow", "deploy", "product", "ux", "reminder", "value-post"]
---

# Source digest: `2026-07-06-whatsmeow-deploy-product-ux-session.md`

**Raw path:** `raw/sources/2026-07-06-whatsmeow-deploy-product-ux-session.md`

## One-line summary

Production deploy on **Render + Vercel + Supabase** is live with **whatsmeow-node** and **SQLite→`WhatsAppSessionBlob`** sessions; product direction shifts from generic Post/Poll to **Value post** vs **Reminder**; full intern UX is specified in [[wiki/analysis/p7-ux-spec]] — **not yet implemented**.

## Key engineering claims (shipped)

- **Stack:** `@whatsmeow-node/whatsmeow-node`, `messageSecret` on community sends, pg-boss worker unchanged in role.
- **Sessions:** Local SQLite per project, bytes in Postgres `WhatsAppSessionBlob`; pooler `DATABASE_URL` OK.
- **URLs:** API `community-auto-scheduler.onrender.com`; web `community-auto-scheduler-web.vercel.app`.
- **UI fixes:** QR via `qrcode.react`; Community + Channel picker for Announcements; compose layout fixes.

## Key product claims (locked in P7)

- **Value post** = fresh copy; campaign wizard uses IMAGE_CAPTION only; poll/text in single-message mode.
- **Reminder** = SOP templates; IMAGE slots require templated caption; LIVE NOW = TEXT; sticker = STICKER only.
- **Countdown graphics are Reminders**, not Value posts.
- **Multi-project:** per-project template library + campaigns.

## UX superseded by P7 (2026-07-08)

This raw session proposed a **one-page** Schedule (no wizard) and Reminders with **no caption by default**. **Superseded** by:

- [[wiki/analysis/p7-ux-spec]] — 5-step campaign wizard + single-message mode
- [[wiki/analysis/p7-implementation-plan]] — build phases
- [[wiki/concepts/value-vs-reminder-messages]] — caption rules

Nav rename (Schedule / WhatsApp) and confirm modals from this session **still apply**.

## Superseded timings (2026-07-07)

§6 vague event-day timings replaced by [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]].

## Resolved open questions (raw §9)

| Raw question | Resolution |
|--------------|------------|
| Template picker vs upload | **Template library** (6 slots) in Settings |
| Reminder caption | **Required** on IMAGE slots (templated); TEXT for LIVE NOW; none on STICKER |
| API enum migration | `operatorKind` + formats; keep legacy `POST`/`POLL` |
| Sticker bucket | Same bucket; prefix `stickers/` |

## Wiki integration

- [[wiki/overview]]
- [[wiki/analysis/p7-ux-spec]]
- [[wiki/analysis/p7-implementation-plan]]
- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/concepts/wa-connection-pool]]
