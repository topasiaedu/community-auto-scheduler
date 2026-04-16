---
title: "Source digest: NMCAS implementation snapshot (2026-04-18)"
type: "source-summary"
updated: "2026-04-18"
sources: 1
tags: ["nmcas", "implementation", "auth", "p4", "p5", "p6", "deploy"]
---

# Source digest: `2026-04-18-nmcas-implementation-snapshot.md`

**Raw path:** `raw/sources/2026-04-18-nmcas-implementation-snapshot.md`

## One-line summary

The monorepo now includes **Supabase Auth + `ProjectMember` + per-project WA pool**, **create/list projects**, **worker failure WhatsApp to one MSISDN**, **Docker + Vercel deploy docs**, and **partial P5/P6**; full **P5 UI/SSE/responsive** and **RLS** are out of scope for this snapshot.

## Key claims (from source)

- **P4:** `WaConnectionPool`, `WaManager(env, projectId)`, `X-Project-Id`, `GET`/`POST /projects`, web sign-in and project switcher.
- **P5:** Failure path notifies `NMCAS_FAILURE_NOTIFY_MSISDN` (default `60139968817`); polling only for live updates; no `NotifyRecipient` management UI.
- **P6:** `Dockerfile` + `DEPLOY.md` + `vercel.json`; Render via **Docker** (no Blueprint); free tier sleep vs PRD **Starter** called out.
- **Auth:** JWT pre-handler, optional auto-join default project.

## Wiki integration

- [[wiki/overview]] — phased plan status
- [[wiki/concepts/wa-connection-pool]] — pool implemented in API
- [[wiki/sources/2026-04-13-nmcas-prd-v1]] — hosting table still recommends Starter for API reliability

## Open questions

- Upgrade Render to **Starter** (or equivalent) when scheduling reliability matters more than free tier.
- Future **P5 UI** overhaul (dashboard/settings/responsive) when owner schedules it.
