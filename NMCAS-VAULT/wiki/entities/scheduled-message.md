---
title: "Entity: ScheduledMessage"
type: "entity"
updated: "2026-09-09"
sources: 6
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

### Receipt-gated SENT (implemented; still not “visible in group”)

As of [[wiki/sources/2026-07-27-wa-reliability-always-on-plan]] **Stage B** (implemented in worker + `WaManager`):

- Persist WhatsApp `SendResponse.id` as **`waMessageId`** (`waAcceptedAt` on IPC accept).
- Do **not** mark `SENT` on send Promise resolve alone; stay `SENDING`.
- Flip to `SENT` on whatsmeow **`message:receipt`** matching that id (`waAckedAt`); if no receipt within timeout → `FAILED` (“No WhatsApp server receipt…”).
- Engagement tracker keys off `waMessageId` ([[wiki/sources/2026-07-27-wa-reliability-agent-prompts]] Agent 4).

**Limitation (2026-09-08):** Stage B is a **server ack**, not proof the community can see the post. `handleMessageReceipt` does not require an outbound echo (`isFromMe`, plan Stage C) and does not check `receipt.chat` against `groupJid`. RDW 6.0 Starting Soon was `SENT` with a 568 ms receipt while Announcements stayed empty; LIVE NOW / Sticker / Value on the same JID **were** visible. See [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]].

**Inverse (2026-09-09):** missing receipt is also not proof of non-delivery. RDW 4.0 Value (`cmtl74ex600gwe7o769yr5qfh`) got IPC accept (`waMessageId` `3EB0546133EC6E9CEC1F3D` at 11:00:49 MYT) then `FAILED` after 90s because the whatsmeow Go process exited before `message:receipt`. Same 11:00 fan-out: RDW / 3.0 / 5.0 / 6.0 `SENT`; RDW 2.0 `FAILED` with no id (`Go process exited with code null`). If the community already shows the post, do **not** Re-queue (duplicate risk).

Value fan-out remains **one row per community** — each destination has its own id/receipt.

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
| Single message | null | 1 (or N if Value fan-out create) |

Post-confirm campaign rows are edited only via per-row Queue actions (cancel, re-queue, draft) — no bulk campaign edit in v1.

### Draft edit / Resume (2026-08-27)

Queue **Edit** on PENDING → `POST /messages/:id/draft` (status `DRAFT`, job cancelled). **Resume** must open Schedule single-message compose and publish with **`PATCH /messages/:id`** (`publish: true`), not a new fan-out `POST /messages`. Fan-out create still requires `imageUrl` under `posts/{projectId}/`. See [[wiki/sources/2026-08-27-queue-draft-resume-imageurl-session]].

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
- [[wiki/sources/2026-08-27-queue-draft-resume-imageurl-session]]
- [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]]
