---
title: "P7 implementation plan — campaign scheduler"
type: "analysis"
updated: "2026-07-08"
sources: 2
tags: ["nmcas", "p7", "implementation", "product", "sop"]
---

# P7 implementation plan — campaign scheduler

**Status:** Ready to build (decisions locked)  
**Scope:** One complete delivery — intern-ready campaign scheduling end-to-end  
**UX & API (agent-ready):** [[wiki/analysis/p7-ux-spec]] — wizard steps, validation, API JSON, acceptance matrix  
**Ground truth:** [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]], [[wiki/concepts/campaign-message-schedule]]

---

## 1. Goal

An intern can run a full WhatsApp community campaign without external docs:

1. Link WhatsApp (existing)
2. Configure **Reminder template library** + copy templates in Settings (once per project)
3. **Campaign setup:** Custom Values + webinar date + event start → schedule full rhythm
4. Fill **Value posts** (fresh copy); Reminders auto-merge templates
5. Review Queue with clear badges and previews
6. Sends fire at **fixed SOP times** (MYT)

---

## 2. Product model (locked)

### Operator kinds

| Kind | SOP track | Rule |
|------|-----------|------|
| **Reminder** | Show Up | Predefined playbook — assets + templated copy |
| **Value** | Value Post | Fresh copy each campaign |

### Value formats

| Format | Fields |
|--------|--------|
| `IMAGE_CAPTION` | `imageUrl` + `copyText` (both required) |
| `TEXT_ONLY` | `copyText` |
| `POLL` | poll fields (nested under Value) |

### Reminder formats

| Format | Fields | Caption |
|--------|--------|---------|
| `IMAGE` | `imageUrl` + `copyText` | **Required** for Welcome / 2-Day / 1-Day / Starting Soon (templated caption) |
| `TEXT` | `copyText` only | LIVE NOW |
| `STICKER` | `stickerUrl` | Never |

### Decisions locked

| Decision | Choice |
|----------|--------|
| LIVE NOW | Reminder **TEXT** only (no image) |
| Slot clock times | **Fixed** — intern does not edit |
| Custom Values | **8 fields** — merge into Reminder copy at schedule time |
| Welcome / countdowns | **Image + long templated caption** (not image-only) |
| Sticker timing | **eventStart + 18 min** (exact) |
| Stickers | Static WebP; reject animated on upload |
| Sticker send | NMCAS uploads WebP + `stickerMessage` (differs from manual SOP in-app picker) |
| Storage | Same bucket; prefixes `posts/`, `reminders/`, `stickers/` |
| Legacy `POST`/`POLL` | Keep in DB; backfill; API/UI use new model |
| Nav | Queue / Schedule / WhatsApp / Settings |
| **Reminder destination** | **One community per campaign** (e.g. 3.0 this round, 4.0 next, rarely 2.0) — all 6 Show Up rows share it |
| **Value destination** | **Broadcast to all communities** on the project — one compose → N rows (one per community Announcements channel) |

### Destination routing (per campaign)

| Kind | Who picks destination | Behaviour |
|------|----------------------|-----------|
| **Reminder** (Show Up ×6) | Intern picks **one** community + channel once per campaign | All reminder rows share the same `groupJid` (e.g. RDW 3.0 › Announcements) |
| **Value** (fixed + optional alternate) | No per-community pick | Same content + time → **fan out** to every community Announcements channel on that project's WA account |

Implementation: `Campaign.reminderGroupJid` + `reminderGroupName`; Value slots create one `ScheduledMessage` per community, linked by `campaignId`.

---

## 3. Authoritative schedule

All times **MYT**. See [[wiki/concepts/campaign-message-schedule]].

### Show Up (6 Reminders)

| # | Slot | Trigger |
|---|------|---------|
| 01 | Welcome | webinarDate − 4d @ 15:00 |
| 02 | 2-Day Countdown | webinarDate − 2d @ 15:00 |
| 03 | 1-Day Countdown | webinarDate − 1d @ 20:00 |
| 04 | Starting Soon | webinarDate @ 11:00 |
| 05 | LIVE NOW | eventStart − 2 min |
| 06 | Post-Live Sticker | eventStart + 18 min |

### Value Post (3 fixed + optional alternate)

| Slot | Trigger |
|------|---------|
| Value 1 | webinarDate − 3d @ 11:00 |
| Value 2 | webinarDate − 1d @ 11:00 |
| Value 3 | webinarDate + 1d @ 11:00 |

**Alternate-day rule (SOP):** On other pre-webinar days not in fixed slots, suggest optional Value posts every alternate day — intern opts in at campaign review; not auto-created.

### Custom Values (campaign setup — Step 0)

| Field | Used in |
|-------|---------|
| Workshop day | 2-Day copy |
| Workshop date | 2-Day copy |
| Workshop time | 2-Day, 1-Day copy |
| Zoom link | 1-Day, Starting Soon, LIVE NOW |
| Session date | Starting Soon |
| Session time | Starting Soon |
| Zoom ID | Starting Soon |
| Zoom passcode | Starting Soon |

---

## 4. UX

**Full spec:** [[wiki/analysis/p7-ux-spec]] (wizard steps, validation, API contracts, Queue badges, Settings layout, mobile/a11y).

Summary:

- Nav: Queue `/queue`, Schedule `/schedule`, WhatsApp `/whatsapp`, Settings `/settings` (legacy `/compose`, `/connect` redirect)
- Schedule: segmented **Campaign** (5-step wizard) | **Single message** (4-block one-pager)
- Settings: SOP URL, campaign note, 6-slot Reminder template library
- Queue: campaign grouping, kind badges, sticker checkered preview

---

## 5. Data model

### New enums

`OperatorKind`, `ValueFormat`, `ReminderFormat`, `ScheduleRuleKind` (`WEBINAR_DATE_OFFSET` | `EVENT_START_OFFSET`)

### New / extended models

```text
Campaign
  id, projectId, webinarDate, eventStartTimeMyt
  reminderGroupJid, reminderGroupName   // single destination for all Show Up rows
  customValues (JSON — 8 fields)
  createdAt

ReminderTemplate
  projectId, slotKey, name, reminderFormat
  mediaUrl?, stickerUrl?, bodyTemplate?
  scheduleRuleKind, dayOffset?, clockTimeMyt?, startOffsetMinutes?
  sortOrder

ScheduledMessage (extend)
  operatorKind, valueFormat?, reminderFormat?
  reminderTemplateId?, campaignId?
  stickerUrl?  (snapshot)
  copyText, imageUrl, poll* (existing)
  type POST|POLL (legacy, backfilled)
```

**Snapshot rule:** At schedule time, merge Custom Values into `bodyTemplate` → store final `copyText` / media paths on the row.

### Backfill

| Legacy | → |
|--------|---|
| POLL | VALUE / POLL |
| POST + text±image | VALUE / IMAGE_CAPTION or TEXT_ONLY |

---

## 6. API

| Area | Routes |
|------|--------|
| Templates | `GET/PATCH /templates/:slotKey`, upload asset per `slotKey` |
| Campaign | `POST /campaigns/schedule` — transactional bulk create |
| Projects | `PATCH /projects/:id` — `sopUrl`, `campaignNote` |
| Messages | Extended create/patch validation on `operatorKind` + formats |
| Uploads | `POST /uploads/media?kind=post\|reminder-image\|sticker` |
| Media | `GET /uploads/media?path=...` |

**Merge helper:** `mergeTemplate(customValues, bodyTemplate) → string` (pure function, unit-tested).

**Request/response shapes, fan-out resolver, error codes:** [[wiki/analysis/p7-ux-spec]] §9–10.

---

## 7. Worker

Route by `operatorKind` + format:

| Case | Send |
|------|------|
| VALUE / POLL | `sendGroupPoll` |
| VALUE / TEXT_ONLY | `sendGroupText` |
| VALUE / IMAGE_CAPTION | `sendGroupImage` |
| REMINDER / TEXT | `sendGroupText` |
| REMINDER / IMAGE | `sendGroupImage` (caption from merged copy) |
| REMINDER / STICKER | `sendGroupSticker` (new) + `messageSecret` |

Legacy fallback on `type` POST/POLL if `operatorKind` null.

---

## 8. Build phases

### Phase 1 — Schema & migration

- Prisma enums + `Campaign`, `ReminderTemplate`, `ScheduledMessage` extensions
- Seed 6 template slots on project create
- Backfill legacy `ScheduledMessage` rows
- `packages/db` export types

### Phase 2 — API foundation

- Template CRUD + seed endpoint
- Upload generalization (`post` / `reminder-image` / `sticker`; reject animated WebP)
- `mergeTemplate` + message create/patch validation
- `GET /uploads/media` generalized

### Phase 3 — Worker & sends

- `sendGroupSticker` in `wa-send.ts`
- Worker routing by `operatorKind` + `reminderFormat` / `valueFormat`
- Generalized media download (`posts/`, `reminders/`, `stickers/`)

### Phase 4 — Settings UI

- SOP URL + campaign note on Project
- Reminder template library (6 slots: upload asset, edit `bodyTemplate`, preview merge)

### Phase 5 — Schedule UI

- `campaignSchedule.ts` — pure timing math (unit tests)
- Campaign setup wizard (Custom Values → destination → Show Up review → Value posts → confirm)
- Single-message mode (Value/Reminder restructure)
- Confirm modals

### Phase 6 — Queue & polish

- Nav rename (Schedule / WhatsApp)
- Queue badges, campaign grouping, previews (sticker checkered bg)
- Empty-state checklist
- Alternate-day Value post suggestions in campaign review

### Phase 7 — Test & harden

- Manual acceptance matrix — [[wiki/analysis/p7-ux-spec]] §11
- Edge cases: animated WebP reject, template delete after schedule, legacy rows, FAILED re-queue
- Production smoke: Render API health + Vercel web + browser E2E on test project

### Agent execution order (parallel vs sequential)

| Wave | Phases | Rule |
|------|--------|------|
| **1** | Phase 1 only | **Sequential gate** — schema must land first |
| **2** | Phase 2 + Phase 3 + Phase 5a (`campaignSchedule.ts`) | **Parallel** after Phase 1 |
| **3** | Phase 4 + Phase 5b | **Parallel** after Phase 2; assign non-overlapping files or run 4 then 5b to avoid merge conflicts |
| **4** | Phase 6 | After Phases 2, 3, 4, 5b |
| **5** | Phase 7 | Last — integration test only |

**File ownership hints:** Phase 2 → `apps/api/src/routes/`; Phase 3 → `worker/`, `wa-send.ts`; Phase 4 → `SettingsPage`, template UI; Phase 5 → `SchedulePage`, `campaignSchedule.ts`; Phase 6 → `QueueCard`, `AppShell`.

---

## 9. Acceptance (summary)

- [ ] Campaign wizard: Custom Values + dates → 9 rows at correct MYT times
- [ ] All 6 Show Up sends deliver (image+caption, text, sticker)
- [ ] Reminders go to **one** chosen community; Value posts fan out to **all** communities
- [ ] Template merge substitutes zoom link, dates, etc.
- [ ] Intern completes flow without reading wiki

---

## See also

- [[wiki/analysis/p7-ux-spec]] — **agent-ready UX + API**
- [[wiki/concepts/campaign-message-schedule]]
- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]
- [[wiki/overview]]
