---
title: "NMCAS vault overview"
type: "overview"
updated: "2026-07-16"
sources: 9
tags: ["nmcas", "meta"]
---

# NMCAS — community-auto-scheduler

## What this project is

**NMCAS** is an internal web application that lets team members compose, schedule, and auto-send WhatsApp messages to community groups — eliminating the need to be online and manually copy-paste at the moment of posting.

The organisation runs multiple projects, each with its own WhatsApp account and communities. NMCAS supports all of them from a single hosted app, using a **Project** as the top-level organisational unit.

## Target users

Any team member including interns. UI must be learnable without documentation.

## Message types

### Operator model (shipped P7, 2026-07-08)

See [[wiki/concepts/value-vs-reminder-messages]], [[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]]:

- **Value post** — fresh copy; schedule via **Single message** (image+caption / poll / text); fans out to all community Announcements channels
- **Reminder** — SOP Show Up playbook; **Campaign** wizard schedules one community’s reminder sequence; IMAGE slots use long SOP captions; LIVE NOW = TEXT; post-live sticker optional until WebP uploaded
- Legacy **Post** / **Poll** rows still send via worker fallback

### Earlier DB enums

- `MessageType` `POST` | `POLL` kept for legacy / backfill

## Production (2026-07)

| Component | Host |
|-----------|------|
| API | **DigitalOcean** — `https://nmcas-server.nmmedia.app` (PM2, shared 512 MB Droplet + swap; port 3002 behind nginx) — see [[wiki/sources/2026-07-16-do-migration-oom-incident-session]] |
| Web | Vercel — `community-auto-scheduler-web.vercel.app` |
| DB / Auth / post images | Supabase |
| Render API (retired) | `community-auto-scheduler.onrender.com` — **suspended** after DO cutover (2026-07-16) |

## Core architecture in brief

| Layer | Key choice | Reason |
|-------|-----------|--------|
| WhatsApp | **whatsmeow-node** (migrated from Baileys, 2026-07) | Communities + `messageSecret`; Meta Cloud API cannot manage communities |
| Sessions | Local SQLite + **`WhatsAppSessionBlob`** in Postgres | Survives Render deploys; pooler-friendly `DATABASE_URL` |
| Post images | Supabase Storage private bucket | Worker downloads at send time |
| Queue | pg-boss on Supabase Postgres | No Redis; one infra for DB + queue |
| Hosting | DO (API) + Vercel (FE) + Supabase | API moved off Render after OOM incident (2026-07-16); see [[wiki/sources/2026-07-16-do-migration-oom-incident-session]] |
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
| P7 | Value / Reminder + campaign scheduler — **shipped on main** `8f7d1c1` (2026-07-08); live E2E pending deploy/migration ([[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]], [[wiki/analysis/p7-implementation-plan]], [[wiki/analysis/p7-ux-spec]]) |

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
- [[wiki/sources/2026-07-16-do-migration-oom-incident-session]]
