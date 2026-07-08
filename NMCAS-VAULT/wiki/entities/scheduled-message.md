---
title: "Entity: ScheduledMessage"
type: "entity"
updated: "2026-07-07"
sources: 3
tags: ["entity", "nmcas", "data-model"]
---

# Entity: ScheduledMessage

## Definition

A **ScheduledMessage** is a unit of work: one message destined for one WhatsApp group (or community Announcements channel) at one specific datetime. It belongs to a Project.

**Operator model (planned):** Value post vs Reminder — see [[wiki/concepts/value-vs-reminder-messages]]. Current schema still uses `POST` / `POLL` only.

## Schema (Prisma)

```prisma
enum MessageType {
  POST
  POLL
}

enum MessageStatus {
  PENDING
  SENDING
  SENT
  FAILED
  DRAFT
  CANCELLED
}

model ScheduledMessage {
  id              String        @id @default(cuid())
  projectId       String
  project         Project       @relation(fields: [projectId], references: [id])

  groupJid        String        // WA group JID e.g. 1234567890@g.us
  groupName       String        // Snapshot of display name at scheduling time

  type            MessageType

  // POST fields
  copyText        String?
  imageUrl        String?       // Supabase Storage object path (private bucket)

  // POLL fields
  pollQuestion    String?
  pollOptions     String[]
  pollMultiSelect Boolean       @default(false)

  scheduledAt     DateTime      // stored as UTC
  status          MessageStatus @default(PENDING)
  sentAt          DateTime?
  error           String?
  pgBossJobId     String?       // ID of the active pg-boss job for this row

  createdByUserId String?       // Supabase auth.uid at scheduling time
  createdAt       DateTime      @default(now())
}
```

## Field notes

- `groupJid` and `groupName` are snapshotted at scheduling time. History remains readable even if the group is renamed or left later.
- `imageUrl` is a Supabase Storage **object path** (not a public URL). The worker downloads it at send time via `supabase.storage.from(bucket).download(path)`.
- `scheduledAt` is always UTC in the DB. The UI converts to MYT (UTC+8) for display and input.
- `pollOptions` max 12 elements (WhatsApp native poll limit).
- `error` holds the last error message when `status = FAILED`. On timeout it reads: _"WhatsApp send timed out after 120s — the message may already have been delivered. Check the group and use Re-queue if it was not sent."_
- `pgBossJobId` is set when a pg-boss job is created/re-queued. The rescue sweep uses this to check job liveness before re-enqueueing.

## Status lifecycle

```
          ┌── Edit ──────────────────────────────────────────────────┐
          │                                                           ↓
DRAFT ────┤── Publish ──► PENDING ──► SENDING ──► SENT              
          │                   │           │
          └── Discard ──►     │           └──► FAILED ──► Re-queue ──┐
                              │                                       │
                         CANCELLED                               PENDING
```

| Status | Meaning |
|---|---|
| `DRAFT` | Partially composed, not yet scheduled. No pg-boss job. |
| `PENDING` | Scheduled; pg-boss job exists and will fire at `scheduledAt`. |
| `SENDING` | Worker picked up job, CAS succeeded, WA send in progress. |
| `SENT` | WA ACK received; `sentAt` populated. Terminal. |
| `FAILED` | Send failed or timed out. `error` field describes reason. Re-queueable. |
| `CANCELLED` | User cancelled before send. Terminal. |

## Status transition rules (API-enforced)

| Transition | Route |
|---|---|
| DRAFT → PENDING | `PATCH /messages/:id` with `publish: true` |
| PENDING → DRAFT | `POST /messages/:id/draft` |
| PENDING/DRAFT → CANCELLED | `POST /messages/:id/cancel` |
| PENDING/SENDING/FAILED → PENDING | `POST /messages/:id/requeue` |
| PENDING → SENDING | Worker CAS (`updateMany WHERE status='PENDING'`) |
| SENDING → SENT | Worker (`updateMany WHERE status='SENDING'`) |
| PENDING/SENDING → FAILED | Worker on error/timeout |

## Re-queue behaviour

`POST /messages/:id/requeue`:
- Allowed for `PENDING`, `SENDING` (if `scheduledAt < now - 5min`), and `FAILED`.
- **SENDING < 5 min old → 409:** Worker may still be mid-send; forcing a requeue would duplicate the message.
- **FAILED re-queue:** UI requires confirmation — "Only re-queue if the message was NOT sent to the group." The 120s timeout FAILED status means the message _may_ have been delivered.

## Rescue sweep interaction

The background rescue sweep (`rescue-sweep.ts`) auto-re-enqueues rows without needing user action:
- PENDING rows overdue by >10s with no live pg-boss job.
- SENDING rows overdue by >10min with no live pg-boss job (worker crash recovery).

## Planned extensions (build in progress — not in schema yet)

| Need | Direction |
|------|-----------|
| Value vs Reminder | `operatorKind` + `valueFormat` / `reminderMediaKind` (keep legacy `POST`/`POLL` during migration) |
| Value sub-format | `image_caption` \| `poll` \| `text_only` |
| Reminder sticker | `stickerUrl` (static WebP); `stickerMessage` + `messageSecret` |
| Reminder SOP image | `imageUrl`; `copyText` optional (caption allowed on images only) |
| Reminder text | `copyText` only (e.g. LIVE NOW join link); no media. `reminderMediaKind` needs a `TEXT` value (or `reminderFormat` enum: `IMAGE`\|`STICKER`\|`TEXT`) |
| Per-project templates | `ReminderTemplate` model — named SOP slots (Welcome, 2d, 1d, …) |
| Event datetime chips | Schedule UI helper: see [[wiki/concepts/campaign-message-schedule]] |

### Event-relative chips (from SOP reference)

Two anchors on the Schedule screen: **webinar date** + **event start time** (MYT). Slot clock times are **fixed** (intern does not edit them).

| Chip | `scheduledAt` |
|------|----------------|
| Welcome | webinarDate − 4d @ 15:00 |
| 2-Day Countdown | webinarDate − 2d @ 15:00 |
| 1-Day Countdown | webinarDate − 1d @ 20:00 |
| Starting Soon | webinarDate @ 11:00 |
| LIVE NOW | eventStart − 2 min |
| Post-Live Sticker | eventStart + 18 min |
| Value Post | chosen day @ 11:00 |

Full two-track schedule (Show Up + Value Post): see [[wiki/concepts/campaign-message-schedule]].

## See also

- [[wiki/concepts/campaign-message-schedule]]
- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]
- [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]]
- [[wiki/entities/project]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/concepts/wa-connection-pool]]
- [[wiki/sources/2026-04-21-stability-hardening-session]]
