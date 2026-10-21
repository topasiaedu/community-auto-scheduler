---
title: "Community Reminder status board"
type: "analysis"
updated: "2026-10-13"
sources: 0
tags: ["nmcas", "telegram", "reminder", "implementation"]
---

# Community Reminder status board

**Status:** Phases 1–4 are on `main` as `06558bc` and were restarted on the droplet. Phase 5 (a real upcoming slot) is still open.  
**Backfill:** that restart announced old finished reminders that had no closed notice. The follow-up skips reminders from before the startup window and closes them with no Telegram message. A later status-only test was marked Sent and skipped WhatsApp, but the sweep kept reading 40 batches that were already closed, so the new batch never reached Telegram. The sweep now takes the newest unfinished batches. A restart can still announce a reminder from the last 6 hours.  
**Same bot and group** as the WhatsApp disconnect alert: `@nmcas_status_bot` in **NMCAS Status Update**. No new BotFather setup. See [[wiki/analysis/telegram-wa-disconnect-alert]].  
**Stops** the WhatsApp `[NMCAS] Post update` private message for Community Reminders and for Value posts, once this build is running on the server. Until then that DM still goes out. See [[wiki/analysis/telegram-post-status-implementation-plan]].  
**Keeps** the morning WhatsApp daily digest to `60139968817` and `60176782206`.

Tick a box only when that line is actually done. Each phase has its own definition of done. Do not start Phase 5 until Phase 4’s definition of done is met.

---

## 1. What you will get

When a Community Reminder slot finishes, the bot updates **one Telegram message for that webinar**. The first finished slot creates the message. Each later slot **edits that same message**. The group does not get a second copy.

You read that message. If the latest line says Failed, you send that reminder in WhatsApp yourself. The next time a slot finishes, every earlier line is shown as Sent. The board does not ask WhatsApp whether that hand send landed.

Value posts are not edited onto this reminder board. When a Value fan-out finishes, the same bot sends **one new message** in the same group. Each community line says Sent or Failed from the Queue. There is still no WhatsApp post-update DM. The morning digest still lists the day. A Value post from before the announce window is closed with no Telegram message.

The board can lag about a minute after the Queue shows Sent, because it uses the existing once-a-minute sweep. A failure can take the receipt wait as well (default 90 seconds) before the line says Failed.

Campaigns that already finished before this ships do not get a board.

---

## 2. Message

Header, then one line per slot that has already finished. No blank line between the header and the first slot. Upcoming slots are left off.

```text
Project: Dr Jasmine
👥 Community Reminder
01 Welcome — 4 days before · 3:00 PM  🟢Sent
02 2-Day Countdown — 2 days before · 11:00 AM  🟢Sent
```

A failure:

```text
Project: Dr Jasmine
👥 Community Reminder
01 Welcome — 4 days before · 3:00 PM  🔴Failed
```

After the next slot finishes, the same message grows. Every earlier line is marked Sent, including one that was Failed last time. You will have sent that failed reminder by hand before the next slot runs.

```text
Project: Dr Jasmine
👥 Community Reminder
01 Welcome — 4 days before · 3:00 PM  🟢Sent
02 2-Day Countdown — 2 days before · 11:00 AM  🟢Sent
```

If that next slot itself fails, only that newest line says Failed:

```text
Project: Dr Jasmine
👥 Community Reminder
01 Welcome — 4 days before · 3:00 PM  🟢Sent
02 2-Day Countdown — 2 days before · 11:00 AM  🔴Failed
```

Rules for each line:

- The number is the slot `sortOrder`, two digits (`01` through `07`). A slot that was not scheduled is omitted, so the numbers can jump. Starting Soon is `04`. If that slot was skipped, the board goes from `03` to `05`.
- The name is fixed for the board, even if the template was renamed in Settings:

| slotKey | Board name |
|---------|------------|
| `welcome` | Welcome |
| `countdown_2d` | 2-Day Countdown |
| `countdown_1d` | 1-Day Countdown |
| `starting_soon` | Starting Soon |
| `countdown_1h` | 1 Hour |
| `live_now` | LIVE NOW |
| `post_live_sticker` | Post-Live Sticker |

- The phrase comes from the slot rule. A webinar-date offset of 4, 2, or 1 day is `4 days before`, `2 days before`, or `1 day before`. Day-of slots and event-relative slots (1 Hour, LIVE NOW, Post-Live Sticker) say `Webinar day`. A positive day offset, if one ever exists, says `N days after`.
- The clock is that row’s real `scheduledAt` in MYT, 12-hour, minutes always two digits (`3:00 PM`, `7:58 PM`). No `MYT` suffix.
- Separator is an em dash (`—`) before the phrase and a middle dot (`·`) before the clock. Two spaces, then `🟢Sent` or `🔴Failed`.
- Failed has no error text.
- Only the newest line on the board uses the Queue result. Every line above it is `🟢Sent`.

On the newest line, `🟢Sent` means the Queue status is `SENT` (WhatsApp acknowledged the send) and `🔴Failed` means the Queue status is `FAILED`. Sent on an older line means you are treating that reminder as already handled, including by a hand send. Neither mark means someone opened the community and saw the post. See [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]].

---

## 3. Behaviour

One board belongs to one campaign (one webinar, one announcements group). Two webinars for the same project are two messages. Both headers use the project name only, matching the sample above.

Each slot is recorded once, with the Queue result from that attempt. The displayed mark is applied when the message is built: the latest recorded slot keeps that result, and every earlier slot is shown as Sent. The board does not read WhatsApp again to decide those earlier marks.

- A Failed line stays Failed only while it is the latest line.
- When a newer slot is added, the previous Failed line becomes `🟢Sent` in the same edit. That does not change the Queue row. The Queue can still say Failed.
- An in-app re-queue does not by itself edit the board. The next scheduled slot is what moves the old line to Sent.
- If Telegram has not stored a slot yet, and a re-queue of that same slot settles first, the stored result is that later Queue result.
- `PENDING`, `SENDING`, `CANCELLED`, and `DRAFT` rows are not lines.
- Slots with no database row (disabled, unchecked, in the past, or a sticker with no file) never appear.
- If the group message was deleted, the next update sends a new message with the full board and keeps the new message id.
- If the bot token or chat id is empty, the API still starts. The board sends nothing. WhatsApp post updates stay off once Phase 4 is in.
- Disconnect alerts keep using `sendMessage`. They are separate messages in the same group.

---

## 4. WhatsApp messages to the two numbers

After Phase 4:

| Message | What happens |
|---------|----------------|
| `[NMCAS] Post update` after each reminder slot | Stops |
| `[NMCAS] Post update` after each Value fan-out | Stops. One Telegram status message is sent instead |
| Daily digest (default 8:00 AM MYT) | Unchanged |
| Already delivered post updates | Not recalled |
| Telegram disconnect / connected-again alerts | Unchanged |

The once-a-minute sweep in [apps/api/src/lib/postUpdateSweep.ts](../../../apps/api/src/lib/postUpdateSweep.ts) stays. It is the timer. A reminder batch updates the Telegram board. A Value batch sends one Telegram status and does not call `sendDirectText`. Batches that already have `PostStatusNotice.postedAt` are left alone, so old campaigns are not backfilled.

---

## 5. Phases

### Phase 1 — Board wording

No database and no Telegram call.

- [x] A pure formatter builds the header and one line from project name, slot key, sort order, schedule rule, `scheduledAt`, and `SENT` or `FAILED`.
- [x] Welcome at 15:00 MYT on a −4 day rule renders `01 Welcome — 4 days before · 3:00 PM  🟢Sent`.
- [x] A second line under a Failed first line renders the first line as `🟢Sent` and the new line from that slot’s Queue result.
- [x] Sort order `4` omitted leaves a gap (`03` then `05`).
- [x] `countdown_1h` renders as `1 Hour` and `Webinar day`, with the clock taken from `scheduledAt`.
- [x] `FAILED` renders `🔴Failed` and does not include the error string.
- [x] A sticker slot can render with no caption preview. This board has no Preview line at all.
- [x] Tests live next to the formatter and do not call the network.

**Definition of done:** met. Those tests pass. No WhatsApp call and no Telegram call in this phase.

### Phase 2 — The bot can edit its own message

- [x] `sendTelegramText` in [apps/api/src/lib/telegramNotify.ts](../../../apps/api/src/lib/telegramNotify.ts) still posts `sendMessage`.
- [x] On success it returns Telegram’s `message_id`. On failure it still returns a failure and does not throw.
- [x] A new helper posts `editMessageText` with `chat_id`, `message_id`, and `text`.
- [x] Timeout and token redaction match the existing send helper.
- [x] The disconnect alert still sends a new message. It does not need the message id.
- [x] Tests use a fake `fetch`. They cover a successful send that yields an id, a rejected send, a successful edit, and a rejected edit.

**Definition of done:** met. The fake-fetch tests pass, and existing disconnect-alert tests still pass. No webhook was added.

### Phase 3 — Remember one board per webinar

- [x] Prisma has one board row per campaign: `campaignId`, `chatId`, `messageId`, append-only lines, and an optional last error.
- [x] Each stored line keeps the scheduled-message id, `sortOrder`, the wording, and the Queue result from that attempt. The Sent mark on older lines is applied when formatting, not by rewriting the stored result.
- [x] Migration `20261012180000_campaign_reminder_board` is under `packages/db/prisma/migrations`. `npm start` already runs `scripts/migrate-deploy.mjs`, so the droplet applies it on the next `npm run update-server`. That live apply is Phase 5. It was not run in this session.
- [x] Campaigns with no board row are unchanged. The relation is optional.

**Definition of done:** the migration file is in the repo and `prisma generate` succeeded. Applying it to the live database is still Phase 5.

### Phase 4 — Update the board, and stop the WhatsApp post update

Hook this into the existing sweep. Do not add a second timer.

- [x] A reminder row is eligible only when its batch is newly settling (`operatorKind` is `REMINDER`, it has a `campaignId`, status is `SENT` or `FAILED`, and `PostStatusNotice.postedAt` is still empty).
- [x] The first eligible slot for a campaign sends one Telegram message and stores `messageId`.
- [x] A later slot for that campaign edits that message. The text is the header plus every stored line, ordered by `sortOrder`.
- [x] A scheduled-message id that is already stored is not appended again. Its stored Queue result is not rewritten. Formatting still shows every line except the latest as `🟢Sent`.
- [x] A failed Telegram call leaves the batch unposted so the next sweep retries. It does not send a WhatsApp DM while retrying.
- [x] If Telegram says the old message cannot be edited, a new message is sent with the full board and the new id is stored.
- [x] A Value batch is marked handled and does not call `sendDirectText`.
- [x] A reminder batch is marked handled only after the Telegram send or edit succeeds.
- [x] Empty Telegram env does not crash the sweep. Value batches are still marked handled. Reminder batches stay unposted so they can send after the env is present.
- [x] [apps/api/src/lib/dailyDigest.ts](../../../apps/api/src/lib/dailyDigest.ts) was not changed.
- [x] The immediate failure DM stays removed. This phase does not bring it back.
- [x] Tests cover: first line creates a message, a later slot edits the same message, a previous Failed line becomes `🟢Sent` when the next slot is added, a skipped `04` leaves a gap, a Value batch sends no WhatsApp text, and a second pass for an already stored slot does not send a second board message.

**Definition of done:** met. Those tests pass. `npm test` in `apps/api` passed (131 tests, 0 failed). The digest formatter tests were unchanged and still pass.

### Phase 5 — The live group shows a real board

Do this on the droplet after Phase 4 is on `main`. `npm run update-server` pulls, builds, and restarts PM2. Restart runs `npm start`, which applies the migration. It does not copy `.env`. No new env lines are required if `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are already on the droplet.

- [ ] `npm run update-server` was run after this work is on `main`.
- [ ] `https://nmcas-server.nmmedia.app/health` returns `ok: true`.
- [ ] One real Community Reminder (or a short test campaign slot) reaches Sent or Failed.
- [ ] **NMCAS Status Update** shows one board for that project, with that slot’s number, name, phrase, clock, and `🟢Sent` or `🔴Failed`.
- [ ] A second slot on the same webinar edits that message. If the first line was Failed, it now shows `🟢Sent`, and the new line shows that slot’s result.
- [ ] Neither phone receives a new `[NMCAS] Post update` for that slot.
- [ ] The next morning digest still arrives.

**Definition of done:** the group shows the growing board for two slots of one webinar, and the post-update DM did not arrive for those slots.

---

## 6. Overall definition of done

All of these are true:

1. Phase 1 through Phase 5 checklists are complete.
2. Each webinar has at most one current board message in **NMCAS Status Update**.
3. A new reminder slot appends one line. Only that newest line may say Failed. Every earlier line says Sent.
4. Value posts do not appear on the board and do not send a WhatsApp post update.
5. The daily digest still goes to both ops numbers.
6. Disconnect alerts still post as their own messages.
7. Old campaigns are not backfilled.
8. No bot token is in git, this wiki, or the logs.
9. The API still starts when the Telegram variables are missing.

---

## 7. Files the build is expected to touch

- [packages/db/prisma/schema.prisma](../../../packages/db/prisma/schema.prisma) — the board model.
- `packages/db/prisma/migrations/` — one new migration.
- [apps/api/src/lib/telegramNotify.ts](../../../apps/api/src/lib/telegramNotify.ts) — return `message_id`; add `editMessageText`.
- [apps/api/src/lib/telegramNotify.test.ts](../../../apps/api/src/lib/telegramNotify.test.ts) — send id and edit cases.
- New formatter and tests beside [apps/api/src/lib/postUpdateNotice.ts](../../../apps/api/src/lib/postUpdateNotice.ts).
- [apps/api/src/lib/postUpdateSweep.ts](../../../apps/api/src/lib/postUpdateSweep.ts) — reminder board update; stop `sendDirectText` for every batch.
- Sweep tests, if they already cover the WhatsApp send, updated so a finished batch does not DM.

No new env var. No web UI change. No webhook.

---

## 8. Out of scope

- Listing upcoming slots before they finish.
- Putting Value posts on the Telegram board.
- Checking WhatsApp to see whether a hand send landed. Older lines become Sent when the next slot is posted, without that check.
- Recalling post-update DMs that already reached the phones.
- Changing the daily digest text or its 8:00 AM schedule.
- Changing what Queue **Sent** means.
- A separate Telegram chat for this board.
- Posting one new message per slot instead of editing the same message.
