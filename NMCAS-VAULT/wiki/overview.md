---
title: "NMCAS vault overview"
type: "overview"
updated: "2026-04-13"
sources: 2
tags: ["nmcas", "meta"]
---

# NMCAS — community-auto-scheduler

## What this project is

**NMCAS** is an internal web application that lets team members compose, schedule, and auto-send WhatsApp messages to community groups — eliminating the need to be online and manually copy-paste at the moment of posting.

The organisation runs multiple projects, each with its own WhatsApp account and communities. NMCAS supports all of them from a single hosted app, using a **Project** as the top-level organisational unit.

## Target users

Any team member including interns. UI must be learnable without documentation.

## Message types (V1)

- **Post** — text body + optional image, sent to a WA group
- **Poll** — question + 2–12 options (single or multi-select), sent as a native WA poll

## Core architecture in brief

| Layer | Key choice | Reason |
|-------|-----------|--------|
| WhatsApp | Baileys (unofficial personal WA) | No Business API required |
| Sessions | Supabase Storage, custom auth adapter | Survives Render redeploys without Persistent Disk |
| Queue | pg-boss on Supabase Postgres | No Redis; one infra for DB + queue |
| Hosting | Render (API) + Vercel (FE) + Supabase | Three services, minimal cost |
| Timezone | MYT UTC+8, hardcoded V1 | All communities are Malaysia-based |

## V1 scope

See [[wiki/sources/2026-04-13-nmcas-prd-v1]] for full requirements. Out of scope for V1: recurring messages, templates, multi-timezone, video, individual recipients, full user auth.

## Phased build plan

| Phase | Scope |
|-------|-------|
| P0 | Baileys + Supabase Storage spike |
| P1 | Monorepo scaffold, Prisma, pg-boss, Fastify skeleton |
| P2 | Post type end-to-end (compose → send) |
| P3 | Poll type |
| P4 | Multi-project (connection pool, project switcher) |
| P5 | Failure notifications, live status, mobile responsive |
| P6 | Hardening, deployment, env config |

## Key wiki pages

- [[wiki/concepts/multi-project-architecture]]
- [[wiki/concepts/wa-connection-pool]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/entities/project]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-04-13-nmcas-prd-v1]]
