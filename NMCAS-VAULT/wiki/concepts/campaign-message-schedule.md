---
title: "Campaign message schedule (SOP slots)"
type: "concept"
updated: "2026-07-08"
sources: 2
tags: ["nmcas", "sop", "product", "scheduling", "campaign"]
---

# Campaign message schedule (SOP slots)

## What this is

WhatsApp community campaigns follow a **named playbook** of message slots — each with a **trigger** (day + clock time) and a **content shape**. The reference SOP (Dr Jasmine Show Up) splits messages into two tracks that map directly to NMCAS operator kinds: see [[wiki/concepts/value-vs-reminder-messages]].

This concept is **project-agnostic**; each Project stores its own assets in the **Reminder template library**. **Clock times are fixed** (not editable by interns); see [[wiki/analysis/p7-ux-spec]].

## Two tracks

| SOP track | NMCAS kind | What |
|-----------|------------|------|
| **Show Up** | **Reminder** | Fixed attendance sequence (welcome, countdowns, starting soon, live, sticker) |
| **Value Post** | **Value** | Fresh content posts |

## Reference schedule (Dr Jasmine Show Up)

From [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]. All times **MYT (GMT+8)**.

### Show Up (Reminders)

| # | Slot | Day | Time | Content |
|---|------|-----|------|---------|
| 01 | Welcome | −4 days | 3:00 PM | Image + templated caption |
| 02 | 2-Day Countdown | −2 days | 3:00 PM | Image + templated caption |
| 03 | 1-Day Countdown | −1 day | 8:00 PM | Image + templated caption |
| 04 | Starting Soon | day 0 | 11:00 AM | Image + templated caption |
| 05 | LIVE NOW | day 0 | start − 2 min | Text only (join link) |
| 06 | Sticker | day 0 | start + 18 min | Sticker (no caption) |

### Value Post (Value)

| Slot | Day | Time | Note |
|------|-----|------|------|
| Value Post 1 | −3 days | 11:00 AM | 1 day after Welcome |
| Value Post 2 | −1 day | 11:00 AM | Morning of 1-day before |
| Value Post 3 | +1 day | 11:00 AM | Post-webinar follow-up |

**Alternate-day rule:** On other pre-webinar days not in fixed slots, optional Value posts every alternate day @ 11:00 — intern opts in at campaign Step 4 ([[wiki/analysis/p7-ux-spec]] §4).

## Trigger model (two anchors)

1. **Webinar date** (calendar day). Most slots = `webinarDate − N days @ fixed MYT clock time`.
2. **Event start time** (clock). Only LIVE NOW and Sticker are minute-offsets from start (−2 min, +18 min).

### Computed schedule (fixed — intern does not edit)

| Chip | Formula |
|------|---------|
| Welcome (−4d 3PM) | webinarDate − 4d @ 15:00 |
| 2-Day Countdown (−2d 3PM) | webinarDate − 2d @ 15:00 |
| 1-Day Countdown (−1d 8PM) | webinarDate − 1d @ 20:00 |
| Starting Soon (day0 11AM) | webinarDate @ 11:00 |
| LIVE NOW | eventStart − 2 min |
| Sticker | eventStart + 18 min |
| Value Post morning | fixed offsets @ 11:00 |

Clock times are **baked into** `ReminderTemplate` seed data and `campaignSchedule.ts`. Cross-project time variation is out of scope for v1.

## NMCAS default template slots

Seeded on project create (assets uploaded in Settings):

`welcome`, `countdown_2d`, `countdown_1d`, `starting_soon`, `live_now`, `post_live_sticker`.

Value Posts are authored fresh per campaign (not templated).

## Corrections (2026-07-07)

Earlier notes fabricated "10:00 AM / 1 hour before / 2 hours after end". The saved SOP screenshots show the real two-track schedule above. Prior [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]] §6 timings are superseded.

## See also

- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/analysis/p7-ux-spec]]
- [[wiki/analysis/p7-implementation-plan]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]
