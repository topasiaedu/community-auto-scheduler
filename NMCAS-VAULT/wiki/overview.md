---
title: "NMCAS vault overview"
type: "overview"
updated: "2026-07-07"
sources: 7
tags: ["nmcas", "meta"]
---

# NMCAS — community-auto-scheduler

## What this project is

**NMCAS** is an internal web application that lets team members compose, schedule, and auto-send WhatsApp messages to community groups — eliminating the need to be online and manually copy-paste at the moment of posting.

The organisation runs multiple projects, each with its own WhatsApp account and communities. NMCAS supports all of them from a single hosted app, using a **Project** as the top-level organisational unit.

## Target users

Any team member including interns. UI must be learnable without documentation.

## Message types

### Shipped in code (2026-07)

- **Post** (`POST`) — text body + optional image
- **Poll** (`POLL`) — question + 2-12 options, native WA poll

### Operator model (decided 2026-07-06, not yet in code)

See [[wiki/concepts/value-vs-reminder-messages]]:

- **Value post** — fresh copy each campaign: image+caption (default), poll nested under Value, or text-only
- **Reminder** — SOP playbook assets: stickers (no caption), countdown/welcome graphics, etc.

## Production (2026-07)

| Component | Host |
|-----------|------|
| API | Render — `community-auto-scheduler.onrender.com` (Docker) |
| Web | Vercel — `community-auto-scheduler-web.vercel.app` |
| DB / Auth / post images | Supabase |

## Core architecture in brief

| Layer | Key choice | Reason |
|-------|-----------|--------|
| WhatsApp | **whatsmeow-node** (migrated from Baileys, 2026-07) | Communities + `messageSecret`; Meta Cloud API cannot manage communities |
| Sessions | Local SQLite + **`WhatsAppSessionBlob`** in Postgres | Survives Render deploys; pooler-friendly `DATABASE_URL` |
| Post images | Supabase Storage private bucket | Worker downloads at send time |
| Queue | pg-boss on Supabase Postgres | No Redis; one infra for DB + queue |
| Hosting | Render (API) + Vercel (FE) + Supabase | Three services, minimal cost |
| Timezone | MYT UTC+8, hardcoded V1 | All communities are Malaysia-based |

## V1 scope

See [[wiki/sources/2026-04-13-nmcas-prd-v1]] for full requirements. Out of scope for V1: recurring messages, templates, multi-timezone, video, individual recipients. **Identity:** the app uses **Supabase Auth** + per-project membership (`ProjectMember`); the PRD's older "single env-var password" note is superseded for the shipped app (see [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]]).

## Phased build plan

| Phase | Scope |
|-------|-------|
| P0 | Baileys + Supabase Storage spike — **complete** (see [[wiki/sources/2026-04-16-p0-spike-completion]]) |
| P1 | Monorepo scaffold, Prisma, pg-boss, Fastify skeleton — **complete** |
| P2 | Post type end-to-end; WA link path stable — **complete** (see [[wiki/sources/2026-04-17-wa-p2-api-stability]]) |
| P3 | Poll type — **complete** (`POST /messages` with `type: "POLL"`, worker `sendPollToWhatsApp`) |
| P4 | Multi-project (connection pool, project switcher) — **complete** (see [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]]) |
| P5 | Failure notifications, live status, mobile responsive — **partial** (failure DM to one MSISDN; Re-queue button + FAILED confirmation dialog 2026-04-21; HTTP polling; UI overhaul deferred) |
| P6 | Hardening, deployment, env config — **substantially complete** (rescue sweep, duplicate-send fix, race guards, 2026-04-21; Docker + Vercel + Render live 2026-07; see [[wiki/sources/2026-04-21-stability-hardening-session]], [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]]) |
| P7 | Value / Reminder + campaign scheduler — **planned** ([[wiki/analysis/p7-implementation-plan]]) |

## Key wiki pages

- [[wiki/concepts/campaign-message-schedule]]
- [[wiki/concepts/value-vs-reminder-messages]]
- [[wiki/concepts/multi-project-architecture]]
- [[wiki/concepts/wa-connection-pool]]
- [[wiki/concepts/pg-boss-scheduler]]
- [[wiki/entities/project]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-04-13-nmcas-prd-v1]]
- [[wiki/sources/2026-04-16-p0-spike-completion]]
- [[wiki/sources/2026-04-17-wa-p2-api-stability]]
- [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]]
- [[wiki/sources/2026-04-21-stability-hardening-session]]
- [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]]
- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]]
