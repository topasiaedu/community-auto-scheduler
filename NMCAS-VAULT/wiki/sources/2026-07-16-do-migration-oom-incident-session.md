---
title: "DO migration after Render OOM incident (2026-07-16)"
type: "source-summary"
updated: "2026-07-16"
sources: 1
tags: ["nmcas", "deploy", "digitalocean", "oom", "render", "operations", "post-mortem"]
---

# DO migration after Render OOM incident (2026-07-16)

**Raw:** `raw/sources/2026-07-16-do-migration-oom-incident-session.md`

## Summary

Production missed two Starting Soon reminder blasts because the **Render free-tier API (512 MB)** OOM-killed during whatsmeow connect/hydrate spikes. After cancelling overdue rows to prevent catch-up duplicates, the operator ran the API **locally** for manual sends, then migrated the API to a **shared DigitalOcean Droplet** (`nmcas-server.nmmedia.app`) with **PM2**, **nginx**, and **swap**, while **Vercel web** and **Supabase** stayed unchanged. Render was suspended.

## Root cause

| Factor | Detail |
|--------|--------|
| Render limit | 512 MB hard cap, no swap |
| Steady RSS | ~175–265 MB with WA warm — within limit |
| **Connect spike** | **~700 MB** Node RSS (heap ~23 MB) — Go + session hydrate |
| Failure mode | OOM → restart loop → jobs stuck `SENDING` |

Media upload size was **not** the primary driver. The **8.4 MB `WhatsAppSessionBlob`** and whatsmeow Go process dominate spikes.

## Key decisions

1. **Do not catch-up send missed slots** — cancelled stuck `SENDING` rows + pg-boss jobs before recovery.
2. **Local laptop as temporary scheduler** — valid failover; requires machine awake.
3. **Migrate API to DO, not upgrade Render Standard ($25)** — operator reused existing 512 MB Droplet + **2 GB swap** instead of new spend.
4. **Shared Droplet OK** — NMCAS on port **3002**; other app (`ltfpdf`) on **3001**; nginx only for NMCAS domain.
5. **HTTPS domain required** — `VITE_API_URL=https://nmcas-server.nmmedia.app`; raw IP blocked by mixed content from Vercel.
6. **Never dual-run Render + DO API** — same pg-boss queue → duplicate sends.
7. **Supersede prior Render-free adequacy claim** — whatsmeow-node post-2026-07 needs more than 512 MB or swap (see [[wiki/sources/2026-04-21-stability-hardening-session]]).

## Production topology (after 2026-07-16)

| Component | Host |
|-----------|------|
| API | DO — `https://nmcas-server.nmmedia.app` (PM2, port 3002, nginx TLS) |
| Web | Vercel — `community-auto-scheduler-web.vercel.app` |
| DB / Auth / Storage | Supabase (unchanged) |
| Render API | **Suspended** |

## Code / ops changes in repo

| Item | Status |
|------|--------|
| RAM optimizations (`16b811a`) | Pushed — heap cap, idle eviction, persist throttle |
| `mem-sample.ts` + JSONL log | Local/session — may need deploy to DO |
| `countdown_1h` slot | Implemented locally during incident; verify on `main` |

## Incident timeline (abbreviated)

- **2026-07-12–13:** Missed Starting Soon sends; Render OOM loop observed.
- **2026-07-13:** Cancel overdue jobs; local API; manual Starting Soon + schedule `countdown_1h`.
- **2026-07-13:** Commit RAM optimizations; suspend Render for local hosting.
- **2026-07-16:** Deploy to DO; nginx + domain; Vercel `VITE_API_URL` updated; production smoke OK.

## See also

- [[wiki/overview]] — updated production table
- [[wiki/concepts/wa-connection-pool]] — memory + hosting notes
- [[wiki/concepts/campaign-message-schedule]] — `countdown_1h` slot
- [[wiki/concepts/pg-boss-scheduler]] — catch-up / rescue behaviour
- [[wiki/sources/2026-04-21-stability-hardening-session]] — prior Render-free claim (superseded for API)
- [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]] — prior Render deploy reference
