---
title: "NMCAS vault overview"
type: "overview"
updated: "2026-04-18"
sources: 5
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

See [[wiki/sources/2026-04-13-nmcas-prd-v1]] for full requirements. Out of scope for V1: recurring messages, templates, multi-timezone, video, individual recipients. **Identity:** the app uses **Supabase Auth** + per-project membership (`ProjectMember`); the PRD’s older “single env-var password” note is superseded for the shipped app (see [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]]).

## Phased build plan

| Phase | Scope |
|-------|-------|
| P0 | Baileys + Supabase Storage spike — **complete** (see [[wiki/sources/2026-04-16-p0-spike-completion]], raw: `raw/sources/2026-04-16-p0-spike-completion.md`) |
| P1 | Monorepo scaffold, Prisma, pg-boss, Fastify skeleton |
| P2 | Post type end-to-end (compose → send); **WA link path stable in API** — see [[wiki/sources/2026-04-17-wa-p2-api-stability]] (raw: `raw/sources/2026-04-17-wa-p2-api-stability.md`) |
| P3 | Poll type — **implemented** (`POST /messages` with `type: "POLL"`, worker `sendPollToWhatsApp`, web Post/Poll toggle) |
| P4 | Multi-project (connection pool, project switcher) — **implemented** in repo (see [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]]) |
| P5 | Failure notifications, live status, mobile responsive — **partial** (failure DM to one MSISDN; polling; UI overhaul deferred) |
| P6 | Hardening, deployment, env config — **partial** (Docker + Vercel docs; full hardening TBD) |

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
