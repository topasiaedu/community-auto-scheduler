---
title: "P7 UX & API spec — campaign scheduler (agent-ready)"
type: "analysis"
updated: "2026-07-08"
sources: 3
tags: ["nmcas", "p7", "ux", "api", "implementation"]
---

# P7 UX & API spec — campaign scheduler

**Status:** Partially superseded for campaign UX — see [[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]]  
**Shipped on main:** `8f7d1c1` (2026-07-08)

> **Read first:** Campaign wizard is **4 steps (Show Up reminders only)** — Value posts are **Single message**, not campaign Step 4. SOP full captions live in `packages/db/src/reminderTemplateDefaults.ts`. Post-live sticker is **optional**. Sections below that still describe a 5-step Value-inclusive wizard are historical plan text until revised.

**Companion:** [[wiki/analysis/p7-implementation-plan]] (phases, schema, worker).  
**Ground truth:** [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]], ship session above.

---

## 1. Scope boundaries (v1)

| In scope | Out of scope (v1) |
|----------|-------------------|
| Campaign wizard (5 steps) | Edit campaign after confirm (bulk re-schedule) |
| Single-message escape hatch (Value / Reminder) | Recurring / duplicate campaign from template |
| Settings template library (6 slots) | Per-slot editable clock times |
| Value fan-out to all communities | Per-community Value destination pick |
| Campaign grouping in Queue | Campaign delete endpoint |
| Poll / text-only Value in **single-message** only | Poll / text-only in **campaign** Value rows |
| Cancel / re-queue individual rows (existing Queue) | Server-side campaign draft save |

---

## 2. Navigation & routes

| Label | Path | Component | Legacy redirect |
|-------|------|-----------|-----------------|
| Queue | `/queue` | `QueuePage` | — |
| Schedule | `/schedule` | `SchedulePage` (rename from `ComposePage`) | `/compose` → `/schedule` |
| WhatsApp | `/whatsapp` | `ConnectPage` | `/connect` → `/whatsapp` |
| Settings | `/settings` | `SettingsPage` | — |

- Update `document.title` and `PageHeader` to match labels (`Schedule`, `WhatsApp`).
- `AppShell` nav uses labels above; remove `Compose` / `Connect`.

---

## 3. Schedule page — mode switch

Top of Schedule page: **segmented control** (default left):

| Mode | Default | Purpose |
|------|---------|---------|
| **Campaign** | Yes (primary) | Full SOP rhythm wizard |
| **Single message** | No | One-off Value or Reminder |

Persist last-selected mode in `sessionStorage` key `nmcas.scheduleMode`.

Single-message layout: existing four-block flow (Where → Kind → Content → When) on one scrollable page with live preview column — **not** a stepper.

---

## 4. Campaign wizard (5 steps)

**Layout:** Single page, vertical **stepper** (numbered 1–5) at top. Only the active step's card is visible. **Back** / **Next** buttons at bottom of each step. **Next** disabled until step validation passes.

**No server-side campaign draft.** Warn on `beforeunload` if step > 1 and form is dirty. Intern must complete in one session.

### Step 1 — Campaign details

**Fields:**

| UI label | JSON key | Type | Required | Example |
|----------|----------|------|----------|---------|
| Webinar date | _(top-level `webinarDate`)_ | `date` (MYT calendar day) | Yes | `2026-06-29` |
| Event start time | _(top-level `eventStartTimeMyt`)_ | `time` HH:mm MYT | Yes | `20:00` |
| Workshop day | `workshopDay` | text, max 32 | Yes | `Monday` |
| Workshop date | `workshopDate` | text, max 32 | Yes | `29/6` |
| Workshop time | `workshopTime` | text, max 64 | Yes | `8PM (GMT +8)` |
| Zoom link | `zoomLink` | URL, max 512 | Yes | `http://drjasminechiew.com/zoom` |
| Session date | `sessionDate` | text, max 64 | Yes | `Jun 29, 2026` |
| Session time | `sessionTime` | text, max 64 | Yes | `8:00PM – 10:00PM (GMT+8)` |
| Zoom ID | `zoomId` | text, max 32 | Yes | `819 5208 2119` |
| Zoom passcode | `zoomPasscode` | text, max 16 | Yes | `8888` |

**Validation:**

- `webinarDate` must be **today or future** in MYT.
- Earliest computed slot (Welcome at webinarDate − 4d @ 15:00) must be **≥ now + 15 seconds** (server min lead time).
- All 8 custom value fields non-empty after trim.
- `zoomLink` must parse as `http:` or `https:` URL.

**Helper text:** "All times are Malaysia Time (MYT, UTC+8). Slot send times are fixed by the SOP — you only set the webinar date and event start."

### Step 2 — Reminder destination

Reuse existing **Community → Channel** picker (same as single-message). Intern picks **one** destination for all 6 Show Up rows.

**Validation:**

- `groupJid` selected.
- WA must be **connected** (block Next with link to `/whatsapp` if disconnected).

**Helper:** "All Show Up reminders (Welcome through Sticker) go to this community channel."

### Step 3 — Show Up review

Read-only table of 6 Reminder slots. Columns: **Slot** | **Send time (MYT)** | **Asset** | **Preview**.

| Row | Asset check | Preview |
|-----|-------------|---------|
| Welcome … Post-Live Sticker | ✓ if template has required media | Merged `bodyTemplate` for TEXT/IMAGE slots; sticker thumbnail on checkered bg |

**Computed times** from `campaignSchedule.ts` (unit-tested) using Step 1 anchors.

**Validation (blocks Next):**

- All 6 `ReminderTemplate` rows must have required assets:
  - `welcome`, `countdown_2d`, `countdown_1d`, `starting_soon` → `mediaUrl` set
  - `live_now` → `bodyTemplate` non-empty (TEXT, no image)
  - `post_live_sticker` → `stickerUrl` set
- Merge preview must succeed for slots that use `bodyTemplate` (no unresolved `{{…}}` after merge).

**Missing assets:** show red "Missing — configure in Settings" with link to `/settings#reminder-templates`.

### Step 4 — Value posts

**Fixed rows (3)** — always included, `IMAGE_CAPTION` only:

| Slot key | Label | Trigger |
|----------|-------|---------|
| `value_1` | Value Post 1 | webinarDate − 3d @ 11:00 |
| `value_2` | Value Post 2 | webinarDate − 1d @ 11:00 |
| `value_3` | Value Post 3 | webinarDate + 1d @ 11:00 |

Each row: **image upload** + **caption** textarea (both required). Show computed MYT send time (read-only).

**Fan-out banner:** "These posts will be sent to **N communities**" where N = count from fan-out resolver (see §10). List community names in a collapsible `<details>`.

**Optional alternate-day Value posts** (collapsible section, collapsed by default):

- Title: "Optional extra Value posts (alternate days)"
- Algorithm: calendar days from `(webinarDate − 4d)` through `(webinarDate − 1d)` **excluding** days already used by fixed Value 1 (−3d), Value 2 (−1d), or any Show Up slot day. Keep every **other** day (stride 2 from first eligible day). Each at **11:00 MYT** fixed.
- UI: checkbox per suggested date. When checked, reveal image + caption fields for that row.
- Unchecked rows are **not** submitted.

**Validation:**

- All 3 fixed Value rows have image + non-empty caption.
- Each checked optional row has image + caption.
- N ≥ 1 fan-out destination; if N = 0, block with "Link WhatsApp and ensure at least one community has an Announcements channel."

### Step 5 — Confirm

**Summary card:**

- Webinar date + event start (MYT)
- Reminder destination label
- Table: slot | kind | time | destination(s)
- Total row count: `6 + (3 + optionalCount) × N` for Value fan-out

**Primary button:** "Schedule campaign" (destructive-style confirm dialog before submit).

**Confirm dialog copy:** "Schedule **{totalRows}** messages? Reminders go to **{reminderGroupName}**. Value posts go to **{N}** communities. This cannot be undone as a batch — cancel individual rows from the Queue later."

**On submit:** `POST /campaigns/schedule`. Show spinner. On success → toast + navigate to `/queue` with campaign group expanded. On error → show API message; stay on step 5.

**WA disconnected:** disable submit (should not reach step 5 without WA — re-validate).

---

## 5. Single-message mode

Four blocks on one page (existing layout):

1. **Where** — Community → Channel picker
2. **What kind** — `Value post` | `Reminder`
3. **Content** — progressive by kind (below)
4. **When** — MYT datetime-local + **Save draft** | **Schedule**

### Value post formats (chips inside Value)

| Format | Fields |
|--------|--------|
| Image + caption (default) | image + caption |
| Poll | question + 2–12 options |
| Text only | caption only |

### Reminder (single)

- **Pick slot** dropdown from 6 template `slotKey` labels (not free upload in v1).
- Preview merged copy with **sample** custom values from Settings (or inline "preview values" collapsible with the 8 fields).
- For IMAGE slots: show template image + merged caption preview.
- For STICKER: checkered preview only.
- For TEXT (`live_now`): merged text only.

**Confirm modal** before Schedule: destination, kind, format, MYT time, first 120 chars of body.

**Draft:** allowed when WA disconnected. **Schedule:** blocked when WA disconnected or time in past / within 15s.

---

## 6. Settings page

### Card A — Project links (top)

| Field | Model | Notes |
|-------|-------|-------|
| SOP URL | `Project.sopUrl` | Optional URL; shown as "Open SOP ↗" on Schedule campaign step 1 |
| Campaign note | `Project.campaignNote` | Optional textarea; internal note only |

`PATCH /projects/:id` with `{ sopUrl?, campaignNote? }`.

### Card B — Reminder template library

Anchor id: `reminder-templates`.

Six expandable rows (accordion). Order fixed:

| slotKey | Display name | Format | Asset field | bodyTemplate |
|---------|--------------|--------|-------------|--------------|
| `welcome` | Welcome | IMAGE | `mediaUrl` | Required |
| `countdown_2d` | 2-Day Countdown | IMAGE | `mediaUrl` | Required |
| `countdown_1d` | 1-Day Countdown | IMAGE | `mediaUrl` | Required |
| `starting_soon` | Starting Soon | IMAGE | `mediaUrl` | Required |
| `live_now` | LIVE NOW | TEXT | — | Required (no image) |
| `post_live_sticker` | Post-Live Sticker | STICKER | `stickerUrl` | Must be empty / ignored |

**Per row UI:**

- Read-only schedule rule line (e.g. "Webinar date − 4 days @ 3:00 PM MYT")
- Asset upload (image or sticker by format)
- `bodyTemplate` textarea (hidden/disabled for STICKER)
- **Preview merge** button: opens dialog with sample Custom Values (editable in dialog) → rendered output
- Save per row via `PATCH /templates/:slotKey`

**Sticker upload:** reject animated WebP (see §12). Checkered background on preview.

**Empty state:** "Upload SOP assets once per project. Required before your first campaign."

---

## 7. Queue page

### Campaign grouping

- Messages with `campaignId` grouped under collapsible header.
- Header label: `Campaign · {webinarDate formatted MYT}` e.g. `Campaign · 29 Jun 2026`.
- Sort campaigns by earliest `scheduledAt` in group.
- Expanded by default if any row in group is `PENDING` or `FAILED`.
- Messages without `campaignId` → section **Other messages** below campaigns.

### Badges (per row)

| Part | Values | Style |
|------|--------|-------|
| Kind | `Reminder`, `Value` | `Badge variant="outline"` — Reminder blue tint, Value green tint |
| Sub | Slot: `Welcome`, `2-Day`, `1-Day`, `Starting Soon`, `LIVE NOW`, `Sticker` OR format: `Image`, `Text`, `Sticker`, `Poll` | `Badge variant="secondary"` |

Example: `Reminder · Welcome` + status chip `Pending`.

### Previews

- IMAGE / IMAGE_CAPTION: thumbnail + caption excerpt
- STICKER: checkered bg + sticker thumb
- TEXT: body excerpt
- POLL: question + option count

### Filters (extend existing status tabs)

Add optional filter chips: **All** | **Campaign** | **Other** | by kind **Reminder** | **Value** (client-side on loaded list).

### Empty state checklist

When queue empty and WA disconnected:

1. Link WhatsApp → `/whatsapp`
2. Configure reminder templates → `/settings#reminder-templates`
3. Schedule a campaign → `/schedule`

When WA connected but empty: steps 2–3 only.

---

## 8. Placeholder & merge rules

### Syntax

- Placeholders: `{{camelCaseKey}}` matching Custom Values JSON keys exactly.
- Unknown placeholders left unchanged (merge is non-throwing).
- No HTML; plain text only.

### Keys

`{{workshopDay}}`, `{{workshopDate}}`, `{{workshopTime}}`, `{{zoomLink}}`, `{{sessionDate}}`, `{{sessionTime}}`, `{{zoomId}}`, `{{zoomPasscode}}`

### Required custom values per slot (for preview gating)

| slotKey | Required keys |
|---------|---------------|
| `welcome` | all 8 (full welcome copy) |
| `countdown_2d` | `workshopDay`, `workshopDate`, `workshopTime` |
| `countdown_1d` | `workshopTime`, `zoomLink` |
| `starting_soon` | `zoomLink`, `sessionDate`, `sessionTime`, `zoomId`, `zoomPasscode` |
| `live_now` | `zoomLink` |
| `post_live_sticker` | _(none)_ |

### Seed `bodyTemplate` (project create)

Authoritative captions live in `packages/db/src/reminderTemplateDefaults.ts` (transcribed from Dr Jasmine Show Up SOP). Summary of placeholders used:

| slotKey | Placeholders |
|---------|--------------|
| `welcome` | _(none — static SOP welcome)_ |
| `countdown_2d` | `workshopDay`, `workshopDate`, `workshopTime` |
| `countdown_1d` | `workshopTime`, `zoomLink` |
| `starting_soon` | `sessionDate`, `sessionTime`, `zoomLink`, `zoomId`, `zoomPasscode` |
| `live_now` | `zoomLink` |
| `post_live_sticker` | _(none)_ |

Ops may edit in Settings after seed; re-calling `seedReminderTemplatesForProject` / `GET /templates` refreshes SOP copy while **preserving** uploaded media paths.

---

## 9. API contracts

All routes require auth + `X-Project-Id` (existing pattern).

### `GET /templates`

```json
{
  "templates": [
    {
      "slotKey": "welcome",
      "name": "Welcome",
      "reminderFormat": "IMAGE",
      "mediaUrl": "reminders/proj/welcome.jpeg",
      "stickerUrl": null,
      "bodyTemplate": "Hi! …",
      "scheduleRuleKind": "WEBINAR_DATE_OFFSET",
      "dayOffset": -4,
      "clockTimeMyt": "15:00",
      "startOffsetMinutes": null,
      "sortOrder": 1
    }
  ]
}
```

### `PATCH /templates/:slotKey`

Body: `{ mediaUrl?, stickerUrl?, bodyTemplate? }`. Validate format per slot. STICKER slot rejects non-empty `bodyTemplate`.

### `PATCH /projects/:id`

Body: `{ sopUrl?: string | null, campaignNote?: string | null }`.

### `POST /campaigns/schedule`

**Request:**

```json
{
  "webinarDate": "2026-06-29",
  "eventStartTimeMyt": "20:00",
  "customValues": {
    "workshopDay": "Monday",
    "workshopDate": "29/6",
    "workshopTime": "8PM (GMT +8)",
    "zoomLink": "https://drjasminechiew.com/zoom",
    "sessionDate": "Jun 29, 2026",
    "sessionTime": "8:00PM – 10:00PM (GMT+8)",
    "zoomId": "819 5208 2119",
    "zoomPasscode": "8888"
  },
  "reminderGroupJid": "123@g.us",
  "reminderGroupName": "RDW 3.0 › Announcements",
  "valuePosts": [
    { "slotKey": "value_1", "imageUrl": "posts/…", "copyText": "…" },
    { "slotKey": "value_2", "imageUrl": "posts/…", "copyText": "…" },
    { "slotKey": "value_3", "imageUrl": "posts/…", "copyText": "…" }
  ],
  "optionalValuePosts": [
    { "scheduledDate": "2026-06-25", "imageUrl": "posts/…", "copyText": "…" }
  ]
}
```

**Response 201:**

```json
{
  "campaignId": "clx…",
  "messageIds": ["…"],
  "reminderCount": 6,
  "valueCount": 12,
  "fanOutDestinations": ["RDW 2.0 › Announcements", "RDW 3.0 › Announcements"]
}
```

**Errors:**

- `400` — validation (missing assets, past times, invalid URLs)
- `409` — WA not connected
- `422` — zero fan-out destinations

**Transaction:** all rows created or none (DB transaction).

### `POST /uploads/media?kind=post|reminder-image|sticker`

Returns `{ path: string }`. Sticker kind rejects animated WebP.

### `GET /uploads/media?path=…`

Existing pattern; works for all prefixes.

### Extended `POST /messages` (single)

Accept `operatorKind`, `valueFormat` / `reminderFormat`, `reminderTemplateId` (single Reminder). Legacy `type` still accepted for back compat.

---

## 10. Value fan-out resolver (API)

Used by campaign schedule and Step 4 preview count.

1. Call same group list as `GET /wa/groups` (connected WA required).
2. Normalize rows with `normalizeWaGroupRow`.
3. Keep rows where `communityJid` is set **and** (`channelName === "Announcements"` OR `isAnnounce === true`).
4. Deduplicate by `jid` (channel JID).
5. **Exclude** standalone groups (no `communityJid`).
6. If multiple Announcements channels per community, take first by stable sort on `jid`.

Return `{ destinations: [{ groupJid, groupName }], count }`.

Communities without Announcements channel are **skipped** (not an error unless count = 0).

---

## 11. Acceptance matrix (Phase 7)

Manual test after deploy. Webinar date = D, event start = D @ 20:00 MYT, 2 communities with Announcements.

| # | Slot | Kind | Format | Time (MYT) | Destination |
|---|------|------|--------|------------|-------------|
| 1 | Welcome | Reminder | IMAGE+caption | D−4 @ 15:00 | chosen community |
| 2 | 2-Day | Reminder | IMAGE+caption | D−2 @ 15:00 | chosen |
| 3 | 1-Day | Reminder | IMAGE+caption | D−1 @ 20:00 | chosen |
| 4 | Starting Soon | Reminder | IMAGE+caption | D @ 11:00 | chosen |
| 5 | LIVE NOW | Reminder | TEXT | D @ 19:58 | chosen |
| 6 | Sticker | Reminder | STICKER | D @ 20:18 | chosen |
| 7 | Value 1 | Value | IMAGE_CAPTION | D−3 @ 11:00 | ×2 communities |
| 8 | Value 2 | Value | IMAGE_CAPTION | D−1 @ 11:00 | ×2 communities |
| 9 | Value 3 | Value | IMAGE_CAPTION | D+1 @ 11:00 | ×2 communities |

**Pass:** 6 + 6 = 12 rows created; merge contains real zoom link; sticker sends without caption; Queue shows campaign group; all times match within 1 minute of expected UTC conversion.

**Edge cases:**

- [ ] Animated WebP upload → 400 with plain message
- [ ] Template asset deleted after schedule → row still sends (snapshot on row)
- [ ] Legacy POST/POLL rows still send via worker fallback
- [ ] FAILED row re-queue still works

---

## 12. Animated WebP rejection

On sticker upload: decode WebP; if `ANIM` chunk present or frame count > 1 → `400` `"Animated stickers are not supported. Export a static WebP."`

---

## 13. Mobile & a11y (minimum)

- Wizard Back/Next full-width on `<640px`
- Sticky Schedule submit bar on single-message mode (existing pattern)
- Stepper announces `aria-current="step"`
- Confirm dialogs trap focus; Esc cancels
- Tap targets ≥ 44px

---

## 14. Deploy verification (Render + Vercel)

After Phase 7, smoke test on production:

| Check | Tool |
|-------|------|
| API health | `GET /health` on Render URL |
| Web loads | Vercel preview/production URL |
| Migration applied | Render deploy logs or `list_deploys` |
| Campaign schedule E2E | Browser on production (test project only) |

---

## See also

- [[wiki/analysis/p7-implementation-plan]]
- [[wiki/concepts/campaign-message-schedule]]
- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/entities/scheduled-message]]
- [[wiki/entities/project]]
