# NMCAS-VAULT — Changelog log

Append-only timeline of ingests, filed queries, and lint passes. Newest entries at the bottom.

---

## [2026-04-13] ingest | Bootstrap LLM Wiki pattern note

- Raw: `raw/sources/2026-04-13-bootstrap-llm-wiki-pattern.md`
- Wiki: [[wiki/sources/2026-04-13-bootstrap-llm-wiki-pattern]], [[wiki/concepts/compounding-knowledge-base]], [[wiki/overview]]
- Notes: Initial vault structure, `CLAUDE.md` schema, `index.md` / `log.md`, folder conventions. NMCAS product scope left TBD pending owner discussion.

## [2026-04-13] ingest | NMCAS PRD V1

- Raw: `raw/sources/2026-04-13-nmcas-prd-v1.md`
- Wiki: [[wiki/sources/2026-04-13-nmcas-prd-v1]], [[wiki/overview]], [[wiki/concepts/multi-project-architecture]], [[wiki/concepts/wa-connection-pool]], [[wiki/concepts/pg-boss-scheduler]], [[wiki/entities/project]], [[wiki/entities/scheduled-message]]
- Notes: Full V1 product requirements locked. Multi-project architecture, Baileys + Supabase Storage session pattern, pg-boss queue, Post + Poll message types, MYT hardcoded, Render + Vercel + Supabase hosting confirmed. All decisions finalised with project owner. Ready for P0 spike scaffold.

## [2026-04-16] ingest | P0 spike completion

- Raw: `raw/sources/2026-04-16-p0-spike-completion.md`
- Wiki: [[wiki/sources/2026-04-16-p0-spike-completion]], [[wiki/overview]], [[wiki/concepts/wa-connection-pool]], [[wiki/sources/2026-04-13-nmcas-prd-v1]]
- Notes: Documented completed P0 (`p0-spike/`), Storage bucket vs Postgres table clarification, env vars, success criteria, Baileys init-query troubleshooting. Overview phased plan marks P0 complete; PRD digest open question on P0 validation closed.

## [2026-04-17] ingest | WA P2 API stability (Baileys + Storage)

- Raw: `raw/sources/2026-04-17-wa-p2-api-stability.md`
- Wiki: [[wiki/sources/2026-04-17-wa-p2-api-stability]], [[wiki/overview]], [[wiki/concepts/wa-connection-pool]], [[index]]
- Notes: Captured poll-driven socket teardown (428), sequential `keys.set` pairing regression, fixes (`ensureRunning`, parallel key writes, cred-save flush, reconnect delays, lighter `makeWASocket` options, cached WA version). Indexed digest; overview P2 row and WA pool concept updated for singleton implementation path.

## [2026-04-18] ingest | Implementation snapshot (auth, P4 pool, P5 notify, Docker deploy)

- Raw: `raw/sources/2026-04-18-nmcas-implementation-snapshot.md`
- Wiki: [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]], [[wiki/overview]], [[wiki/concepts/wa-connection-pool]]
- Notes: Documents Supabase Auth + `ProjectMember` + `X-Project-Id`, `WaConnectionPool` / `POST /projects`, worker failure WhatsApp to `NMCAS_FAILURE_NOTIFY_MSISDN`, polling-only live status, Docker + `DEPLOY.md` + `vercel.json` (Render Blueprint removed). PRD still recommends Render Starter for reliable scheduling; free tier + external ping noted as best-effort. P5 UI/SSE/responsive overhaul deferred.
