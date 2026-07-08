---
title: "Value post vs Reminder (operator message model)"
type: "concept"
updated: "2026-07-07"
sources: 1
tags: ["nmcas", "product", "whatsapp", "sop", "ux"]
---

# Value post vs Reminder

## What this is

NMCAS schedules WhatsApp community sends using two **operator-facing** kinds. The split is based on **how content is produced**, not on file format. Applies to **every Project** (multi-campaign); each project has its own SOP assets and copy.

## Value post

**Fresh content written for each campaign.**

| Format | Use | Fields |
|--------|-----|--------|
| **Image + caption** | Default; most common | Custom image + authored caption |
| **Poll** | Occasional engagement | Question + 2–12 options (under Value, not top-level) |
| **Text only** | Rare long text without image | Caption only |

Intern rule: *"We're writing something new → Value."*

## Reminder

**Anything predefined in the project SOP / asset pack.**

| Format | Typical use | Caption |
|--------|-------------|---------|
| **Image** (`imageMessage`) | Countdown/welcome/starting-soon graphics | Usually none — text on graphic; caption **optional** |
| **Sticker** (`stickerMessage`, WebP) | Event-day stickers | **None** (never) |
| **Text** (`conversation`) | LIVE NOW link message | The playbook link/copy (fixed) |

**Countdown graphics are Reminders**, not Value posts — even when they are full branded images.

A Reminder can be an **image, a sticker, or plain text** (e.g. the fixed LIVE NOW join-link message). What makes it a Reminder is that it is **predefined in the SOP playbook**, not the media type.

Intern rule: *"It's in the SOP playbook → Reminder."*

## WhatsApp constraints

- Prefer **one media per scheduled row** for community Announcements.
- Sticker + long caption in one message is avoided; schedule separate rows if SOP needs asset + link text.
- Community sends require **`messageSecret`** (whatsmeow-node) for reactions compatibility.

## Implementation status (2026-07-06)

| Area | Status |
|------|--------|
| Operator model | **Decided** |
| DB `MessageType` (`POST` / `POLL`) | **Legacy** — migration TBD |
| Sticker send + Reminder UI | **Not built** |
| Per-project SOP template library | **Later** — v1 likely upload-only |

## Planned UX (summary)

- Compose top-level: **Value post** | **Reminder**
- Value sub-formats: Image+caption | Poll | Text only
- Reminder: pick/upload SOP asset only; checkered sticker preview
- Confirm modal before schedule; queue badges show kind + sub-format

## SOP track mapping (example)

The reference SOP uses two tracks that map 1:1 to this model — see [[wiki/concepts/campaign-message-schedule]] for exact times:

| SOP track / slot | Kind | Format |
|------------------|------|--------|
| **Show Up:** Welcome | Reminder | Image + copy |
| **Show Up:** 2-Day / 1-Day Countdown | Reminder | Image |
| **Show Up:** Starting Soon | Reminder | Image |
| **Show Up:** LIVE NOW (live link) | Reminder | **Text only** (join link; no image) |
| **Show Up:** Post-Live Sticker | Reminder | Sticker (no caption) |
| **Value Post** ×3 | Value | Image + caption |
| Mid-campaign teaching, polls | Value | — |

**Reminder IMAGE** may include an **optional caption** (e.g. LIVE NOW link text). **Reminder STICKER** never has a caption.

## See also

- [[wiki/concepts/campaign-message-schedule]]
- [[wiki/overview]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]]
- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]
- [[wiki/concepts/multi-project-architecture]]
