# NMCAS-VAULT â Changelog log

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
- Notes: Root-caused and fixed three production incidents: (1) duplicate sends caused by timeout resetting to PENDING with Baileys already having transmitted â fixed by timeoutâFAILED for connected socket; (2) 440 connectionReplaced loop caused by forceRestart() in timeout path â removed; (3) manual PENDING DB edits not picked up â fixed by rescue sweep (2-min interval). New: rescue sweep, POST /messages/:id/requeue, Re-queue UI button with FAILED confirmation dialog, SENDING requeue 409 race guard, Baileys silent logger in prod, parse-failure logging. Confirmed Render free tier + UptimeRobot viable; Supabase free tier adequate with keepalive fixes. DRAFT and CANCELLED statuses documented in entity page. pgBossJobId field documented.

## [2026-07-06] ingest | whatsmeow deploy, Value vs Reminder product + UX session

- Raw: `raw/sources/2026-07-06-whatsmeow-deploy-product-ux-session.md`
- Wiki: [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/concepts/wa-connection-pool]], [[wiki/entities/scheduled-message]], [[wiki/overview]], [[index]]
- Notes: Captured production deploy (Render API + Vercel web + Supabase pooler), whatsmeow-node migration with WhatsAppSessionBlob sessions, QR/community picker UI fixes. Product: Value post (fresh copy; poll nested) vs Reminder (all SOP templates including countdown graphics and stickers; no caption default). Multi-project, not single-campaign. Intern UX plan for Schedule flow (P7). Sticker send and schema/UI changes explicitly **not implemented** at session end. Owner: no git push without explicit ask. **SOP PNG/PDF referenced but not saved until 2026-07-07** â see ingest below.

## [2026-07-07] ingest | WhatsApp Community SOP assets (Dr Jasmine Show Up)

- Raw: `raw/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference.md`
- Assets: `raw/assets/2026-07-06-dr-jasmine-show-up-whatsapp-community-sop.png`, `raw/assets/2026-07-06-dr-jasmine-show-up-whatsapp-community-sop.pdf`
- Wiki: [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]], [[wiki/concepts/campaign-message-schedule]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/entities/scheduled-message]], [[wiki/overview]], [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]], [[index]]
- Notes: Saved SOP screencapture + PDF to `raw/assets/`. NOTE: first pass fabricated timings from an unreliable image-only PDF read â corrected same day (see next entry).

## [2026-07-07] ingest | SOP timeline screenshots (authoritative schedule)

- Raw: `raw/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference.md` (rewritten)
- Assets: `raw/assets/2026-07-06-dr-jasmine-sop-quick-reference-timeline.png`, `raw/assets/2026-07-06-dr-jasmine-sop-full-posting-schedule.png`
- Wiki: [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]], [[wiki/concepts/campaign-message-schedule]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/entities/scheduled-message]]
- Notes: Transcribed real schedule from Quick Reference Timeline + Full Posting Schedule screenshots. **Two tracks**: Show Up (Reminder) 6 msgs â Welcome (â4d 3PM), 2-Day (â2d 3PM), 1-Day (â1d 8PM), Starting Soon (day0 11AM), LIVE NOW (day0 7:58PMâstartâ2m), Sticker (day0 8:18PMâstart+18m); Value Post (Value) 3 msgs â â3d/â1d/+1d @ 11AM. Webinar â8PM. **Corrected fabricated "10AM/1h-before/2h-after"**. Chips need two anchors: webinar date + event start time. Clock times are editable defaults.

## [2026-07-07] query | P7 implementation plan filed

- Wiki: [[wiki/analysis/p7-implementation-plan]], [[index]]
- Notes: Consolidated build plan with HTML SOP extract: Custom Values (8 fields), Reminder bodyTemplate merge, campaign wizard, 7 build phases. LIVE NOW=text; Show Up image slots=image+caption; sticker +18m; alternate-day Value suggestions.

## [2026-07-08] query | P7 UX spec filed + wiki lint

- Wiki: [[wiki/analysis/p7-ux-spec]], [[wiki/analysis/p7-implementation-plan]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/concepts/campaign-message-schedule]], [[wiki/entities/scheduled-message]], [[wiki/entities/project]], [[wiki/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference]], [[wiki/sources/2026-07-06-whatsmeow-deploy-product-ux-session]], [[index]]
- Notes: Agent-ready supplement: 5-step campaign wizard, single-message mode, Settings template library, API JSON contracts, fan-out resolver, placeholder syntax, acceptance matrix, v1 out-of-scope. Reconciled contradictions (LIVE NOW=text, image Reminder captions required, fixed clock times, template library in v1, wizard vs one-page). Render + Vercel MCP noted for Phase 7 smoke tests.

## [2026-07-08] lint | P7 Phase 7 integration test + production smoke

- Wiki: [[wiki/analysis/p7-ux-spec]] (Â§11 acceptance matrix, Â§12 edge cases, Â§14 deploy)
- Findings:
  - **Unit tests (local):** PASS â `@nmcas/api` campaignSchedule (6), `@nmcas/web` campaignSchedule (12), `@nmcas/db` mergeTemplate (6); `@nmcas/api` + `@nmcas/web` typecheck clean.
  - **Â§11 matrix rows 1â9 (slot times):** PASS locally via `campaignSchedule.test.ts` (MYT times match spec); **MANUAL/PENDING production** â P7 code not deployed.
  - **Â§11 overall (12 rows, merge, campaign group):** MANUAL/PENDING â requires `POST /campaigns/schedule` E2E on test project after deploy.
  - **Â§12 animated WebP:** PASS code â `uploads.ts` + `isAnimatedWebP()` returns 400 `"Animated stickers are not supported. Export a static WebP."`; no unit test file yet.
  - **Â§12 template snapshot:** PASS code â `campaigns.ts` snapshots `copyText` / `imageUrl` / `stickerUrl` onto `ScheduledMessage` at schedule time.
  - **Â§12 legacy POST/POLL worker:** PASS code â `send-scheduled-message.ts` `sendLegacyMessage()` when `operatorKind === null`.
  - **Â§12 FAILED re-queue:** PASS code â `POST /messages/:id/requeue` + `QueueCard` confirmation UI.
  - **Â§14 deploy smoke:** API `GET /health` 200 `{ ok: true }`; `GET /ready` `{ database: true, pgBoss: true }`. `GET /templates` â **404** (pre-P7 API on Render). Vercel production `READY` but latest deploy commit `9b1d29b` (docs only; local P7 waves uncommitted). `/schedule` + `/queue` return SPA shell 200; P7 wizard not in deployed bundle. Render MCP **unauthorized** (could not `list_deploys`).
- Fixes made: none (no test/typecheck failures).
- Manual steps: commit + push P7; run migration `20260708170000_p7_phase1_campaign_schema` on Render; redeploy API + web; re-auth Render MCP; campaign E2E on test project (2 Announcements communities); spot-check animated WebP upload + FAILED re-queue.

## [2026-07-08] ingest | P7 campaign scheduler ship session

- Raw: `raw/sources/2026-07-08-p7-campaign-scheduler-ship-session.md`
- Wiki: [[wiki/sources/2026-07-08-p7-campaign-scheduler-ship-session]], [[wiki/overview]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/concepts/campaign-message-schedule]], [[index]]
- Notes: Session wrap â pushed `8f7d1c1`. Campaign wizard = 4-step Show Up only; Value via Single message; SOP captions in `reminderTemplateDefaults`; sticker optional; Vite `envDir` + template-load flash fixes documented. Live E2E after Render/Vercel still open. Note: `p7-ux-spec` still describes older 5-step Value-in-campaign flow â prefer ship raw until UX spec revised.

## [2026-07-10] ingest | P8 implementation briefs (agent prompts)

- Raw: `raw/sources/2026-07-10-p8a-late-campaign-partial-schedule.md`, `raw/sources/2026-07-10-p8b-value-fan-out-active-communities.md`
- Wiki: [[index]] only (wiki source pages deferred until post-implementation)
- Notes: Operator-reported pain â campaign blocked when Welcome past; Value posts require per-community repeat. P8-A: auto-skip past reminder slots + explicit `skipSlotKeys` (Welcome checkbox), no schema. P8-B: `Project.activeCommunityJids`, Settings checkboxes, `POST /messages` Value `fanOut: true`. Each raw file includes copy-paste agent prompt sized for ~200k context. Duplicate community UX explicitly out of scope.

## [2026-07-16] ingest | DO migration after Render OOM incident

- Raw: `raw/sources/2026-07-16-do-migration-oom-incident-session.md`
- Wiki: [[wiki/sources/2026-07-16-do-migration-oom-incident-session]], [[wiki/overview]], [[wiki/concepts/wa-connection-pool]], [[wiki/concepts/campaign-message-schedule]], [[index]]
- Notes: Missed Starting Soon (Jul 12â13) from Render 512MB OOM loop; cancelled catch-up jobs; local laptop failover; RAM opts `16b811a`; API migrated to shared DO Droplet (`nmcas-server.nmmedia.app`, PM2 port 3002, nginx, swap); Vercel `VITE_API_URL` updated; Render suspended. Memory spike ~700MB on WA connect (not media). Added `countdown_1h` slot. **Supersedes** 2026-04-21 Render-free adequacy for API. Open: commit countdown_1h/mem-log if not on main; monitor DO over next campaign week.

## [2026-07-18] ingest | Media egress cache + compress plan and agent prompts

- Raw: `raw/sources/2026-07-18-media-egress-cache-compress-plan.md`, `raw/sources/2026-07-18-media-egress-agent-prompts.md`
- Wiki: [[wiki/sources/2026-07-18-media-egress-cache-compress-plan]], [[wiki/sources/2026-07-18-media-egress-agent-prompts]], [[index]]
- Notes: Workshop 5.0 scheduled send failed on Supabase `exceed_egress_quota` (fan-out re-downloads same image). Plan: JPEG compress on upload + process-local download cache with coalesce and RAM caps. Two sequential agent prompts (compress then cache) sized for ~200k context. Ops still must lift Storage restriction for current sends.

## [2026-07-27] ingest | WA reliability always-on plan and agent prompts

- Raw: `raw/sources/2026-07-27-wa-reliability-always-on-plan.md`, `raw/sources/2026-07-27-wa-reliability-agent-prompts.md`
- Wiki: [[wiki/sources/2026-07-27-wa-reliability-always-on-plan]], [[wiki/sources/2026-07-27-wa-reliability-agent-prompts]], [[wiki/concepts/wa-connection-pool]], [[wiki/entities/scheduled-message]], [[index]]
- Notes: Root causes â browser-triggered WA boot + idle eviction; SENT = IPC OK not receipt; groups RAM-only; fan-out stays per-row. Locked: always-on + supervised reconnect; receipt-gated SENT via `waMessageId`; periodic group refresh; engagement tracker deferred (Agent 4). Three sequential implement prompts (~200k) + deferred fourth. UI polish explicitly non-goal for this pass.

## [2026-08-26] ingest | Vercel private-repo Actions cutover

- Raw: `raw/sources/2026-08-26-vercel-private-repo-actions-cutover.md`
- Wiki: [[wiki/sources/2026-08-26-vercel-private-repo-actions-cutover]], [[wiki/concepts/vercel-github-actions-deploy]], [[wiki/overview]], [[index]]
- Notes: Native Vercel Git blocked personal commit authors (e.g. KWen-22); cut over web to Actions + company token; `git.deploymentEnabled: false`. Phases 0-5 done (Phase 5 via personal-account PR #1). Phase 6 lock-down and Phase 7 handover deferred by owner.

## [2026-08-27] ingest | WA QR pairing failure on DO 512 MB

- Raw: `raw/sources/2026-08-27-wa-qr-pairing-do512-incident-session.md`
- Wiki: [[wiki/sources/2026-08-27-wa-qr-pairing-do512-incident-session]], [[wiki/concepts/wa-qr-pairing-low-ram]], [[wiki/concepts/wa-connection-pool]], [[wiki/overview]], [[index]]
- Notes: Production QR never shown (`/wa/qr` 204); diagnostic loop `awaiting_scan` → `qr:timeout`; root cause Go spawned before RAM freed on shared 512 MB Droplet. Fixes: `openFreshQrPairing()`, capped auto-repair, `POST /wa/pair-code`, groups timeouts (commits `ca712be`–`460fc9c`). Operator: `WA_MAX_WARM_CLIENTS=1`, phone pairing fallback. Extends Jul 2026 DO OOM post-mortem; contradicts safe always-on + max-warm-4 on small hosts for **pairing**.

## [2026-08-27] ingest | WA QR missing: whatsmeow client outdated

- Raw: `raw/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade.md`
- Wiki: [[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]], [[wiki/concepts/wa-qr-pairing-low-ram]], [[wiki/concepts/wa-connection-pool]], [[wiki/overview]], [[index]]
- Notes: Same UI as morning RAM pairing (`awaiting_scan`, `/wa/qr` 204) but RSS ~122 MB and one warm client. PM2 `err-client-outdated`; no `qr event` on whatsmeow-node 0.6.0. Hotfix 0.7.0 + PM2 restart; verified `codeLen=277`. Repo: skip status kick after max QR repairs; fail fast on outdated. Contradicts treating every missing QR as low RAM.

## [2026-08-27] ingest | Queue draft Resume + Value imageUrl path

- Raw: `raw/sources/2026-08-27-queue-draft-resume-imageurl-session.md`
- Wiki: [[wiki/sources/2026-08-27-queue-draft-resume-imageurl-session]], [[wiki/entities/scheduled-message]], [[wiki/concepts/value-vs-reminder-messages]], [[wiki/overview]], [[index]]
- Notes: Resume stayed on Queue (no navigate / single mode); then Schedule fan-out POSTed drafts and hit `posts/{projectId}/` check. Fixes `205569d` (navigate) and `9f71e25` (PATCH draft, no fan-out while editing). New Value fan-out still needs path under active project.

## [2026-09-09] query | Starting Soon marked SENT but not in community
- Question: RDW 6.0 Starting Soon 8 Sep 2026 11:00 MYT shows Sent successful, but the community did not receive it. Investigate without sending.
- Answer filed: not filed
- Notes: Campaign row `cmtl2qhgq00cwe7o76apvbflk` is SENT with waMessageId `3EB08C5AE0DFF1EBED3008`; IPC accept 11:00:49 MYT, server receipt +568ms. Same JID as rest of Show Up campaign (`120363408928450031@g.us`, label "RDW 6.0 › RDW 6.0"). Manual retry at 13:00 MYT (`cmts79afk00l2e7o7drpez4d3`) also SENT. UI SENT = WhatsApp server receipt, not member-visible delivery ([[wiki/sources/2026-07-27-wa-reliability-always-on-plan]] D2; Stage C echo not implemented). No messages were sent during this check.

## [2026-09-09] query | Why Starting Soon missed while LIVE NOW / sticker / Value landed
- Question: LIVE NOW, sticker, and Value posts appeared; 1:05 PM Starting Soon was a phone send. Why did 11:00 Starting Soon not show?
- Answer filed: not filed
- Notes: Not a skipped job or wrong group. 11:00 NMCAS send got a server ack; same `04-starting-soon.jpeg` had SENT successfully on earlier RDW campaigns (5.0/4.0/2.0). Caption length ruled out (Value posts ~1900 chars landed in RDW 6.0). NMCAS 13:00 retry also marked SENT at 13:00:07; visible post was the operator phone send at 13:05. Likely WhatsApp dropped that one image stanza after ack; NMCAS cannot tell because Sent does not wait for an echo in the group.

## [2026-09-09] ingest | Starting Soon false SENT — RDW 6.0
- Raw: `raw/sources/2026-09-09-starting-soon-false-sent-rdw6.md`
- Wiki: [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]], [[wiki/entities/scheduled-message]], [[wiki/concepts/campaign-message-schedule]], [[wiki/concepts/pg-boss-scheduler]], [[wiki/sources/2026-07-27-wa-reliability-always-on-plan]], [[wiki/overview]], [[index]]
- Notes: 8 Sep 11:00 Starting Soon job ran and got a server receipt; Announcements empty. LIVE NOW / sticker / Value visible. Phone post at 13:05. Stage B implemented; Stage C not. Distinct from Jul 2026 OOM miss.

## [2026-09-09] query | RDW 4.0 Value no-receipt FAILED + add notify contact
- Question: Failure DM for Reversing Diabetes Workshop 4.0 at 9 Sep 2026 11:00 MYT (`3EB0546133EC6E9CEC1F3D`); check if the community got it; add +6017-678-2206 for this alert type.
- Answer filed: not filed
- Notes: Value fan-out image `Jasmine_Post__13_.png`. RDW 4.0 IPC accepted 11:00:49 then no receipt (Go process crash) → FAILED. Operator may have seen it in-group (false FAILED). Same run: base/3.0/5.0/6.0 SENT; RDW 2.0 FAILED with no waMessageId. Do not Re-queue 4.0 if already visible. Code: `DEFAULT_NOTIFY_MSISDNS` now includes `60176782206`.

## [2026-09-09] query | Vercel Production build failed
- Question: Production web build failed after the notify-contact push.
- Answer filed: not filed
- Notes: GitHub Action `34339582618` failed at `vercel build --prod`: `Installing dependencies with pnpm 10` then `spawn pnpm ENOENT`. Cause: `pnpm-lock.yaml` added in `bebc92c` (same failure 2026-08-27); repo is npm (`package-lock.json`, `vercel.json` `installCommand: npm ci`). Actions runner has no pnpm. Fix: remove `pnpm-lock.yaml`. API on DO was already restarted; this is web-only.

## [2026-09-09] ingest | RDW 4.0 Value no-receipt, notify contact, Vercel pnpm
- Raw: `raw/sources/2026-09-09-rdw4-value-no-receipt-notify-vercel.md`
- Wiki: [[wiki/sources/2026-09-09-rdw4-value-no-receipt-notify-vercel]], [[wiki/entities/scheduled-message]], [[wiki/entities/project]], [[wiki/concepts/pg-boss-scheduler]], [[wiki/concepts/vercel-github-actions-deploy]], [[wiki/overview]], [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]], [[index]]
- Notes: 9 Sep 11:00 Value fan-out; RDW 4.0 IPC accept then Go crash → FAILED; RDW 2.0 no id. Defaults `60139968817` + `60176782206` (`246ffff`). Web CI `pnpm-lock.yaml` ENOENT since `bebc92c`; fixed `270bdeb`.

## [2026-10-08] query | Telegram status vs WhatsApp group arrival
- Question: Can NMCAS tell that a scheduled post really arrived in each community group, then send that status to a Telegram group?
- Answer filed: [[wiki/analysis/telegram-post-status-delivery-tracking]]
- Notes: Telegram `sendMessage` is fine. Today’s `SENT` is any `message:receipt` and already false-greened RDW 6.0. whatsmeow `ReceiptTypeSender` and an `isFromMe` echo are the candidates for “in the chat”; all-member double ticks are the wrong on-time gate. Log `type` + `chat` on a test community before building the bot.

## [2026-10-08] query | Primary sources for group arrival
- Question: Can whatsmeow reliably detect that a group or Community Announcements send became visible?
- Answer filed: [[wiki/analysis/telegram-post-status-delivery-tracking]]
- Notes: Partial. `SendMessage` return is server ack only. Typed group receipts (`""`, `inactive`, `sender`, `read`) are per device. No source defines “visible in the chat,” and none documents a drop-after-ack. Announcements are `@g.us` (`IsAnnounce && IsDefaultSubGroup`), not newsletters. Telegram `sendMessage` to `chat_id` returns the sent Message.

## [2026-10-08] query | Telegram post-status implementation plan
- Question: What blocks the Telegram post-status feature, and what is the implementation plan?
- Answer filed: [[wiki/analysis/telegram-post-status-implementation-plan]]
- Notes: “Arrived in every community” is blocked. Buildable scope is one Telegram checklist per fan-out batch using stored receipt type and chat. Queue Sent stays unchanged. Phases 0–4; no code in this session.

## [2026-10-09] query | Post-update plan switched to WhatsApp DM
- Question: Replace the Telegram implementation plan with a WhatsApp notification to the two ops numbers whenever a scheduled post finishes, success or failure, using the approved message.
- Answer filed: [[wiki/analysis/telegram-post-status-implementation-plan]]
- Notes: Telegram arrival plan withdrawn. One DM per batch to `60139968817` and `60176782206`. Sent/Failed match Queue. This update replaces the immediate failure DM. Daily digest unchanged. No code in this session.

## [2026-10-09] query | Failure alert replaced by post update
- Question: Replace the existing WhatsApp failure alert with one notification each time a scheduled post is posted.
- Answer filed: [[wiki/analysis/telegram-post-status-implementation-plan]]
- Notes: Owner confirmed. One DM per finished post to the two ops numbers, Sent or Failed. Immediate `[NMCAS] Failed to send…` DM goes away. Daily digest stays.

## [2026-10-09] query | Implement WhatsApp post-update notification
- Question: Implement the approved post-update plan.
- Answer filed: [[wiki/analysis/telegram-post-status-implementation-plan]]
- Notes: Code in API. One DM per `fanOutBatchId` after the batch settles. Immediate failure DM removed. Formatter tests pass. Live send to the two phones not run. Migration `20261009120000_post_status_notice` not applied from this session.
