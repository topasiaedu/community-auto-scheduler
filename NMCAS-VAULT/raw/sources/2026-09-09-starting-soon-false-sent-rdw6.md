# Raw source: Starting Soon false SENT — RDW 6.0 (2026-09-08)

**Type:** Production incident investigation — Queue SENT vs community not visible  
**Date of incident:** 2026-09-08 (Starting Soon 11:00 MYT)  
**Date recorded:** 2026-09-09  
**Project:** Dr Jasmine (`cmresmpxn0000x1w6vet6i42z`)  
**Campaign:** Show Up for webinar date 2026-09-08, event start 20:00 MYT (`cmtl2qhcm00coe7o7r8wsm0nu`)  
**Destination:** `Reversing Diabetes Workshop 6.0 › Reversing Diabetes Workshop 6.0` (`120363408928450031@g.us`)  
**Constraint:** Investigation was read-only. No re-queue and no WhatsApp send from NMCAS.

---

## 1. Operator report

Queue Message detail showed Starting Soon as **Sent successful**:

1. Sent Date: 8th September 2026
2. Sent Time: 11.00am
3. Starting Soon

The community Announcements channel did **not** receive that post.

Operator follow-up (2026-09-09):

- **LIVE NOW** and **Sticker** from the same campaign **did** appear on time.
- **Value posts** to the same community **did** appear.
- A Starting Soon at **1:00 PM** was **manually posted from the phone at 1:05 PM** (that is the post the group actually saw).

---

## 2. What NMCAS actually did

The 11:00 Starting Soon row is **not** a skipped job. The pg-boss worker ran.

| Field | Value |
|-------|--------|
| Row id | `cmtl2qhgq00cwe7o76apvbflk` |
| Slot | `starting_soon` (Reminder IMAGE) |
| `scheduledAt` | 2026-09-08 03:00:00 UTC (11:00 MYT) |
| `status` | `SENT` |
| `waAcceptedAt` | 2026-09-08 03:00:49.296 UTC |
| `sentAt` / `waAckedAt` | 2026-09-08 03:00:49.864 UTC |
| Accept → ack | 568 ms |
| `waMessageId` | `3EB08C5AE0DFF1EBED3008` |
| Image | `reminders/…/04-starting-soon.jpeg` |
| Caption length | 1062 characters |
| `pgBossJobId` | `5425cb6a-acb3-488f-a2f9-a9e6bc8851b6` |

Same campaign, same `groupJid`, all other Show Up rows are also `SENT`: Welcome, 2-Day, 1-Day, 1-Hour, LIVE NOW, Sticker.

A second Starting Soon row (not on the campaign) was created at 12:59 MYT, scheduled 13:00 MYT:

| Field | Value |
|-------|--------|
| Row id | `cmts79afk00l2e7o7drpez4d3` |
| `campaignId` | null (single-message) |
| `scheduledAt` | 2026-09-08 05:00:00 UTC (13:00 MYT) |
| NMCAS `sentAt` | 2026-09-08 05:00:07.237 UTC |
| `waMessageId` | `3EB0FBE54D836CFC62504C` |
| Same image path as 11:00 | yes |

NMCAS therefore marked **two** Starting Soon attempts Sent. The visible community post was the operator’s **phone** send at 13:05.

---

## 3. Why Queue can say Sent when the group is empty

Receipt-gated SENT from the 2026-07-27 reliability plan **is implemented**.

Send path (`apps/api/src/worker/send-scheduled-message.ts` + `apps/api/src/wa/wa-manager.ts`):

1. IPC send succeeds → store `waMessageId`, keep `SENDING`.
2. Any `message:receipt` whose `ids` include that `waMessageId` → `SENT`.
3. No receipt within ~90s → `FAILED` (“No WhatsApp server receipt…”).

That is **plan Stage B (server-acked)**. The handler does **not** filter `receipt.type`, does **not** require `receipt.chat === groupJid`, and does **not** wait for an inbound echo (`isFromMe`) of the outbound post (**Stage C**, never implemented).

568 ms from accept to ack is a **server receipt**, not proof members can see the message.

Receipt timeout **does** work when there is no ack: other communities that week correctly went `FAILED` with “No WhatsApp server receipt” (e.g. RDW 3.0 Value 2026-09-05, RDW 4.0 Value 2026-09-09). This Starting Soon row **did** get an ack, so the UI stayed green.

---

## 4. Ruled out

| Hypothesis | Evidence against |
|------------|------------------|
| Wrong community / JID | LIVE NOW, Sticker, and Value posts landed in RDW 6.0; all campaign rows share `120363408928450031@g.us`. Label `Community › Community` is the usual default-subgroup naming (same pattern as RDW 5.0 / 4.0 / 2.0). |
| Job never fired | `waMessageId`, `waAcceptedAt`, `sentAt` present; lag 49s (media download + upload), not skipped. |
| Corrupt Starting Soon asset | Storage object is a valid 1200×1200 sRGB JPEG, 235 KiB, not progressive. **Same file** `04-starting-soon.jpeg` has `SENT` on earlier campaigns (RDW 5.0 2026-08-18, RDW 4.0 / base RDW 2026-08-11, RDW 2.0 2026-08-18, RDW 5.0 2026-08-04, etc.). |
| Caption over WhatsApp’s 1024 image-caption limit | Starting Soon caption is 1062. **Value** posts to this same JID with ~1907–1923 characters **appeared**. NMCAS allows `copyText` up to 4096 and does not enforce 1024 on image captions. Caption length is not unique to this miss. |
| Scheduler treats Starting Soon differently | Reminder IMAGE and Value IMAGE_CAPTION both call `sendPost` → `sendGroupImage`. LIVE NOW is TEXT; Sticker is `sendGroupSticker`. No separate Starting Soon sender. |
| Competing job at 11:00 | Only this Starting Soon row fired in the 11:00 MYT window. Value 11:00 slots are other calendar days (−3d / −1d / +1d). |

---

## 5. Why this slot looked unique

LIVE NOW (text), Sticker, and Value (other images, other days) used the **same linked WhatsApp session** and **same group** and **were visible**.

The 11:00 Starting Soon send was an **image + SOP caption** stanza that WhatsApp **acked** and **did not publish** into Announcements. NMCAS cannot distinguish that from a visible post.

The 13:00 NMCAS retry of the **same image** was also marked Sent at 13:00:07. The group’s visible Starting Soon was the **phone** post at 13:05.

This is **not** “Starting Soon is broken as a template.” It is “this one (and likely the NMCAS 13:00 retry) image stanza was server-acked and not shown.”

Same-day 1-Hour Countdown is also Reminder IMAGE (`SENT` 19:00 MYT). Operator confirmed LIVE NOW and Sticker; 1-Hour was not separately confirmed.

---

## 6. Related campaign timings (same destination)

| Slot | scheduledAt MYT | NMCAS sentAt MYT | Notes |
|------|-----------------|------------------|--------|
| Welcome | 4 Sep 15:00 | 16:26 | ~86 min late |
| 2-Day | 6 Sep 15:00 | 15:00:52 | |
| 1-Day | 7 Sep 20:00 | 20:59 | ~59 min late |
| Starting Soon | 8 Sep 11:00 | 11:00:49 | **Not visible in group** |
| NMCAS Starting Soon retry | 8 Sep 13:00 | 13:00:07 | Also `SENT`; group saw phone post 13:05 |
| 1-Hour | 8 Sep 19:00 | 19:00:13 | IMAGE |
| LIVE NOW | 8 Sep 19:58 | 19:58:03 | TEXT — **visible** |
| Sticker | 8 Sep 20:18 | 20:18:04 | **visible** |

Welcome and 1-Day delays are separate (WA not ready / rescue); they still reached `SENT`. They were not part of the operator’s “did it appear?” check.

Zero `MessageReaction` / `MessageReply` rows on the whole campaign — engagement ingest is not evidence of delivery.

---

## 7. Conclusion

**Scheduler:** did send Starting Soon at 11:00.  
**Queue Sent:** means WhatsApp server receipt (Stage B), not “visible in the community.”  
**Community miss:** WhatsApp accepted that image stanza and did not fan it out (or it was not visible on Announcements). NMCAS has no echo check, so it cannot fail the row.  
**Visible Starting Soon:** operator phone send at 13:05.

No code change in this session. Optional later fix: Stage C — only flip `SENT` when the outbound message is seen in that chat (`isFromMe` echo), otherwise honest `FAILED`.

---

## 8. Related code paths

| Area | Path |
|------|------|
| Worker accept + receipt timeout | `apps/api/src/worker/send-scheduled-message.ts` |
| Receipt → SENT | `apps/api/src/wa/wa-manager.ts` `handleMessageReceipt` |
| Receipt helpers | `apps/api/src/lib/waReceipt.ts` |
| Image send | `apps/api/src/wa/wa-send.ts` `sendGroupImage` |
| SOP Starting Soon copy | `packages/db/src/reminderTemplateDefaults.ts` `starting_soon` |

---

## 9. Related vault pages

- Reliability design (Stage B vs C): `raw/sources/2026-07-27-wa-reliability-always-on-plan.md`
- Starting Soon slot: SOP Show Up day 0 11:00 MYT
- Earlier missed Starting Soon (different cause — Render OOM): `raw/sources/2026-07-16-do-migration-oom-incident-session.md`
