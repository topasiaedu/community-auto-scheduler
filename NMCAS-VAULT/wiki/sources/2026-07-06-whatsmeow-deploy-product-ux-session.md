---
title: "Source digest: whatsmeow deploy + Value vs Reminder (2026-07-06)"
type: "source-summary"
updated: "2026-07-06"
sources: 1
tags: ["nmcas", "whatsmeow", "deploy", "product", "ux", "reminder", "value-post"]
---

# Source digest: `2026-07-06-whatsmeow-deploy-product-ux-session.md`

**Raw path:** `raw/sources/2026-07-06-whatsmeow-deploy-product-ux-session.md`

## One-line summary

Production deploy on **Render + Vercel + Supabase** is live with **whatsmeow-node** and **SQLite→`WhatsAppSessionBlob`** sessions; product direction shifts from generic Post/Poll to **Value post** (fresh copy, poll nested) vs **Reminder** (all SOP templates including countdown graphics and stickers); UX plan targets **intern-ready** Schedule flow — **not yet implemented**.

## Key engineering claims (shipped)

- **Stack:** `@whatsmeow-node/whatsmeow-node`, `messageSecret` on community sends, pg-boss worker unchanged in role.
- **Sessions:** Local SQLite per project, bytes in Postgres `WhatsAppSessionBlob`; pooler `DATABASE_URL` OK; `WHATSAPP_STORE_URL` optional on Render.
- **URLs:** API `community-auto-scheduler.onrender.com`; web `community-auto-scheduler-web.vercel.app`.
- **UI fixes:** QR via `qrcode.react`; Community + Channel picker for Announcements; compose layout fixes.

## Key product claims (decided, pending code)

- **Value post** = new copy each campaign; formats: image+caption (default), poll, text-only.
- **Reminder** = anything from project SOP: stickers (no caption), countdown/welcome graphics (image, usually no caption).
- **Countdown graphics are Reminders**, not Value posts (owner correction).
- **Multi-project:** same flow, per-project SOP assets — no single-campaign hardcoding.
- **Poll** stays under Value, not top-level.

## Key UX claims (planned)

- Nav: Queue / **Schedule** / **WhatsApp** / Settings.
- Compose: ① Where ② Value|Reminder ③ Content ④ When (MYT) + confirm modal.
- Settings: per-project SOP URL + campaign note; later template library.

## Wiki integration

- [[wiki/overview]] — runtime stack + phased plan note
- [[wiki/concepts/value-vs-reminder-messages]] — operator message model
- [[wiki/concepts/wa-connection-pool]] — whatsmeow + session blob addendum
- [[wiki/entities/scheduled-message]] — planned fields / open questions
- [[wiki/sources/2026-04-21-stability-hardening-session]] — prior worker/rescue behaviour still applies

## Superseded timings (2026-07-07)

§6 event-day “1hr, 15min, live” and vague “starting soon” were **lossy/incorrect paraphrases**. Authoritative two-track schedule (Show Up + Value Post, exact MYT times) is in [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]] from saved SOP screenshots.

## Open questions (resolved for build — see 2026-07-07 planning)

- Template library: **yes** (named SOP slots per project)
- Reminder caption: **optional on images only**
- Stickers: **static WebP only**
- Event chips: **on Schedule screen**; start + end datetimes; see [[wiki/concepts/campaign-message-schedule]]
