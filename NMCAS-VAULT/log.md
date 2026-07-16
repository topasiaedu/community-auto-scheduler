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

## [2026-04-21] ingest | Stability hardening session (duplicate sends, rescue sweep, race fixes)

- Raw: `raw/sources/2026-04-21-stability-hardening-session.md`
- Wiki: [[wiki/sources/2026-04-21-stability-hardening-session]], [[wiki/concepts/pg-boss-scheduler]], [[wiki/concepts/wa-connection-pool]], [[wiki/entities/scheduled-message]], [[wiki/overview]], [[index]]
- Notes: Root-caused and fixed three production incidents: (1) duplicate sends caused by timeout resetting to PENDING with Baileys already having transmitted — fixed by timeout→FAILED for connected socket; (2) 440 connectionReplaced loop caused by forceRestart() in timeout path — removed; (3) manual PENDING DB edits not picked up — fixed by rescue sweep (2-min interval). New: rescue sweep, POST /messages/:id/requeue, Re-queue UI button with FAILED confirmation dialog, SENDING requeue 409 race guard, Baileys silent logger in prod, parse-failure logging. Confirmed Render free tier + UptimeRobot viable; Supabase free tier adequate with keepalive fixes. DRAFT and CANCELLED statuses documented in entity page. pgBossJobId field documented.

## [2026-07-06] ingest | whatsmeow deploy, Value vs Reminder product + UX session

- Raw: `raw/sources/2026-07-06-whatsmeow-deploy-product-ux-session.md`
- Wiki: [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/concepts/wa-connection-pool]], [[wiki/entities/scheduled-message]], [[wiki/overview]], [[index]]
- Notes: Captured production deploy (Render API + Vercel web + Supabase pooler), whatsmeow-node migration with WhatsAppSessionBlob sessions, QR/community picker UI fixes. Product: Value post (fresh copy; poll nested) vs Reminder (all SOP templates including countdown graphics and stickers; no caption default). Multi-project, not single-campaign. Intern UX plan for Schedule flow (P7). Sticker send and schema/UI changes explicitly **not implemented** at session end. Owner: no git push without explicit ask. **SOP PNG/PDF referenced but not saved until 2026-07-07** — see ingest below.

## [2026-07-07] ingest | WhatsApp Community SOP assets (Dr Jasmine Show Up)

- Raw: `raw/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference.md`
- Assets: `raw/assets/2026-07-06-dr-jasmine-show-up-whatsapp-community-sop.png`, `raw/assets/2026-07-06-dr-jasmine-show-up-whatsapp-community-sop.pdf`
- Wiki: [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]], [[wiki/concepts/campaign-message-schedule]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/entities/scheduled-message]], [[wiki/overview]], [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]], [[index]]
- Notes: Saved SOP screencapture + PDF to `raw/assets/`. NOTE: first pass fabricated timings from an unreliable image-only PDF read — corrected same day (see next entry).

## [2026-07-07] ingest | SOP timeline screenshots (authoritative schedule)

- Raw: `raw/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference.md` (rewritten)
- Assets: `raw/assets/2026-07-06-dr-jasmine-sop-quick-reference-timeline.png`, `raw/assets/2026-07-06-dr-jasmine-sop-full-posting-schedule.png`
- Wiki: [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]], [[wiki/concepts/campaign-message-schedule]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/entities/scheduled-message]]
- Notes: Transcribed real schedule from Quick Reference Timeline + Full Posting Schedule screenshots. **Two tracks**: Show Up (Reminder) 6 msgs — Welcome (−4d 3PM), 2-Day (−2d 3PM), 1-Day (−1d 8PM), Starting Soon (day0 11AM), LIVE NOW (day0 7:58PM≈start−2m), Sticker (day0 8:18PM≈start+18m); Value Post (Value) 3 msgs — −3d/−1d/+1d @ 11AM. Webinar ≈8PM. **Corrected fabricated "10AM/1h-before/2h-after"**. Chips need two anchors: webinar date + event start time. Clock times are editable defaults.

## [2026-07-07] query | P7 implementation plan filed

- Wiki: [[wiki/analysis/p7-implementation-plan]], [[index]]
- Notes: Consolidated build plan with HTML SOP extract: Custom Values (8 fields), Reminder bodyTemplate merge, campaign wizard, 7 build phases. LIVE NOW=text; Show Up image slots=image+caption; sticker +18m; alternate-day Value suggestions.

## [2026-07-08] query | P7 UX spec filed + wiki lint

- Wiki: [[wiki/analysis/p7-ux-spec]], [[wiki/analysis/p7-implementation-plan]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/concepts/campaign-message-schedule]], [[wiki/entities/scheduled-message]], [[wiki/entities/project]], [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]], [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]], [[index]]
- Notes: Agent-ready supplement: 5-step campaign wizard, single-message mode, Settings template library, API JSON contracts, fan-out resolver, placeholder syntax, acceptance matrix, v1 out-of-scope. Reconciled contradictions (LIVE NOW=text, image Reminder captions required, fixed clock times, template library in v1, wizard vs one-page). Render + Vercel MCP noted for Phase 7 smoke tests.

## [2026-07-08] lint | P7 Phase 7 integration test + production smoke

- Wiki: [[wiki/analysis/p7-ux-spec]] (§11 acceptance matrix, §12 edge cases, §14 deploy)
- Findings:
  - **Unit tests (local):** PASS — `@nmcas/api` campaignSchedule (6), `@nmcas/web` campaignSchedule (12), `@nmcas/db` mergeTemplate (6); `@nmcas/api` + `@nmcas/web` typecheck clean.
  - **§11 matrix rows 1–9 (slot times):** PASS locally via `campaignSchedule.test.ts` (MYT times match spec); **MANUAL/PENDING production** — P7 code not deployed.
  - **§11 overall (12 rows, merge, campaign group):** MANUAL/PENDING — requires `POST /campaigns/schedule` E2E on test project after deploy.
  - **§12 animated WebP:** PASS code — `uploads.ts` + `isAnimatedWebP()` returns 400 `"Animated stickers are not supported. Export a static WebP."`; no unit test file yet.
  - **§12 template snapshot:** PASS code — `campaigns.ts` snapshots `copyText` / `imageUrl` / `stickerUrl` onto `ScheduledMessage` at schedule time.
  - **§12 legacy POST/POLL worker:** PASS code — `send-scheduled-message.ts` `sendLegacyMessage()` when `operatorKind === null`.
  - **§12 FAILED re-queue:** PASS code — `POST /messages/:id/requeue` + `QueueCard` confirmation UI.
  - **§14 deploy smoke:** API `GET /health` 200 `{ ok: true }`; `GET /ready` `{ database: true, pgBoss: true }`. `GET /templates` → **404** (pre-P7 API on Render). Vercel production `READY` but latest deploy commit `9b1d29b` (docs only; local P7 waves uncommitted). `/schedule` + `/queue` return SPA shell 200; P7 wizard not in deployed bundle. Render MCP **unauthorized** (could not `list_deploys`).
- Fixes made: none (no test/typecheck failures).
- Manual steps: commit + push P7; run migration `20260708170000_p7_phase1_campaign_schema` on Render; redeploy API + web; re-auth Render MCP; campaign E2E on test project (2 Announcements communities); spot-check animated WebP upload + FAILED re-queue.

## [2026-07-08] ingest | P7 campaign scheduler ship session

- Raw: `raw/sources/2026-07-08-p7-campaign-scheduler-ship-session.md`
- Wiki: [[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]], [[wiki/overview]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/concepts/campaign-message-schedule]], [[index]]
- Notes: Session wrap — pushed `8f7d1c1`. Campaign wizard = 4-step Show Up only; Value via Single message; SOP captions in `reminderTemplateDefaults`; sticker optional; Vite `envDir` + template-load flash fixes documented. Live E2E after Render/Vercel still open. Note: `p7-ux-spec` still describes older 5-step Value-in-campaign flow — prefer ship raw until UX spec revised.

## [2026-07-10] ingest | P8 implementation briefs (agent prompts)

- Raw: `raw/sources/2026-07-10-p8a-late-campaign-partial-schedule.md`, `raw/sources/2026-07-10-p8b-value-fan-out-active-communities.md`
- Wiki: [[index]] only (wiki source pages deferred until post-implementation)
- Notes: Operator-reported pain — campaign blocked when Welcome past; Value posts require per-community repeat. P8-A: auto-skip past reminder slots + explicit `skipSlotKeys` (Welcome checkbox), no schema. P8-B: `Project.activeCommunityJids`, Settings checkboxes, `POST /messages` Value `fanOut: true`. Each raw file includes copy-paste agent prompt sized for ~200k context. Duplicate community UX explicitly out of scope.

## [2026-07-16] ingest | DO migration after Render OOM incident

- Raw: `raw/sources/2026-07-16-do-migration-oom-incident-session.md`
- Wiki: [[wiki/sources/2026-07-16-do-migration-oom-incident-session]], [[wiki/overview]], [[wiki/concepts/wa-connection-pool]], [[wiki/concepts/campaign-message-schedule]], [[index]]
- Notes: Missed Starting Soon (Jul 12–13) from Render 512MB OOM loop; cancelled catch-up jobs; local laptop failover; RAM opts `16b811a`; API migrated to shared DO Droplet (`nmcas-server.nmmedia.app`, PM2 port 3002, nginx, swap); Vercel `VITE_API_URL` updated; Render suspended. Memory spike ~700MB on WA connect (not media). Added `countdown_1h` slot. **Supersedes** 2026-04-21 Render-free adequacy for API. Open: commit countdown_1h/mem-log if not on main; monitor DO over next campaign week.
