---
title: "Multi-project architecture"
type: "concept"
updated: "2026-04-13"
sources: 1
tags: ["architecture", "nmcas", "project-scoping"]
---

# Multi-project architecture

## Definition

In NMCAS, a **Project** is the top-level entity that scopes all resources. Every scheduled message, WA group list, job queue entry, and notification recipient belongs to exactly one project. A project maps 1:1 to a single WhatsApp account (phone number).

This exists because the organisation runs multiple communities across multiple WA accounts and needed a single app to manage all of them.

## What each project owns

| Resource | Per-project? |
|----------|-------------|
| WhatsApp account / session | Yes — one Baileys socket per project |
| Group list | Yes — fetched live from that account |
| ScheduledMessages | Yes — scoped by `projectId` FK |
| NotifyRecipients | Yes — who to alert on failure |
| Baileys session files | Yes — namespaced folder in Supabase Storage |

## UI pattern

A **project switcher** dropdown sits at the top-left of the sidebar. It shows all projects with a coloured WA connection status indicator. Switching projects reloads dashboard, groups, and settings for that project's context.

## Data isolation

No cross-project data sharing in V1. A message belongs to one project. A group belongs to the account of one project. Notification recipients are per-project.

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`

## See also

- [[wiki/concepts/wa-connection-pool]]
- [[wiki/entities/project]]
- [[wiki/overview]]
