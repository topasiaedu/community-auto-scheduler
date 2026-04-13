---
title: "Entity: Project"
type: "entity"
updated: "2026-04-13"
sources: 1
tags: ["entity", "nmcas", "data-model"]
---

# Entity: Project

## Definition

A **Project** represents one organisational context in NMCAS — typically one team managing one (or more) WhatsApp communities. A project is linked to exactly one WhatsApp phone number/account.

## Schema (Prisma)

```prisma
model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  createdAt   DateTime @default(now())

  messages         ScheduledMessage[]
  notifyRecipients NotifyRecipient[]
}
```

## Responsibilities

- Owns all `ScheduledMessage` rows (via `projectId` FK)
- Owns all `NotifyRecipient` rows (via `projectId` FK)
- Maps to one Baileys socket instance in the connection pool
- Maps to one session folder in Supabase Storage (`sessions/{id}/`)
- Maps to one live group list (fetched from the connected WA account)

## UI representation

Each project appears in the project switcher dropdown with its name and a WA connection status dot (green = connected, red = disconnected). The currently selected project scopes all visible data in the app.

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`

## See also

- [[wiki/concepts/multi-project-architecture]]
- [[wiki/entities/scheduled-message]]
- [[wiki/concepts/wa-connection-pool]]
