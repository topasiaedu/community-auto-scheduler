---
title: "Campaign message schedule (SOP slots)"
type: "concept"
updated: "2026-07-07"
sources: 1
tags: ["nmcas", "sop", "product", "scheduling", "campaign"]
---

# Campaign message schedule (SOP slots)

## What this is

WhatsApp community campaigns follow a **named playbook** of message slots — each with a **trigger** (day + clock time) and a **content shape**. The reference SOP (Dr Jasmine Show Up) splits messages into two tracks that map directly to NMCAS operator kinds: see [[wiki/concepts/value-vs-reminder-messages]].

This concept is **project-agnostic**; each Project stores its own assets/times in the **Reminder template library**.

## Two tracks

| SOP track | NMCAS kind | What |
|-----------|------------|------|
| **Show Up** | **Reminder** | Fixed attendance sequence (welcome, countdowns, starting soon, live, sticker) |
| **Value Post** | **Value** | Fresh content posts (separate Value Post SOP) |

## Reference schedule (Dr Jasmine Show Up)

From [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]. All times **MYT (GMT+8)**. Webinar start ≈ 8:00 PM.

### Show Up (Reminders)

| # | Slot | Day | Time | Content |
|---|------|-----|------|---------|
| 01 | Welcome | −4 days | 3:00 PM | Welcome image + copy |
| 02 | 2-Day Countdown | −2 days | 3:00 PM | Countdown image |
| 03 | 1-Day Countdown | −1 day | 8:00 PM | Countdown image |
| 04 | Starting Soon | day 0 | 11:00 AM | "Starting soon" image |
| 05 | LIVE NOW | day 0 | 7:58 PM (start − 2 min) | Live link message |
| 06 | Sticker | day 0 | 8:18 PM (start + 18 min) | Sticker (no caption) |

### Value Post (Value)

| Slot | Day | Time | Note |
|------|-----|------|------|
| Value Post 1 | −3 days | 11:00 AM | 1 day after Welcome |
| Value Post 2 | −1 day | 11:00 AM | Morning of 1-day before |
| Value Post 3 | +1 day | 11:00 AM | Post-webinar follow-up |

## Trigger model (two anchors)

Triggers are **not** a single offset from one moment. They need two operator inputs on the Schedule screen:

1. **Webinar date** (calendar day). Most slots = `webinarDate − N days @ fixed MYT clock time`.
2. **Event start time** (clock). Only LIVE NOW and Sticker are minute-offsets from start (−2 min, +18 min).

### Quick chips (derived)

When the operator enters webinar date (and event start time), chips compute absolute `scheduledAt`:

| Chip | Formula |
|------|---------|
| Welcome (−4d 3PM) | webinarDate − 4d @ 15:00 |
| 2-Day Countdown (−2d 3PM) | webinarDate − 2d @ 15:00 |
| 1-Day Countdown (−1d 8PM) | webinarDate − 1d @ 20:00 |
| Starting Soon (day0 11AM) | webinarDate @ 11:00 |
| LIVE NOW | eventStart − 2 min |
| Sticker | eventStart + 18 min |
| Value Post morning | chosen day @ 11:00 |

Clock times (3 PM / 11 AM / 8 PM) are **fixed** per slot (owner decision 2026-07-07) — the intern does not edit them. They pick the webinar date + event start time and each slot fires at its SOP-defined clock time automatically. (Cross-project variation, if ever needed, is a future concern; V1 bakes the SOP times in.)

## NMCAS default template slots

A new project's Reminder template library should seed these named slots (assets + default day/time, all editable):

`Welcome`, `2-Day Countdown`, `1-Day Countdown`, `Starting Soon`, `Live Now`, `Post-Live Sticker`.

Value Posts are authored fresh (not templated assets), but the schedule slots (−3d, −1d, +1d mornings) can be suggested.

## Corrections (2026-07-07)

Earlier notes fabricated "10:00 AM / 1 hour before / 2 hours after end". The saved SOP screenshots show the real two-track schedule above. Prior [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]] §6 timings are superseded.

## See also

- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]
- [[wiki/overview]]
