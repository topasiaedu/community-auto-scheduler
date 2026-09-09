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
- [[wiki/sources/2026-07-18-media-egress-cache-compress-plan]] — Design: Storage egress failure; upload compress + process-local download cache (not yet implemented).
- [[wiki/sources/2026-07-18-media-egress-agent-prompts]] — Agent 1 compress / Agent 2 cache copy-paste prompts (~200k context).
- [[wiki/sources/2026-07-27-wa-reliability-always-on-plan]] — Design: always-on WA, receipt-gated SENT, periodic groups; engagement tracker deferred.
- [[wiki/sources/2026-07-27-wa-reliability-agent-prompts]] — Agents 1–3 reliability prompts + deferred Agent 4 engagement (~200k context).
- [[wiki/sources/2026-08-26-vercel-private-repo-actions-cutover]] — Private repo web deploy cutover: Actions + `VERCEL_TOKEN`; phases 0–5 done; 6–7 deferred.
- [[wiki/sources/2026-08-27-wa-qr-pairing-do512-incident-session]] — QR never shown / timeout loop on DO 512 MB; RAM-first pairing, phone code fallback, groups timeout; `WA_MAX_WARM_CLIENTS=1`.
- [[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]] — Same QR UI on healthy RAM; `err-client-outdated`; whatsmeow-node 0.6.0 → 0.7.0 on DO; `qr event` codeLen=277.
- [[wiki/sources/2026-08-27-queue-draft-resume-imageurl-session]] — Queue Resume no-op + fan-out POST on draft; fixes `205569d` / `9f71e25` (navigate + PATCH).
- [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]] — RDW 6.0 Starting Soon 11:00 SENT in Queue, not visible; LIVE NOW/sticker/Value landed; Stage B server ack ≠ group visible.
- `raw/sources/2026-07-10-p8a-late-campaign-partial-schedule.md` — P8-A agent brief: skip past / explicit Welcome skip for Show Up campaigns.
- `raw/sources/2026-07-10-p8b-value-fan-out-active-communities.md` — P8-B agent brief: Value fan-out from Single message + active communities in Settings.

---

## Concepts

- [[wiki/concepts/campaign-message-schedule]] — SOP slot triggers (Show Up + Value Post); fixed MYT clocks; two anchors.
- [[wiki/concepts/compounding-knowledge-base]] — LLM Wiki as persistent compiled layer; ingest / query / lint.
- [[wiki/concepts/value-vs-reminder-messages]] — Operator model: Value post (fresh copy, poll nested) vs Reminder (SOP assets, stickers, countdowns).
- [[wiki/concepts/multi-project-architecture]] — Project as top-level entity; how resources are scoped per project.
- [[wiki/concepts/wa-connection-pool]] — whatsmeow-node pool; SQLite + WhatsAppSessionBlob; always-on + QR pairing RAM notes (2026-08-27).
- [[wiki/concepts/wa-qr-pairing-low-ram]] — QR / phone pairing on 512 MB DO; RAM-first boot vs client-outdated 405; env tuning.
- [[wiki/concepts/pg-boss-scheduler]] — pg-boss Postgres-backed job queue; rescue sweep; requeue route; race protection table.
- [[wiki/concepts/vercel-github-actions-deploy]] — Private-repo web deploys via Actions + CLI token; native Git disabled.

---

## Entities

- [[wiki/entities/project]] — Project data model: owns sessions, messages, notify recipients, and WA connection.
- [[wiki/entities/scheduled-message]] — ScheduledMessage: Value/Reminder; receipt-gated SENT (server ack); Stage C echo not implemented (RDW 6.0 Starting Soon 2026-09-08).

---

## Meta

- [[wiki/analysis/p7-implementation-plan]] — P7 build plan: schema, API, worker, phases 1–7.
- [[wiki/analysis/p7-ux-spec]] — P7 agent-ready UX + API: wizard, validation, contracts, acceptance matrix.
- `CLAUDE.md` — Schema and agent rules (see vault root).

---

*Last indexed: 2026-09-09 — Starting Soon false SENT (RDW 6.0).*
