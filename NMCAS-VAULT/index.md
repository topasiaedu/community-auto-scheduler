# NMCAS-VAULT — Wiki index

Catalog of all wiki pages. Updated after every ingest, filed query, or lint pass.

---

## Overview

- [[wiki/overview]] — NMCAS purpose, architecture summary, phased build plan, and scope.

---

## Source summaries

- [[wiki/sources/2026-04-13-bootstrap-llm-wiki-pattern]] — Bootstrap note: the LLM Wiki pattern (layers, workflows, compounding).
- [[wiki/sources/2026-04-13-nmcas-prd-v1]] — NMCAS V1 PRD digest: full requirements, stack, data model, phased plan.
- [[wiki/sources/2026-04-16-p0-spike-completion]] — P0 spike done: Storage session layout, `p0-spike/` runbook, bucket vs table, troubleshooting.
- [[wiki/sources/2026-04-17-wa-p2-api-stability]] — P2 WA API: poll-safe `start()`, Storage `keys.set` pairing latency, cred flush, reconnect tuning.
- [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]] — Repo snapshot: auth, P4 pool, partial P5/P6, deploy (Docker/Vercel), deferred UI.
- [[wiki/sources/2026-04-21-stability-hardening-session]] — Stability hardening: duplicate-send root cause, rescue sweep, timeout→FAILED fix, requeue route, race guards, Baileys silent logger.
- [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]] — whatsmeow migration, Render/Vercel production, Value vs Reminder model, intern UX plan (P7, not implemented).
- [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]] — Saved SOP assets; six message slots with exact triggers; corrects welcome + timing paraphrase.
- [[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]] — P7 shipped to main (`8f7d1c1`); 4-step Show Up wizard; SOP captions; optional sticker; live E2E pending.
- [[wiki/sources/2026-07-16-do-migration-oom-incident-session]] — Render OOM missed sends; local failover; DO API migration (`nmcas-server.nmmedia.app`); memory findings; `countdown_1h` slot.
- `raw/sources/2026-07-10-p8a-late-campaign-partial-schedule.md` — P8-A agent brief: skip past / explicit Welcome skip for Show Up campaigns.
- `raw/sources/2026-07-10-p8b-value-fan-out-active-communities.md` — P8-B agent brief: Value fan-out from Single message + active communities in Settings.

---

## Concepts

- [[wiki/concepts/campaign-message-schedule]] — SOP slot triggers (Show Up + Value Post); fixed MYT clocks; two anchors.
- [[wiki/concepts/compounding-knowledge-base]] — LLM Wiki as persistent compiled layer; ingest / query / lint.
- [[wiki/concepts/value-vs-reminder-messages]] — Operator model: Value post (fresh copy, poll nested) vs Reminder (SOP assets, stickers, countdowns).
- [[wiki/concepts/multi-project-architecture]] — Project as top-level entity; how resources are scoped per project.
- [[wiki/concepts/wa-connection-pool]] — whatsmeow-node pool; SQLite + WhatsAppSessionBlob; timeout/reconnect; DO hosting + memory notes (Render superseded).
- [[wiki/concepts/pg-boss-scheduler]] — pg-boss Postgres-backed job queue; rescue sweep; requeue route; race protection table.

---

## Entities

- [[wiki/entities/project]] — Project data model: owns sessions, messages, notify recipients, and WA connection.
- [[wiki/entities/scheduled-message]] — ScheduledMessage data model: POST and POLL types (legacy); planned Value/Reminder; full status lifecycle.

---

## Meta

- [[wiki/analysis/p7-implementation-plan]] — P7 build plan: schema, API, worker, phases 1–7.
- [[wiki/analysis/p7-ux-spec]] — P7 agent-ready UX + API: wizard, validation, contracts, acceptance matrix.
- `CLAUDE.md` — Schema and agent rules (see vault root).

---

*Last indexed: 2026-07-16 — DO migration + OOM incident session ingested.*
