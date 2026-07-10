---
title: "Value post vs Reminder (operator message model)"
type: "concept"
updated: "2026-07-08"
sources: 3
tags: ["nmcas", "product", "whatsapp", "sop", "ux"]
---

# Value post vs Reminder

## What this is

NMCAS schedules WhatsApp community sends using two **operator-facing** kinds. The split is based on **how content is produced**, not on file format. Applies to **every Project** (multi-campaign); each project has its own SOP assets and copy.

**Shipped behaviour (2026-07-08):** [[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]]. Plan/API detail: [[wiki/analysis/p7-ux-spec]] (campaign Value step outdated — see ship session).

## Value post

**Fresh content written for each campaign.**

| Format | Use | Fields | Where |
|--------|-----|--------|-------|
| **Image + caption** (`IMAGE_CAPTION`) | Default | `imageUrl` + `copyText` | **Single message** — fans out to all Announcements channels |
| **Poll** (`POLL`) | Occasional engagement | poll fields | Single message |
| **Text only** (`TEXT_ONLY`) | Rare | `copyText` | Single message |

Intern rule: *"We're writing something new → Value."*

**Campaign wizard does not schedule Value posts** (owner decision 2026-07-08).

## Reminder

**Anything predefined in the project SOP / asset pack** — templates in Settings, merged with campaign Custom Values (derived day/time + Zoom fields).

| Format | Typical use | Caption / body |
|--------|-------------|----------------|
| **IMAGE** | Welcome, 2-Day, 1-Day, Starting Soon | **Required** — long **SOP** caption from `reminderTemplateDefaults` + merge |
| **TEXT** | LIVE NOW | **Required** — SOP text; **no image** |
| **STICKER** | Post-live sticker (WebP) | **Never** — **optional** until uploaded; campaign skips if missing |

**Countdown graphics are Reminders**, not Value posts — even when they are full branded images.

Intern rule: *"It's in the SOP playbook → Reminder."*

## WhatsApp constraints

- Prefer **one media per scheduled row** for community Announcements.
- Sticker + caption in one message is avoided.
- Community sends require **`messageSecret`** (whatsmeow-node).

## Implementation status (2026-07-08)

| Area | Status |
|------|--------|
| Operator model | **Shipped** on `main` `8f7d1c1` |
| DB `MessageType` (`POST` / `POLL`) | **Legacy** — backfill + worker fallback |
| Sticker send + Reminder UI | **Shipped** — sticker asset optional |
| Per-project template library (6 slots) | **Shipped** |
| Campaign wizard | **Shipped** — 4-step Show Up only |

## UX (shipped)

- Nav: Queue / Schedule / WhatsApp / Settings
- Schedule: **Campaign** (4-step Show Up) | **Single message**
- Settings: Reminder template library + SOP URL / campaign note
- Queue: badges, campaign grouping, kind filters
- Confirm before schedule

> **Supersedes** earlier “5-step + Value in campaign” and short placeholder captions — see ship session raw.

## SOP track mapping

See [[wiki/concepts/campaign-message-schedule]] for exact times:

| SOP track / slot | Kind | Format |
|------------------|------|--------|
| Welcome, 2-Day, 1-Day, Starting Soon | Reminder | IMAGE + caption |
| LIVE NOW | Reminder | TEXT only |
| Post-Live Sticker | Reminder | STICKER |
| Value Post ×3 | Value | IMAGE_CAPTION |

## See also

- [[wiki/concepts/campaign-message-schedule]]
- [[wiki/analysis/p7-implementation-plan]]
- [[wiki/analysis/p7-ux-spec]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]
