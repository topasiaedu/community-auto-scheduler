---
title: "Entity: ScheduledMessage"
type: "entity"
updated: "2026-04-13"
sources: 1
tags: ["entity", "nmcas", "data-model"]
---

# Entity: ScheduledMessage

## Definition

A **ScheduledMessage** is a unit of work: one message (Post or Poll) destined for one WhatsApp group at one specific datetime. It belongs to a Project.

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
  imageUrl        String?       // Supabase Storage URL

  // POLL fields
  pollQuestion    String?
  pollOptions     String[]
  pollMultiSelect Boolean       @default(false)

  scheduledAt     DateTime      // stored as UTC
  status          MessageStatus @default(PENDING)
  sentAt          DateTime?
  error           String?

  createdAt       DateTime      @default(now())
}
```

## Field notes

- `groupJid` and `groupName` are snapshotted at scheduling time. History remains readable even if the group is renamed or left later.
- `imageUrl` points to a Supabase Storage URL. The Baileys worker downloads from this URL at send time.
- `scheduledAt` is always UTC in the DB. The UI displays it converted to MYT (UTC+8).
- `pollOptions` max 12 elements (WhatsApp native poll limit).
- `error` holds the last error message when `status = FAILED`.

## Status lifecycle

```
PENDING → SENDING → SENT
                 ↘ FAILED
```

## See also

- [[wiki/entities/project]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/concepts/wa-connection-pool]]
