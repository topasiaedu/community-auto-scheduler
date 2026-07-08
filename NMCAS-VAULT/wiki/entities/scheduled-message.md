---
title: "Entity: ScheduledMessage"
type: "entity"
updated: "2026-07-08"
sources: 3
tags: ["entity", "nmcas", "data-model"]
---

# Entity: ScheduledMessage

## Definition

A **ScheduledMessage** is a unit of work: one message destined for one WhatsApp group (or community Announcements channel) at one specific datetime. It belongs to a Project.

**Operator model (P7):** Value post vs Reminder — see [[wiki/concepts/value-vs-reminder-messages]]. Schema adds `operatorKind`, `valueFormat`, `reminderFormat`; legacy `POST` / `POLL` retained for backfill.

## Schema (Prisma — current + P7)

```prisma
enum MessageType { POST POLL }           // legacy
enum OperatorKind { VALUE REMINDER }     // P7
enum ValueFormat { IMAGE_CAPTION TEXT_ONLY POLL }
enum ReminderFormat { IMAGE TEXT STICKER }

model ScheduledMessage {
  id                  String        @id @default(cuid())
  projectId           String
  project             Project       @relation(...)

  groupJid            String
  groupName           String

  type                MessageType   // legacy; backfilled from operatorKind
  operatorKind        OperatorKind?
  valueFormat         ValueFormat?
  reminderFormat      ReminderFormat?

  copyText            String?
  imageUrl            String?
  stickerUrl          String?       // P7 — Reminder STICKER snapshot
  pollQuestion        String?
  pollOptions         String[]
  pollMultiSelect     Boolean       @default(false)

  reminderTemplateId  String?       // P7
  campaignId          String?       // P7 — null for single-message rows

  scheduledAt         DateTime      // UTC
  status              MessageStatus @default(PENDING)
  sentAt              DateTime?
  error               String?
  pgBossJobId         String?
  createdByUserId     String?
  createdAt           DateTime      @default(now())
}
```

## Field notes

- `groupJid` / `groupName` snapshotted at schedule time.
- `imageUrl`, `stickerUrl` are Supabase Storage paths; worker downloads at send.
- `copyText` on Reminder rows = **merged snapshot** of `bodyTemplate` + campaign Custom Values at schedule time.
- `scheduledAt` stored UTC; UI displays MYT.
- `campaignId` links rows from one campaign wizard run; used for Queue grouping.

## Status lifecycle

```
DRAFT → PENDING → SENDING → SENT
              ↓         ↓
         CANCELLED   FAILED → re-queue → PENDING
```

See [[wiki/concepts/pg-boss-scheduler]] for rescue sweep and re-queue rules.

## P7 send routing (worker)

| operatorKind | format | Send |
|--------------|--------|------|
| VALUE | POLL | `sendGroupPoll` |
| VALUE | TEXT_ONLY | `sendGroupText` |
| VALUE | IMAGE_CAPTION | `sendGroupImage` |
| REMINDER | TEXT | `sendGroupText` |
| REMINDER | IMAGE | `sendGroupImage` (caption required for SOP image slots) |
| REMINDER | STICKER | `sendGroupSticker` + `messageSecret` |

Legacy: if `operatorKind` null, fall back to `type` POST/POLL.

## Campaign vs single

| Source | campaignId | Typical count |
|--------|------------|---------------|
| Campaign wizard | set | 6 Reminders + (3 + optional) × N communities |
| Single message | null | 1 |

Post-confirm campaign rows are edited only via per-row Queue actions (cancel, re-queue, draft) — no bulk campaign edit in v1.

## Event-relative schedule (fixed clocks)

| Chip | `scheduledAt` |
|------|----------------|
| Welcome | webinarDate − 4d @ 15:00 MYT |
| 2-Day Countdown | webinarDate − 2d @ 15:00 |
| 1-Day Countdown | webinarDate − 1d @ 20:00 |
| Starting Soon | webinarDate @ 11:00 |
| LIVE NOW | eventStart − 2 min |
| Post-Live Sticker | eventStart + 18 min |
| Value 1/2/3 | −3d / −1d / +1d @ 11:00 |

Full spec: [[wiki/concepts/campaign-message-schedule]], [[wiki/analysis/p7-ux-spec]].

## See also

- [[wiki/analysis/p7-implementation-plan]]
- [[wiki/analysis/p7-ux-spec]]
- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/entities/project]]
- [[wiki/concepts/pg-boss-scheduler]]
