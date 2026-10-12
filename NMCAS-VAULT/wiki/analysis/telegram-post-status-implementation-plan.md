---
title: "WhatsApp post-update notification — implementation plan"
type: "analysis"
updated: "2026-10-12"
sources: 3
tags: ["nmcas", "whatsapp", "notification", "implementation"]
---

# WhatsApp post-update notification — implementation plan

**Status:** On `main` as `4450312` (2026-10-09). Copy approved. This notification replaces the immediate failure alert. The operator reported `npm run update-server` on the droplet the same evening; `/health`, the new table, and a real DM were not re-checked in that chat. Phase 4 (both phones, one real post) is still open.  
**Later change, in the repo, not on the droplet yet:** [[wiki/analysis/telegram-reminder-status-board]] stops this DM for reminders and Value posts. The daily digest stays. The droplet still sends this DM until `update-server`.  
**Replaces:** the Telegram “arrived in the community” plan previously on this page. That approach stays withdrawn. Research: [[wiki/analysis/telegram-post-status-delivery-tracking]]. Ship note: [[wiki/sources/2026-10-09-post-update-whatsapp-ship]].

---

## 1. Feature

When a scheduled post finishes, send **one** WhatsApp private message to the two ops numbers that already receive the daily digest:

- `60139968817`
- `60176782206`

Same text to both. Sent through the project’s linked WhatsApp account (`sendDirectText`), the same path as today’s failure DM. Recipients come from `resolveNotifyMsisdns` / `NMCAS_FAILURE_NOTIFY_MSISDN`. Env can add numbers; it cannot remove these two.

The message goes out once per scheduled batch, after every community row for that batch is `SENT` or `FAILED`, or after the receipt wait has ended (`WA_RECEIPT_TIMEOUT_MS`, default 90s, plus a short buffer). It covers success and failure in the same text.

**Sent** in the message is the current Queue result: WhatsApp acknowledged the send. The footer says to open the community to confirm the post is on screen. This notification does not claim the post appeared in the group. See [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]].

**Confirmed 2026-10-09:** this notification replaces the immediate `[NMCAS] Failed to send scheduled message…` DM. Each scheduled post produces one WhatsApp notification when that post finishes, whether the Queue result is Sent or Failed. The row is still marked `FAILED` with `error` stored. The daily digest is unchanged.

A later **Re-queue** is a new send. It gets its own post update after that retry settles.

---

## 2. Message

Approved wording. Post name is the slot (Welcome, 2-Day Countdown, 1-Day Countdown, Starting Soon, 1-Hour Countdown, LIVE NOW, Post-Live Sticker) or `Value` plus format (`image + caption`, `text`, `poll`). Preview is the first line of `copyText`, shortened. A sticker or a post with no caption omits the Preview line.

Fan-out:

```
[NMCAS] Post update — 9 Oct 2026, 11:00 MYT
Project: Dr Jasmine
Post: Value · image + caption
Preview: If you're ready to learn, reset, and take back control…

Communities (6):
• RDW 6.0 — Sent
• RDW 5.0 — Sent
• RDW 4.0 — Failed — No WhatsApp server receipt for message id 3EB0…
• RDW 3.0 — Sent
• RDW 2.0 — Failed — WhatsApp engine exited
• RDW — Sent

Sent means WhatsApp acknowledged the send. Open the community to confirm the post is on screen.
```

One community:

```
[NMCAS] Post update — 8 Oct 2026, 11:00 MYT
Project: Dr Jasmine
Post: Starting Soon
Preview: We're starting soon…

Communities (1):
• RDW 6.0 — Sent

Sent means WhatsApp acknowledged the send. Open the community to confirm the post is on screen.
```

Community label is `groupName`, shortened the way operators already read it (the part before ` › ` when the name is `Community › Community`). Keep the full `groupName` when it has no ` › `.

Failed detail is the row `error`, truncated the same way as `truncateForNotifyBody`. Cap the whole DM around 3500 characters, same budget as the daily digest. If the list is longer, keep every Failed line and summarize extra Sent lines as `… +N Sent`.

---

## 3. Behaviour

| Case | What the DM says |
|------|------------------|
| Row `SENT` | `Sent` |
| Row `FAILED` with an error | `Failed —` plus the error |
| Row still `SENDING` when the receipt timeout passes | Sweeper waits until the worker marks it `SENT` or `FAILED`, then includes that result |
| Go process dies after accept (receipt never arrives) | The existing timeout marks `FAILED`. The line is Failed with that error. It is a Queue result, and the post may still be in the group |
| `CANCELLED` or `DRAFT` in the same batch | Omit those rows. If every row is cancelled or draft, send nothing |
| Re-queue | New batch id on the retried row. One new DM after that attempt settles |

One batch is one fan-out create (all communities for that Value post) or one campaign slot row (one announcements group).

---

## 4. Implementation

### Phase 1 — Batch id and “already notified”

Schema:

- `ScheduledMessage.fanOutBatchId String?` indexed.
- `PostStatusNotice`: `batchId` unique, `postedAt`, `body`, `error String?` (set when the WhatsApp DM itself fails; the sweep retries while `postedAt` is null).

Stamp one `fanOutBatchId` inside the Value fan-out transaction in `apps/api/src/routes/messages.ts`. Stamp a fresh id on each campaign reminder row in `apps/api/src/routes/campaigns.ts`, and on single-message create. Re-queue writes a new id and clears any tie to the old notice.

**Done when:** a two-community fan-out shares one `fanOutBatchId`. A re-queue gets a different id.

### Phase 2 — Formatter

Pure function, for example `apps/api/src/lib/postUpdateNotice.ts`, with tests for:

- the Value fan-out sample and the Starting Soon sample above (fixture names, not live sends)
- sticker with no Preview line
- body over the character cap keeping Failed lines
- a batch of only `CANCELLED` rows returning no text

**Done when:** those tests pass. No WhatsApp call in this phase.

### Phase 3 — Send once, drop the immediate failure DM

Sweeper beside the rescue sweep, about once a minute:

1. Find a `fanOutBatchId` with no `PostStatusNotice.postedAt`.
2. Skip it while any row is `PENDING` or `SENDING` and `scheduledAt + WA_RECEIPT_TIMEOUT_MS + 30s` is still in the future.
3. Build the text. Send it with the existing notify loop: `waPool.start`, `isSendReady`, `sendDirectText` to each MSISDN from `resolveNotifyMsisdns`.
4. Store `postedAt` only after at least one number accepts the send. If both fail, store `error` and retry next sweep.

In `markFailedWithNotify` (`apps/api/src/worker/send-scheduled-message.ts`), keep the `FAILED` write and stop calling `sendFailureWhatsAppAlert` for scheduled rows. Those failures show up in the post update instead.

**Done when:** one fan-out produces one DM to both numbers; a second sweep does not send again; a Failed row does not also emit `[NMCAS] Failed to send…`.

### Phase 4 — Check on a real send

Schedule a test post to one community. Confirm both phones get one message, the slot name and result match Queue, and a forced failure produces the Failed line without a second failure DM.

**Done when:** that check is noted in the vault. Not done as of the 2026-10-09 ship note.

---

## 5. Out of scope

- Telegram.
- Changing what Queue **Sent** means.
- Storing receipt type or chat.
- Claiming the post is visible in the community.
- Editing the daily digest body.
- Per-project recipient lists (`NotifyRecipient` stays unused).

---

## 6. Files

| Area | Path |
|------|------|
| Failure DM today | `apps/api/src/worker/send-scheduled-message.ts` `markFailedWithNotify` |
| Recipient list | `apps/api/src/lib/notifyMsisdn.ts` |
| Digest pattern (schedule, length cap, DM loop) | `apps/api/src/lib/dailyDigest.ts` |
| Fan-out create | `apps/api/src/routes/messages.ts` |
| Campaign create | `apps/api/src/routes/campaigns.ts` |
| Re-queue | `POST /messages/:id/requeue` |
| Schema | `packages/db/prisma/schema.prisma` |
