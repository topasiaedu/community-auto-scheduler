---
title: "Source digest: P0 spike completion"
type: "source-summary"
updated: "2026-04-16"
sources: 1
tags: ["nmcas", "p0", "baileys", "supabase", "storage", "spike"]
---

# Source digest: `2026-04-16-p0-spike-completion.md`

**Raw path:** `raw/sources/2026-04-16-p0-spike-completion.md`

## One-line summary

P0 is complete: Baileys session state is persisted under `sessions/{projectId}/` in a **Supabase Storage bucket** (not DB tables); repo spike lives in `p0-spike/` with runbook and troubleshooting notes.

## Key claims (from source)

- **Bucket vs table:** Session JSON objects use **Storage** (object paths); relational app data continues to use **Postgres tables** in later phases.
- **Deliverables:** `useSupabaseMultiFileAuthState` equivalent, `spike.ts` runner, env validation, `.env.example`, `p0-spike/README.md`.
- **P0 gate:** QR login → objects in bucket → second run without QR; optional group test message via `NMCAS_TEST_GROUP_JID`.
- **Service role:** Acceptable for local spike only; production must avoid exposing service role to clients and should tighten Storage policies.
- **Troubleshooting:** Intermittent Baileys `init queries` / `bad-request` may be transient WA or partial state — retry, then clear Storage prefix and re-auth if needed.

## Wiki integration

- [[wiki/overview]] — build progress; P0 marked done
- [[wiki/concepts/wa-connection-pool]] — pointer to implemented spike path
- [[wiki/sources/2026-04-13-nmcas-prd-v1]] — open question on P0 validation closed

## Open questions (carried or new)

- Render Starter plan choice for always-on scheduling precision (unchanged from PRD digest).
