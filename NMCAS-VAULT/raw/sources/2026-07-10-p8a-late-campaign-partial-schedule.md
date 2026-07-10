# Raw source: P8-A — Late / partial Show Up campaign scheduling (2026-07-10)

**Type:** Product requirement + implementation brief for a coding agent.  
**Date:** 2026-07-10  
**Scope:** Allow scheduling a Show Up campaign when some reminder slots (especially Welcome) are already in the past.  
**Repo:** `community-auto-scheduler` (monorepo: `apps/api`, `apps/web`, `packages/db`)  
**Out of scope for this task:** duplicate community UX, Value post fan-out (see separate raw `2026-07-10-p8b-value-fan-out-active-communities.md`).

---

## 1. Problem (operator pain)

An intern schedules a **Show Up campaign** (Schedule → Campaign wizard) with webinar date + event start + one reminder destination community. The wizard creates 6 reminder rows at fixed SOP times (Welcome, 2-Day, 1-Day, Starting Soon, LIVE NOW, optional Post-Live Sticker).

**Today:** if **any** slot time is already past (including Welcome at webinar − 4d @ 15:00 MYT), the app **blocks the entire campaign**. The API rejects with `"Earliest campaign slot must be at least ~15 seconds in the future"` or `"Slot \"welcome\" is in the past"`. The transaction aborts — zero rows created.

**Real scenario:** Welcome was already sent manually or to the wrong destination; the operator wants to schedule the **remaining** reminders to the **correct** community without re-sending Welcome. Currently they must fall back to Schedule → Single message → Reminder, one slot at a time.

**Goal:** Campaign wizard should schedule **only future slots** and let the operator **explicitly skip** slots they do not want (starting with Welcome).

---

## 2. Current behaviour (code truth)

### Earliest-slot gate (blocks wizard Step 1)

- `apps/web/src/lib/campaignSchedule.ts` — `validateEarliestSlot()` returns false if Welcome time < now + 15s.
- `apps/web/src/components/schedule/CampaignWizard.tsx` — `step1Valid` calls `validateEarliestSlot(computeShowUpSlots(...))`.

### API all-or-nothing

- `apps/api/src/routes/campaigns.ts` — `POST /campaigns/schedule`:
  - Lines ~162–167: rejects if `earliestCampaignSlotTime(webinarDate)` < now + 15s.
  - Loop ~243–255: for each template, if `scheduledAt < minTime`, **throws** → entire transaction rolls back.
- `shouldScheduleTemplate()` already **skips** post-live sticker when `stickerUrl` is missing (only existing skip).

### What does NOT exist

- No per-slot skip flags on the request body.
- No UI warning that past slots will be skipped.
- No distinction between “auto-skip because past” vs “operator chose to skip Welcome”.

### Independent paths (unchanged by this task)

- **Value posts** via Single message have **no** Welcome prerequisite (`POST /messages`).
- Single-message Reminder can schedule one slot at a time with only ~15s lead time.

### SOP slot times (MYT, fixed clocks)

See `apps/api/src/lib/campaignSchedule.ts` and `packages/db/src/reminderTemplateDefaults.ts`:

| slotKey | dayOffset | clockTimeMyt |
|---------|-----------|--------------|
| welcome | −4 | 15:00 |
| countdown_2d | −2 | 15:00 |
| countdown_1d | −1 | 20:00 |
| starting_soon | 0 | 11:00 |
| live_now | 0 | eventStart − 2 min |
| post_live_sticker | 0 | eventStart + 18 min |

---

## 3. Desired behaviour

### 3.1 Auto-skip past slots

When scheduling a campaign:

1. **Remove** the global “earliest slot must be in the future” rejection (UI + API).
2. For each reminder template, compute `scheduledAt`. If `scheduledAt < now + 15s`, **do not create a row** for that slot (skip silently at API level, but surface in UI).
3. **Require at least one** reminder row to be scheduled (future slot). If all 6 would be skipped → `400` with clear error: e.g. `"No reminder slots are still in the future for this webinar date"`.
4. Post-live sticker: keep existing rule — skip if no `stickerUrl`; also skip if time is past.

### 3.2 Explicit operator skip (Welcome and any slot)

Add optional request field:

```json
{
  "skipSlotKeys": ["welcome"]
}
```

- Valid keys: the six `slotKey` values from `ReminderTemplate` (`welcome`, `countdown_2d`, `countdown_1d`, `starting_soon`, `live_now`, `post_live_sticker`).
- Skipped slots are **never** created even if their time is still in the future.
- UI: on Step 3 (Show Up review) or Step 4 (Confirm), show each slot with status:
  - **Scheduled** — will create row
  - **Skipped (past)** — time already passed
  - **Skipped (you chose)** — in `skipSlotKeys`
  - **Skipped (no sticker)** — existing sticker rule

Default: `skipSlotKeys` empty. Provide a prominent checkbox on review/confirm:

> **Skip Welcome** — already sent manually or not needed for this campaign

When checked, add `"welcome"` to `skipSlotKeys`.

### 3.3 Confirm step copy

Update confirm dialog / summary:

- Show count: “Scheduling **N** reminders (M skipped)”
- List skipped slots with reason
- Primary button still `POST /campaigns/schedule`

### 3.4 Response shape (extend 201)

```json
{
  "campaignId": "…",
  "messageIds": ["…"],
  "reminderCount": 4,
  "skippedSlots": [
    { "slotKey": "welcome", "reason": "past" },
    { "slotKey": "post_live_sticker", "reason": "no_asset" }
  ],
  "valueCount": 0,
  "fanOutDestinations": []
}
```

(`valueCount` / `fanOutDestinations` stay as today — wizard still sends empty value arrays.)

---

## 4. Files to touch (expected)

| Area | Files |
|------|--------|
| API schedule | `apps/api/src/routes/campaigns.ts` |
| API schedule tests | New or extend `apps/api/src/routes/campaigns.test.ts` if present; else `apps/api/src/lib/campaignSchedule.test.ts` for pure helpers |
| Shared skip helper | New `apps/api/src/lib/campaignSlotSkip.ts` (recommended) — `shouldScheduleReminderSlot({ template, scheduledAt, nowMs, skipSlotKeys })` |
| Web schedule lib | `apps/web/src/lib/campaignSchedule.ts` — add `classifyCampaignSlots()` for UI labels; relax `validateEarliestSlot` usage |
| Web tests | `apps/web/src/lib/campaignSchedule.test.ts` |
| Wizard UI | `apps/web/src/components/schedule/CampaignWizard.tsx` |
| Types | `apps/web/src/types/models.ts` if response type extended |
| Zod body | Campaign schedule request schema in `campaigns.ts` |

**Do not change:** Value fan-out, `POST /messages`, worker, Prisma schema (no migration needed unless you prefer persisting skip reasons on `Campaign` — **not required for v1**).

---

## 5. Acceptance criteria

Manual + automated:

1. Webinar date where Welcome is **past** but 2-Day is **future** → campaign schedules 2-Day, 1-Day, Starting Soon, LIVE NOW (+ sticker if asset + future); Welcome row **not** created.
2. Welcome **future**, operator checks “Skip Welcome” → Welcome row **not** created; other future slots created.
3. All slots past → `400`, no `Campaign` row (transaction empty).
4. Sticker missing asset → skipped (existing); sticker past time → skipped with reason `past`.
5. Wizard Step 1 **no longer disabled** solely because Welcome is past; show amber banner: “Some slots are in the past and will be skipped.”
6. Confirm step lists skipped vs scheduled accurately.
7. Existing happy path (all slots future, no skips) unchanged — still creates 6 rows (or 5 if no sticker).
8. Unit tests for skip classification and “at least one future slot” rule.

---

## 6. Implementation notes

- Keep **transactional** create: campaign + all reminder rows in one `prisma.$transaction`.
- `skipSlotKeys` should be validated against known slot keys; unknown key → `400`.
- `live_now` and `post_live_sticker` times depend on `eventStartTimeMyt` — use existing `computeReminderSlotTime()`.
- Do **not** re-add Value posts to the campaign wizard.
- Match existing code style: double quotes, strict TypeScript, no `any`, no non-null assertion.
- Run existing tests: `campaignSchedule.test.ts` in api and web packages; add new cases.

---

## 7. Agent prompt (copy below this line)

```
You are implementing P8-A: late / partial Show Up campaign scheduling in the community-auto-scheduler monorepo.

## Read first (minimal set)
1. NMCAS-VAULT/raw/sources/2026-07-10-p8a-late-campaign-partial-schedule.md (this spec — source of truth)
2. apps/api/src/routes/campaigns.ts — POST /campaigns/schedule
3. apps/api/src/lib/campaignSchedule.ts — slot time helpers
4. apps/web/src/components/schedule/CampaignWizard.tsx
5. apps/web/src/lib/campaignSchedule.ts — validateEarliestSlot, computeShowUpSlots
6. packages/db/src/reminderTemplateDefaults.ts — slot keys

## Task
Allow scheduling a Show Up campaign when some reminder slots are already in the past, and let the operator explicitly skip slots (especially Welcome).

### API (apps/api)
- Add optional `skipSlotKeys: string[]` to POST /campaigns/schedule body (Zod).
- Remove the blanket rejection on earliestCampaignSlotTime < now+15s.
- In the reminder loop: skip creating a row when:
  (a) slotKey is in skipSlotKeys, OR
  (b) scheduledAt < now+15s, OR
  (c) shouldScheduleTemplate() is false (sticker no asset).
- If zero reminder rows would be created, return 400 with a clear message.
- Extend 201 response with skippedSlots: { slotKey, reason: "past" | "skipped" | "no_asset" }[].
- Extract skip logic to a small testable helper (e.g. apps/api/src/lib/campaignSlotSkip.ts).
- Add unit tests for the helper and/or route behaviour.

### Web (apps/web)
- Stop using validateEarliestSlot as a hard gate on Step 1; instead compute per-slot status for the review/confirm UI.
- Add "Skip Welcome" checkbox (maps to skipSlotKeys: ["welcome"]).
- Show each slot as Scheduled / Skipped (past) / Skipped (you chose) / Skipped (no sticker).
- Amber banner on wizard when any slot is past.
- Update confirm dialog counts and copy.
- Add/adjust tests in apps/web/src/lib/campaignSchedule.test.ts.

### Constraints
- No Prisma migration unless you have a strong reason (prefer skipSlotKeys only on request).
- Do not implement Value fan-out or active communities (separate task).
- Do not change POST /messages or worker send logic.
- Minimize diff; follow existing patterns in campaigns.ts and CampaignWizard.tsx.
- TypeScript strict: no any, no !, no as unknown as.

### Done when
- Acceptance criteria in section 5 of the raw spec all pass.
- Existing campaignSchedule unit tests still pass.
- Brief summary of files changed and how to manually test (one late-campaign scenario).
```

---

## 8. Related vault pages

- [[wiki/concepts/campaign-message-schedule]] — SOP times
- [[wiki/concepts/value-vs-reminder-messages]] — Reminder vs Value (Value unchanged)
- [[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]] — shipped 4-step wizard
- [[wiki/analysis/p7-ux-spec]] — §4 campaign wizard (partially outdated on Value step)
