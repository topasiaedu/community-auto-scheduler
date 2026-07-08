---
title: "Source digest: WhatsApp Community SOP (Dr Jasmine Show Up)"
type: "source-summary"
updated: "2026-07-08"
sources: 1
tags: ["nmcas", "sop", "reference", "campaign-schedule", "reminder", "value-post"]
---

# Source digest: WhatsApp Community SOP — Dr Jasmine Show Up

**Raw path:** `raw/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference.md`
**Assets:** `raw/assets/2026-07-06-dr-jasmine-sop-quick-reference-timeline.png`, `…-full-posting-schedule.png`, `…-whatsapp-community-sop.png/.pdf`

## One-line summary

Example campaign SOP with **two tracks** — **Show Up** (6-message fixed reminder sequence) and **Value Post** (3 fresh content posts) — each with exact MYT clock times anchored to the webinar date, plus two go-live messages anchored to event start.

## Show Up sequence (Reminders)

| # | Message | Trigger (MYT) |
|---|---------|----------------|
| 01 | Welcome | 4 days before @ 3:00 PM |
| 02 | 2-Day Countdown | 2 days before @ 3:00 PM |
| 03 | 1-Day Countdown | 1 day before @ 8:00 PM |
| 04 | Starting Soon | Webinar day @ 11:00 AM |
| 05 | LIVE NOW | event start − 2 min |
| 06 | Sticker | event start + 18 min |

## Value Post track (Value)

| Trigger (MYT) | Note |
|---------------|------|
| 3 days before @ 11:00 AM | 1 day after Welcome |
| 1 day before @ 11:00 AM | Morning of 1-day before |
| Day after live @ 11:00 AM | Post-webinar follow-up |

## Content mapping (resolved 2026-07-07)

| SOP message | NMCAS kind | Format |
|-------------|------------|--------|
| Welcome, 2d, 1d, Starting Soon | Reminder | IMAGE + templated caption |
| LIVE NOW | Reminder | TEXT only (no image) |
| Sticker | Reminder | STICKER (no caption) |
| Value Posts ×3 | Value | IMAGE_CAPTION |

## Timing model → NMCAS

Two anchors on campaign Step 1:

- **Webinar date** → `date − N days @ fixed MYT time`
- **Event start time** → minute offsets (LIVE NOW, Sticker)

Clock times are **fixed** — not editable per campaign. See [[wiki/concepts/campaign-message-schedule]].

## Custom Values (8 fields)

Workshop day/date/time, zoom link, session date/time, zoom ID, zoom passcode — merge into Reminder `bodyTemplate` at schedule time. Full field spec: [[wiki/analysis/p7-ux-spec]] §4 Step 1.

## Wiki integration

- [[wiki/concepts/campaign-message-schedule]] — slot + trigger
- [[wiki/concepts/value-vs-reminder-messages]] — Show Up→Reminder, Value Post→Value
- [[wiki/analysis/p7-ux-spec]] — wizard, API, acceptance matrix
- [[wiki/analysis/p7-implementation-plan]] — build phases

## Resolved questions (formerly open)

| Question | Resolution |
|----------|------------|
| LIVE NOW format | **TEXT only** — confirmed in SOP HTML |
| Editable 3 PM / 11 AM / 8 PM | **Fixed** in v1 — intern sets webinar date + event start only |
| Event-start anchoring | **Yes** — LIVE NOW −2 min, Sticker +18 min |
| Image Reminder captions | **Required** for Welcome through Starting Soon |

## See also

- [[wiki/overview]]
