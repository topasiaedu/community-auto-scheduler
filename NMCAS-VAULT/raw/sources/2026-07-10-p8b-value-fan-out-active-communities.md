# Raw source: P8-B — Value post fan-out + active communities (2026-07-10)

**Type:** Product requirement + implementation brief for a coding agent.  
**Date:** 2026-07-10  
**Scope:** Schedule one Value post once → create rows for all **active** project communities' Announcements channels.  
**Repo:** `community-auto-scheduler` (monorepo: `apps/api`, `apps/web`, `packages/db`)  
**Prerequisite:** None (can ship after or in parallel with P8-A).  
**Out of scope:** duplicate community disambiguation UX (operator handles manually), re-adding Value to campaign wizard, optional alternate-day Value slots.

---

## 1. Problem (operator pain)

**Design intent (shipped P7):** Value posts are fresh copy scheduled via **Schedule → Single message**, fanning out to every WhatsApp community's **Announcements** channel on the project's connected account.

**Actual UI today:** Single message requires picking **one** community + channel. Submit calls `POST /messages` once → **one** `ScheduledMessage` row. The operator must repeat for every community (same image, caption, time) — effectively as tedious as posting manually in WhatsApp.

**Bulk fan-out code exists but is unwired:**

- `apps/api/src/lib/valueFanOut.ts` — `resolveValueFanOutDestinations(groups)`
- `apps/web/src/lib/valueFanOut.ts` — client mirror (same algorithm)
- `apps/api/src/routes/campaigns.ts` — fan-out loop when `valuePosts[]` non-empty (campaign wizard no longer sends value posts)

**New requirement:** Operator configures which communities are **active** for Value fan-out (subset of all linked communities). Default: all eligible. Then compose one Value post → schedule to N active communities in one confirm.

---

## 2. Current fan-out resolver (do not rewrite — extend)

Algorithm in `apps/api/src/lib/valueFanOut.ts`:

1. Normalize WA group rows (`normalizeWaGroupRow`).
2. Keep rows with `communityJid` set AND (`channelName === "Announcements"` OR `isAnnounce === true`).
3. Dedupe by channel `jid`.
4. One destination per `communityJid` (first by stable sort on `jid`).
5. Exclude standalone groups (no `communityJid`).
6. Error only when **zero** destinations (422 in campaign route).

**Change needed:** After step 4/5, **filter** destinations to those whose `communityJid` is in the project's `activeCommunityJids` list. If list is empty/null, treat as **all eligible** (backward compatible).

---

## 3. Desired behaviour

### 3.1 Persist active communities per project

Add to `Project` model:

```prisma
activeCommunityJids Json?  // string[] — WhatsApp community JIDs, or null = all eligible
```

- Migration in `packages/db/prisma/migrations/`.
- `null` or `[]` → fan-out uses **all** eligible communities (same as today).
- Non-empty array → only those `communityJid` values receive Value fan-out.

Expose via existing project API:

- `GET /projects` — include `activeCommunityJids` in each project payload.
- `PATCH /projects/:id` — accept optional `activeCommunityJids: string[] | null`.
- Validate: each JID is a non-empty string, max reasonable count (e.g. 50), dedupe on save.

### 3.2 Settings UI — Active communities

New card on Settings page (`apps/web/src/pages/SettingsPage.tsx`), e.g. `ActiveCommunitiesCard.tsx`:

- Requires WA connected; load groups from existing VM (`useNmcasVm` / `GET /wa/groups` pattern).
- List **communities** (not every channel): group by `communityJid`, show community display name.
- Checkbox per community; default all checked when `activeCommunityJids` is null.
- Save → `PATCH /projects/:id` with selected JIDs.
- Helper text: “Value posts scheduled in Single message mode will be sent to Announcements in each active community.”
- If WA disconnected, show connect prompt (mirror Reminder template library pattern).

### 3.3 Single message — Value fan-out mode

When **What kind** = Value post (all formats: IMAGE_CAPTION, POLL, TEXT_ONLY):

- **Hide** the single destination `CommunityChannelPicker` (or show read-only fan-out summary).
- Show banner: “Will send to **N** active communities” with collapsible `<details>` listing names.
- Link: “Manage active communities” → `/settings#active-communities`.
- If N = 0 → block schedule with: “No active communities with an Announcements channel. Check Settings or WhatsApp connection.”

**Confirm modal:** “Schedule **N** Value posts?” list destinations.

### 3.4 API — fan-out on POST /messages

Extend `POST /messages` for Value kinds only:

**Option A (preferred):** add optional `fanOut: true` on Value request bodies. When true:

- Require `groupJid` / `groupName` **omitted** or ignored.
- Load project `activeCommunityJids`, WA groups, run `resolveValueFanOutDestinations` + filter.
- If 0 destinations → `422`.
- Create N rows in a **transaction** (same snapshot fields per row: copy, image, poll, scheduledAt).
- Enqueue pg-boss job per row (same as single create today).
- Response `201`: `{ messageIds: string[], fanOutCount: number, destinations: string[] }`.

When `fanOut` false or absent → existing single-destination behaviour unchanged (backward compat).

**Option B:** separate `POST /messages/value-fan-out` — only if extending union schema is too messy.

Single-message **Reminder** path unchanged (still one destination).

### 3.5 Campaign route alignment (small)

Update `apps/api/src/routes/campaigns.ts` value fan-out block (if ever used) to respect `activeCommunityJids` via the same filtered resolver. Low priority if wizard still sends empty value arrays — but keep one shared function:

`resolveValueFanOutDestinationsForProject(groups, activeCommunityJids: string[] | null)`

---

## 4. Files to touch (expected)

| Area | Files |
|------|--------|
| Schema | `packages/db/prisma/schema.prisma` + new migration |
| Project API | `apps/api/src/routes/projects.ts` |
| Fan-out | `apps/api/src/lib/valueFanOut.ts`, `apps/web/src/lib/valueFanOut.ts` |
| Messages API | `apps/api/src/routes/messages.ts` |
| Campaign API | `apps/api/src/routes/campaigns.ts` (use shared filter) |
| Settings UI | `apps/web/src/components/settings/ActiveCommunitiesCard.tsx`, `SettingsPage.tsx` |
| Schedule UI | `apps/web/src/components/schedule/SingleMessageSection.tsx` |
| Types | `apps/web/src/types/models.ts`, project types in hook |
| Hook | `apps/web/src/hooks/useNmcasApp.ts` — project patch/get if needed |
| Tests | `apps/api/src/lib/valueFanOut.test.ts` (new), messages route tests if pattern exists |

---

## 5. Acceptance criteria

1. Settings: save 2 of 3 communities as active → PATCH persists; reload shows same selection.
2. `activeCommunityJids: null` → fan-out count = all eligible communities (regression).
3. Single message Value IMAGE_CAPTION + fanOut → N rows in DB, N queue jobs, correct Announcements JIDs.
4. Single message Value with fanOut and zero active eligible → 422, clear error.
5. Single message Reminder still requires one destination — unchanged.
6. Single message Value **without** fanOut (if still supported) OR legacy single-destination path still works for edge cases.
7. Confirm UI shows destination list and count before submit.
8. Unit tests: fan-out filter with active list subset; empty active list falls back to all.

---

## 6. API contract sketch

### PATCH /projects/:id

```json
{
  "activeCommunityJids": ["120363…@newsletter", "120363…@newsletter"]
}
```

Set `null` to mean “all communities”.

### POST /messages (Value + fan-out)

```json
{
  "operatorKind": "VALUE",
  "valueFormat": "IMAGE_CAPTION",
  "fanOut": true,
  "copyText": "…",
  "imageUrl": "posts/{projectId}/…",
  "scheduledAt": "2026-07-12T03:00:00.000Z"
}
```

### Response 201

```json
{
  "messageIds": ["cuid1", "cuid2"],
  "fanOutCount": 2,
  "destinations": ["RDW 3.0 › Announcements", "RDW 4.0 › Announcements"]
}
```

Image URL prefix validation: same `posts/{projectId}/` rule as today.

---

## 7. Implementation notes

- Reuse `authorizedFetch`, `enqueueScheduledMessage`, transaction patterns from `campaigns.ts` value loop (~lines 313–341).
- Do not run `npm start` / `npm run build` unless user asks (they may have dev servers running).
- Double quotes, strict TS, no `any`.
- Hash anchor `#active-communities` on Settings for deep link from Schedule.
- Poll and TEXT_ONLY Value formats must fan-out with same field snapshot per row.

---

## 8. Agent prompt (copy below this line)

```
You are implementing P8-B: Value post fan-out with per-project active communities in the community-auto-scheduler monorepo.

## Read first (minimal set)
1. NMCAS-VAULT/raw/sources/2026-07-10-p8b-value-fan-out-active-communities.md (this spec — source of truth)
2. apps/api/src/lib/valueFanOut.ts and apps/web/src/lib/valueFanOut.ts
3. apps/api/src/routes/messages.ts — POST /messages create flow
4. apps/api/src/routes/campaigns.ts — value fan-out transaction loop (reference only)
5. apps/web/src/components/schedule/SingleMessageSection.tsx
6. apps/api/src/routes/projects.ts and apps/web/src/components/settings/ProjectLinksCard.tsx (PATCH pattern)
7. apps/web/src/pages/SettingsPage.tsx

## Task
Wire Value post fan-out into Single message mode, with per-project active community selection in Settings.

### Database
- Add Project.activeCommunityJids (Json nullable, string[] semantics) + migration.
- null or [] means "all eligible communities" for fan-out.

### API
- Extend GET/PATCH /projects for activeCommunityJids.
- Extend resolveValueFanOutDestinations (or wrapper) to filter by activeCommunityJids.
- Extend POST /messages: when operatorKind is VALUE and fanOut: true, create one ScheduledMessage per destination in a transaction; enqueue each job; return messageIds + fanOutCount + destinations.
- 422 when zero destinations after filter.
- Apply same filter in campaigns.ts value fan-out path via shared helper.

### Web
- New ActiveCommunitiesCard on Settings: checkboxes per communityJid from WA groups, save via PATCH.
- SingleMessageSection: when kind is VALUE, show fan-out banner (N communities), hide single picker, set fanOut: true on submit.
- Update confirm modal for multi-row schedule.
- Deep link /settings#active-communities.

### Tests
- Unit tests for filtered fan-out resolver (subset, null = all, zero eligible).
- Do not add trivial tests.

### Constraints
- Do not re-add Value posts to Campaign wizard.
- Do not implement late-campaign skip logic (P8-A — separate task).
- Reminder single-message flow unchanged.
- Minimize diff; match existing code conventions.

### Done when
- Section 5 acceptance criteria pass.
- Summary of migration name, manual test steps (2 communities, 1 deselected in Settings, schedule one Value post → 1 row).
```

---

## 9. Related vault pages

- [[wiki/concepts/value-vs-reminder-messages]] — Value via Single message, fan-out intent
- [[wiki/analysis/p7-ux-spec]] — §5 Single-message, §10 fan-out resolver (Step 4 Value is outdated)
- [[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]] — Value removed from wizard
- [[wiki/entities/project]] — extend with activeCommunityJids when wiki updated
