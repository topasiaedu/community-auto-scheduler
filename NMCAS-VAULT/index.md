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

---

## Concepts

- [[wiki/concepts/compounding-knowledge-base]] — LLM Wiki as persistent compiled layer; ingest / query / lint.
- [[wiki/concepts/multi-project-architecture]] — Project as top-level entity; how resources are scoped per project.
- [[wiki/concepts/wa-connection-pool]] — Baileys multi-instance pool; session persistence via Supabase Storage.
- [[wiki/concepts/pg-boss-scheduler]] — pg-boss Postgres-backed job queue; why it replaces BullMQ + Redis here.

---

## Entities

- [[wiki/entities/project]] — Project data model: owns sessions, messages, notify recipients, and WA connection.
- [[wiki/entities/scheduled-message]] — ScheduledMessage data model: POST and POLL types, status lifecycle, field notes.

---

## Meta

- `CLAUDE.md` — Schema and agent rules (see vault root).

---

*Last indexed: 2026-04-18 — implementation snapshot ingest.*
