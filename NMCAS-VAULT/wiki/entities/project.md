---
title: "Entity: Project"
type: "entity"
updated: "2026-07-08"
sources: 2
tags: ["entity", "nmcas", "data-model"]
---

# Entity: Project

## Definition

A **Project** represents one organisational context in NMCAS — typically one team managing one WhatsApp account and multiple communities. A project is linked to exactly one WhatsApp phone number/account.

## Schema (Prisma — current + P7 extensions)

```prisma
model Project {
  id               String   @id @default(cuid())
  name             String
  description      String?
  sopUrl           String?   // P7 — external SOP link for interns
  campaignNote     String?   // P7 — internal ops note
  createdAt        DateTime @default(now())

  messages         ScheduledMessage[]
  notifyRecipients NotifyRecipient[]
  members          ProjectMember[]
  userPreferences  UserProjectPreference[]
  reminderTemplates ReminderTemplate[]  // P7 — 6 seeded slots
  campaigns        Campaign[]            // P7
}
```

## Responsibilities

- Owns all `ScheduledMessage` rows (via `projectId` FK)
- Owns `ReminderTemplate` library (6 SOP slots, seeded on create)
- Owns `Campaign` records (webinar date, custom values, reminder destination)
- Maps to one whatsmeow socket in the connection pool
- Maps to one `WhatsAppSessionBlob` in Postgres (session survives Render deploys)
- Maps to one live group list (fetched from the connected WA account)

## UI representation

- Project switcher in header (name only in default label)
- Settings: `sopUrl`, `campaignNote`, Reminder template library
- Switching projects changes WA session, queue, and templates

## API

- `GET /projects` — list all (org-wide access)
- `PATCH /projects/:id` — `{ sopUrl?, campaignNote? }`

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`
- P7 extensions: [[wiki/analysis/p7-implementation-plan]], [[wiki/analysis/p7-ux-spec]]

## See also

- [[wiki/concepts/multi-project-architecture]]
- [[wiki/entities/scheduled-message]]
- [[wiki/concepts/wa-connection-pool]]
