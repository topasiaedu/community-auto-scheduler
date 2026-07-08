---
title: "Source digest: WhatsApp Community SOP (Dr Jasmine Show Up)"
type: "source-summary"
updated: "2026-07-07"
sources: 1
tags: ["nmcas", "sop", "reference", "campaign-schedule", "reminder", "value-post"]
---

# Source digest: WhatsApp Community SOP — Dr Jasmine Show Up

**Raw path:** `raw/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference.md`
**Assets:** `raw/assets/2026-07-06-dr-jasmine-sop-quick-reference-timeline.png`, `…-full-posting-schedule.png`, `…-whatsapp-community-sop.png/.pdf`

## One-line summary

Example campaign SOP with **two tracks** — **Show Up** (6-message fixed reminder sequence) and **Value Post** (3 fresh content posts) — each with exact MYT clock times anchored to the webinar date, plus two go-live messages anchored to event start.

> Corrects earlier fabricated timings (no "10 AM everywhere", no "1h before", no "2h after end"). Transcribed from the Quick Reference Timeline and Full Posting Schedule screenshots.

## Show Up sequence (Reminders)

| # | Message | Trigger (MYT) |
|---|---------|----------------|
| 01 | Welcome | 4 days before @ 3:00 PM |
| 02 | 2-Day Countdown | 2 days before @ 3:00 PM |
| 03 | 1-Day Countdown | 1 day before @ 8:00 PM |
| 04 | Starting Soon | Webinar day @ 11:00 AM |
| 05 | LIVE NOW | Webinar day @ 7:58 PM (≈ start − 2 min) |
| 06 | Sticker | Webinar day @ 8:18 PM (≈ start + 18 min) |

## Value Post track (Value)

| Trigger (MYT) | Note |
|---------------|------|
| 3 days before @ 11:00 AM | 1 day after Welcome |
| 1 day before @ 11:00 AM | Morning of 1-day before |
| Day after live @ 11:00 AM | Post-webinar follow-up |

## Key corrections

- SOP has **two tracks** (Show Up / Value Post) — maps to Reminder / Value.
- **Welcome = T−4 days @ 3 PM** (not on-join, not T−0).
- **Starting Soon = webinar-day 11 AM** (a morning-of message), **not** "1 hour before".
- **LIVE NOW / Sticker** are the only event-start-anchored rows (−2 min / +18 min).
- **No** "2 hours after end" row exists.
- Webinar start inferred ~**8:00 PM**.

## Timing model → NMCAS chips

Two anchors required on the Schedule screen:

- **Webinar date** → `date − N days @ fixed MYT time` (most rows)
- **Event start time** → minute offsets (LIVE NOW, Sticker)

See [[wiki/concepts/campaign-message-schedule]] for the chip design.

## Content mapping

| SOP message | NMCAS |
|-------------|-------|
| Welcome, countdowns, starting soon | Reminder image |
| LIVE NOW (live link) | Reminder image + caption, or link message (open question) |
| Sticker | Reminder sticker (no caption) |
| Value Posts ×3 | Value image + caption |

## Wiki integration

- [[wiki/concepts/campaign-message-schedule]] — slot + trigger + chip anchors
- [[wiki/concepts/value-vs-reminder-messages]] — Show Up→Reminder, Value Post→Value
- [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]] — prior session (its §6 timings superseded)
- [[wiki/entities/scheduled-message]] — chips + templates

## Open questions

- LIVE NOW: Reminder image w/ caption vs dedicated link message?
- Are 3 PM / 11 AM / 8 PM defaults per template (editable) or campaign-specific?
- Expose minute-precision event-start anchoring (for +18 min sticker)?

## See also

- [[wiki/overview]]
