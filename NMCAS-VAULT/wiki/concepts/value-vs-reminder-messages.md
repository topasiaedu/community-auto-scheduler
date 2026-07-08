---
title: "Value post vs Reminder (operator message model)"
type: "concept"
updated: "2026-07-08"
sources: 2
tags: ["nmcas", "product", "whatsapp", "sop", "ux"]
---

# Value post vs Reminder

## What this is

NMCAS schedules WhatsApp community sends using two **operator-facing** kinds. The split is based on **how content is produced**, not on file format. Applies to **every Project** (multi-campaign); each project has its own SOP assets and copy.

**Authoritative UX:** [[wiki/analysis/p7-ux-spec]].

## Value post

**Fresh content written for each campaign.**

| Format | Use | Fields | Campaign wizard |
|--------|-----|--------|-----------------|
| **Image + caption** (`IMAGE_CAPTION`) | Default; fixed Value slots | `imageUrl` + `copyText` | **Yes** (3 fixed + optional alternates) |
| **Poll** (`POLL`) | Occasional engagement | poll fields | **No** — single-message only |
| **Text only** (`TEXT_ONLY`) | Rare | `copyText` | **No** — single-message only |

Intern rule: *"We're writing something new → Value."*

## Reminder

**Anything predefined in the project SOP / asset pack** — templates in Settings, merged with campaign Custom Values.

| Format | Typical use | Caption / body |
|--------|-------------|----------------|
| **IMAGE** | Welcome, 2-Day, 1-Day, Starting Soon | **Required** — long templated caption merged from `bodyTemplate` + Custom Values |
| **TEXT** | LIVE NOW join link | **Required** — short templated text only; **no image** |
| **STICKER** | Post-live sticker (WebP) | **Never** — asset only |

**Countdown graphics are Reminders**, not Value posts — even when they are full branded images.

Intern rule: *"It's in the SOP playbook → Reminder."*

## WhatsApp constraints

- Prefer **one media per scheduled row** for community Announcements.
- Sticker + caption in one message is avoided.
- Community sends require **`messageSecret`** (whatsmeow-node).

## Implementation status (2026-07-08)

| Area | Status |
|------|--------|
| Operator model | **Locked** — see P7 plan |
| DB `MessageType` (`POST` / `POLL`) | **Legacy** — backfill to `operatorKind` |
| Sticker send + Reminder UI | **Planned P7** |
| Per-project template library (6 slots) | **Planned P7 Phase 4** |
| Campaign wizard | **Planned P7 Phase 5** — see [[wiki/analysis/p7-ux-spec]] |

## UX (locked)

- Nav: Queue / Schedule / WhatsApp / Settings
- Schedule: **Campaign** wizard (primary) + **Single message** escape hatch
- Settings: 6-slot Reminder template library + SOP URL
- Queue: badges `Reminder · {slot}` / `Value · Image`; campaign grouping
- Confirm modal before schedule (campaign + single)

> **Supersedes** [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]] §5.2–5.3 where they conflict (one-page-only Schedule, "no caption" on Reminders). Campaign setup uses a **5-step wizard**; image Reminders **require** templated captions.

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
