---
title: "Starting Soon false SENT — RDW 6.0 (2026-09-08)"
type: "source-summary"
updated: "2026-09-09"
sources: 1
tags: ["nmcas", "whatsapp", "sent", "starting-soon", "incident", "receipt"]
---

# Starting Soon false SENT — RDW 6.0 (2026-09-08)

**Raw:** `raw/sources/2026-09-09-starting-soon-false-sent-rdw6.md`

## Summary

Dr Jasmine **Reversing Diabetes Workshop 6.0** Show Up **Starting Soon** (8 Sep 2026, 11:00 MYT) showed **Sent** in Queue. The Announcements channel did **not** show that post. **LIVE NOW**, **Sticker**, and **Value** posts to the same community **did** appear. The visible Starting Soon was an operator **phone** send at 13:05.

NMCAS **did run** the 11:00 job: `waMessageId` `3EB08C5AE0DFF1EBED3008`, IPC accept 11:00:49 MYT, `message:receipt` **568 ms** later → `SENT`. A second NMCAS Starting Soon (single-message, 13:00) was also `SENT` at 13:00:07; that is not the post the group saw.

## Cause

Receipt-gated SENT (**Stage B**) is live: Sent means WhatsApp **server ack** for `waMessageId`, not “visible in the group.” Stage C (outbound echo `isFromMe`) was never implemented. The 11:00 image stanza was acked and not published. NMCAS cannot see that, so Queue stays green.

## Ruled out

Wrong JID; skipped job; corrupt `04-starting-soon.jpeg` (same file landed on earlier RDW campaigns); caption length (Value posts ~1900 chars appeared in this group); a separate Starting Soon sender.

## Contrast

July 2026 missed Starting Soon was **Render OOM / job never ran** ([[wiki/sources/2026-07-16-do-migration-oom-incident-session]]). This incident is **job ran + false green Sent**.

The inverse (IPC accept, no receipt, Queue FAILED, group may still show the post) is [[wiki/sources/2026-09-09-rdw4-value-no-receipt-notify-vercel]] (RDW 4.0 Value 2026-09-09).

## See also

- [[wiki/entities/scheduled-message]]
- [[wiki/concepts/campaign-message-schedule]]
- [[wiki/sources/2026-07-27-wa-reliability-always-on-plan]]
- [[wiki/sources/2026-09-09-rdw4-value-no-receipt-notify-vercel]]
- [[wiki/overview]]
