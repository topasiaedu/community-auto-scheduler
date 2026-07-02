---
title: "NMCAS vault overview"
type: "overview"
updated: "2026-04-21"
sources: 6
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
- **Poll** — question + 2-12 options (single or multi-select), sent as a native WA poll

## Core architecture in brief

| Layer | Key choice | Reason |
|-------|-----------|--------|
| WhatsApp | Baileys (unofficial personal WA) | Meta Cloud API cannot manage communities |
| Sessions | Supabase Storage, custom auth adapter | Survives Render redeploys without Persistent Disk |
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
| P6 | Hardening, deployment, env config — **substantially complete** (rescue sweep, duplicate-send fix, race guards, Baileys silent logger, 2026-04-21; Docker + Vercel stable; see [[wiki/sources/2026-04-21-stability-hardening-session]]) |

## Key wiki pages

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
