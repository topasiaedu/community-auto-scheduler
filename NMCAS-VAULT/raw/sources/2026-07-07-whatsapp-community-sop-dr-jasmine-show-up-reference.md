# Raw source: WhatsApp Community SOP — Dr Jasmine Show Up (reference capture)

**Type:** External SOP reference (example campaign; product decisions remain project-agnostic).
**Date captured:** 2026-07-07
**Origin:** `nm-sop.vercel.app` — WhatsApp Community SOP / Dr Jasmine Show Up
**Assets (saved):**

- `raw/assets/2026-07-06-dr-jasmine-sop-quick-reference-timeline.png` — Quick Reference Timeline (6 Show Up cards)
- `raw/assets/2026-07-06-dr-jasmine-sop-full-posting-schedule.png` — Full Posting Schedule (Show Up + Value Post tracks)
- `raw/assets/2026-07-06-dr-jasmine-show-up-whatsapp-community-sop.png` — full-page screencapture
- `raw/assets/2026-07-07-dr-jasmine-show-up-sop-page.html` — full page HTML (user-provided; authoritative text extract below)

---

## 1. Two message tracks

The SOP separates messages into two categories (toggle badges top-right: **Show Up** / **Value Post**):

| SOP track | Meaning | Maps to NMCAS |
|-----------|---------|----------------|
| **Show Up** | The fixed attendance-driving sequence — welcome, countdowns, "starting soon", live link, post-live sticker. Numbered 01–06. | **Reminder** (SOP playbook assets) |
| **Value Post** | Fresh content posts (own separate "Value Post SOP"). | **Value** |

---

## 2. Show Up sequence (Quick Reference Timeline) — 6 messages

| # | Message | Day | Time (GMT+8 / MYT) |
|---|---------|-----|--------------------|
| 01 | **Welcome** | 4 days before webinar | **3:00 PM** |
| 02 | **2-Day Countdown** | 2 days before webinar | **3:00 PM** |
| 03 | **1-Day Countdown** | 1 day before webinar | **8:00 PM** |
| 04 | **Starting Soon** | Webinar day | **11:00 AM** |
| 05 | **LIVE NOW** | Webinar day | **7:58 PM** |
| 06 | **After Live Start (Sticker)** | Webinar day | **8:18 PM** |

**Inferred webinar start:** ~**8:00 PM** on webinar day (LIVE NOW at 7:58 PM ≈ start − 2 min; Sticker at 8:18 PM ≈ start + 18 min).

---

## 3. Full posting schedule (both tracks interleaved)

| Day bucket | Time | Message | Track |
|------------|------|---------|-------|
| 4 days before | 3:00 PM | **01 Welcome** | Show Up |
| 3 days before | 11:00 AM | **Value Post** — "1 day after Welcome Post" | Value Post |
| 2 days before | 3:00 PM | **02 2-Day Countdown** | Show Up |
| 1 day before | 11:00 AM | **Value Post** — "Morning of 1-day before" | Value Post |
| 1 day before | 8:00 PM | **03 1-Day Countdown** | Show Up |
| Webinar day | 11:00 AM | **04 Starting Soon** | Show Up |
| Webinar day | 7:58 PM | **05 LIVE NOW** | Show Up |
| Webinar day | 8:18 PM | **06 Sticker** | Show Up |
| Day after live | 11:00 AM | **Value Post** — "Post-webinar follow-up" | Value Post |

Value Posts each link to a separate "Open Value Post SOP →" (fresh copy authored per campaign).

---

## 4. Timing model observations (important for NMCAS chips)

The triggers are **not** simple single-offset-from-one-event. They are a mix:

1. **Day offset + fixed clock time** (most messages):
   - Welcome = webinarDate − 4d @ 3:00 PM
   - 2-Day Countdown = webinarDate − 2d @ 3:00 PM
   - 1-Day Countdown = webinarDate − 1d @ 8:00 PM
   - Starting Soon = webinarDate (day 0) @ 11:00 AM
   - Value Posts = −3d @ 11 AM, −1d @ 11 AM, +1d @ 11 AM
2. **Anchored to event start time** (only the two around go-live):
   - LIVE NOW = eventStart − 2 min (7:58 PM for an 8:00 PM start)
   - Sticker = eventStart + 18 min (8:18 PM)

So NMCAS needs **two anchors**, not one:

- **Webinar date** (a calendar day) → most rows are `date − N days @ fixed MYT clock time`.
- **Event start time** (clock) → LIVE NOW and Sticker are minute-offsets from it.

There is **no** "2 hours after event ends" row and **no** generic "1 hour before" row in this SOP — those were fabricated earlier.

---

## 5. Step 0 — Custom Values (from HTML; fill once per campaign)

The SOP page has **Custom Values** that merge into every Show Up message copy. NMCAS campaign setup must collect these:

| Field | Example | Used in |
|-------|---------|---------|
| Workshop day | `Monday` | 2-Day Countdown copy |
| Workshop date | `29/6` | 2-Day Countdown copy |
| Workshop time | `8PM (GMT +8)` | 2-Day, 1-Day copy |
| Zoom link | `http://drjasminechiew.com/zoom` | 1-Day, Starting Soon, LIVE NOW |
| Session date | `Jun 29, 2026` | Starting Soon copy |
| Session time | `8:00PM – 10:00PM (GMT+8)` | Starting Soon copy |
| Zoom ID | `819 5208 2119` | Starting Soon copy |
| Zoom passcode | `8888` | Starting Soon copy |

SOP behaviour: copy buttons blocked until required fields for that message are valid.

---

## 6. Content shape per Show Up message (from HTML — authoritative)

| # | Message | Media | Caption / body | NMCAS format |
|---|---------|-------|----------------|--------------|
| 01 | Welcome | Image `01-welcome.jpeg` | Long templated caption | Reminder IMAGE + caption |
| 02 | 2-Day Countdown | Image `02-2day-countdown.jpeg` | Long templated caption | Reminder IMAGE + caption |
| 03 | 1-Day Countdown | Image `03-1day-countdown.jpeg` | Long templated caption | Reminder IMAGE + caption |
| 04 | Starting Soon | Image `04-starting-soon.jpeg` | Long templated caption | Reminder IMAGE + caption |
| 05 | LIVE NOW | None — text only | Short live link copy | Reminder TEXT |
| 06 | After Live Start | Sticker only — no text | None | Reminder STICKER |

Countdown / Starting Soon are **image + long caption**, not image-only.

**Sticker:** Manual SOP = WhatsApp in-app sticker panel. NMCAS automation = uploaded WebP + `stickerMessage` send.

---

## 7. Value Post rules (from HTML)

**Fixed slots (3):** −3d @ 11am, −1d @ 11am, +1d @ 11am — fresh Value image+caption.

**Alternate-day rule:** On other pre-webinar days not in fixed slots, post Value every alternate day (Mon/Wed/Fri style). NMCAS: optional suggested slots in campaign review.

---

## 8. Mapping to NMCAS (final)

| SOP message | Kind | Format |
|-------------|------|--------|
| Welcome, 2d, 1d, Starting Soon | Reminder | IMAGE + caption (template + custom values) |
| LIVE NOW | Reminder | TEXT |
| Sticker | Reminder | STICKER |
| Value Posts | Value | IMAGE_CAPTION |

---

## 9. Decisions (2026-07-07)

1. LIVE NOW = TEXT only (HTML confirms).
2. Fixed clock times per slot.
3. Anchors: webinar date + event start time.
4. Sticker = eventStart + 18 min (exact).
5. Custom Values required at campaign setup.
6. Show Up image slots = image + caption (not image-only).

---

*Sources: screenshots + HTML page. Wiki: `wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference.md`.*
