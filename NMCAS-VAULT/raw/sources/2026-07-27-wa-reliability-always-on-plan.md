# Raw source: WA reliability — always-on session, true SENT, groups refresh (2026-07-27)

**Type:** Engineering design + product decisions (not yet implemented).  
**Date:** 2026-07-27  
**Trigger:** Operator pain — first load often shows “Cannot reach WhatsApp status” while Diagnostics says API OK; connection unstable mid-schedule; Value blast to communities 1.0–6.0 sometimes shows SENT in NMCAS while one community (e.g. 5.0) has no message in WhatsApp; “Load groups” click feels wrong.

**Repo:** `community-auto-scheduler`  
**Primary paths:**
- `apps/api/src/wa/wa-pool.ts`
- `apps/api/src/wa/wa-manager.ts`
- `apps/api/src/wa/wa-send.ts`
- `apps/api/src/routes/wa.ts`
- `apps/api/src/index.ts`
- `apps/api/src/worker/send-scheduled-message.ts`
- `packages/db/src/index.ts` (Prisma `connection_limit`)
- `packages/db/prisma/schema.prisma` (`ScheduledMessage`)
- `apps/web/src/hooks/useNmcasApp.ts`, `apps/web/src/components/WhatsAppSection.tsx`

**Related:**
- [[wiki/concepts/wa-connection-pool]]
- [[wiki/entities/scheduled-message]]
- [[wiki/concepts/pg-boss-scheduler]]
- `raw/sources/2026-07-16-do-migration-oom-incident-session.md` (DO 512 MB + swap; WA connect spikes)
- `raw/sources/2026-07-10-p8b-value-fan-out-active-communities.md` (fan-out = N independent rows)

**Companion:** Implementation agent prompts → `raw/sources/2026-07-27-wa-reliability-agent-prompts.md`

---

## 1. Problems (root causes, not symptoms)

### 1.1 Frontend boots WhatsApp

API startup creates an empty `WaConnectionPool` and never connects. The **only** warm paths are HTTP (`GET /wa/status`, `/wa/qr`, `/wa/groups`) and the send worker calling `start()`. Closing the dashboard for 10 minutes triggers **idle eviction** (`IDLE_EVICT_MS = 10 * 60_000`). `disconnected` events only flip UI state — **no supervised reconnect**.

Cold boot of `/wa/status` can take ~10–12s (hydrate blob → connect → persist). That holds a request open while Prisma is capped at **`connection_limit=2`**, so `/projects`, `/preferences`, `/messages` fail with `P2024` while `/health` still says OK. The WhatsApp tab then shows “Cannot reach WhatsApp status. Make sure the API server is running.”

### 1.2 SENT means “IPC returned OK,” not “in the group”

Worker `markSent()` runs when `sendRawMessage` / `sendPollCreation` resolves without throw. whatsmeow returns `SendResponse { id, timestamp }` — NMCAS **discards** the id. Library exposes `message:receipt`; NMCAS never listens.

Operator-visible failure mode: Queue shows **SENT**, phone community has **no post**. Randomness tracks flaky sockets and per-destination sends, not a single “blast” flag.

### 1.3 Fan-out is already per-community (keep it)

Value fan-out creates **one `ScheduledMessage` + one pg-boss job per Announcements destination**. “Blast to 1.0–6.0, 5.0 missing” is **one row’s** reliability (or a destination silently omitted at schedule time if groups cache/linking failed) — **not** a shared blast status bug. Product decision: **keep independent rows**.

### 1.4 Groups are RAM-only + click-to-load UX

`WaManager` keeps a **5-minute in-memory** group cache. Nothing in Postgres. UI auto-fetches when connected but still exposes **Load / Reload groups**. whatsmeow emits `group:info` / `group:joined`; we do not subscribe. Meta Cloud API webhooks do **not** apply (unofficial multi-device).

### 1.5 Deferred (design now, implement later)

- Full app UI/UX polish — push off; do not block reliability.
- **Reactions / replies tracker** per sent post — needs `waMessageId` from this work; implement as a later phase (see §6).

---

## 2. Product decisions (locked 2026-07-27)

| # | Decision |
|---|----------|
| D1 | WhatsApp session is **server-owned always-on** for the default/active project(s), not browser-polled into existence. |
| D2 | **SENT** means WhatsApp **server receipt** for our outbound message id (stage B below), not bare Promise resolve. Until receipt, show a distinct intermediate state (e.g. `ACCEPTED` / keep `SENDING` with stored id — implementers pick one clear operator-facing label). |
| D3 | Fan-out stays **independent rows** per community. |
| D4 | Groups: **periodic refresh** while connected; UI should not require click-to-load as the primary path. Event-driven (`group:*`) is optional later. |
| D5 | Engagement tracker is **Phase 4+**; this initiative only **stores message ids** so tracker is not a rewrite later. |
| D6 | Memory: always-on costs ~**80 MB** steady (Node delta + ~29 MB Go subprocess). Scary RSS spikes are send/media, not idle. Prefer always-on; optional env kill-switch for starved hosts only. |

### What “for sure SENT” means (whatsmeow reality)

| Stage | Meaning | Source |
|-------|---------|--------|
| A Accepted | WA took the stanza | `SendResponse.id` from send |
| **B Server-acked (product SENT)** | Confirmed | `message:receipt` for that id |
| C Echoed | Own outbound seen | inbound `message` `isFromMe` (optional hardening) |
| D Member delivery/read | Per-person ticks | **Do not** promise for community Announcements |

Timeouts that already exist (120s → FAILED “may already have been delivered”) stay; they are the opposite failure mode (under-report), not false SENT.

---

## 3. Target architecture

```
API process start
  → create WaConnectionPool
  → start DEFAULT_PROJECT_ID (or all projects with session blobs) in background
  → supervised reconnect on disconnected / Go exit (backoff)
  → no idle eviction when WA_ALWAYS_ON=true (default)

GET /wa/status|/wa/qr
  → pure in-memory snapshot; kick start only if somehow cold
  → must not await 30s connect/persist on the request path

Send path
  → capture SendResponse.id → persist waMessageId (+ optional waChatJid)
  → SENDING until message:receipt matches id → SENT
  → receipt timeout → UNCERTAIN or FAILED with honest error (not green SENT)

Groups
  → while connected: refresh getJoinedGroups on interval (e.g. 2–5 min)
  → invalidate/refresh on demand still allowed
  → web: auto-use catalog; demote “Load groups” to secondary/debug

Future engagement
  → listen message/reaction events filtered by tracked JIDs
  → join on waMessageId / quoted stanza id
```

---

## 4. Implementation phases (maps to agent prompts)

| Phase | Name | Outcome |
|-------|------|---------|
| **1** | Always-on + reconnect + cheap status | Session lives in API; status polls do not starve Prisma; optional `WA_ALWAYS_ON`, raise Prisma pool default |
| **2** | Message id + receipt-gated SENT | Store `waMessageId`; SENT only after receipt; honest timeout path |
| **3** | Periodic group refresh | Server keeps groups warm; web stops treating empty list as “click Load” primary UX |
| **4** | Engagement tracker (deferred) | Reactions/replies tables + allowlisted ingest; Queue counts later |

Do **not** merge Phase 1–3 into one coding agent chat.

---

## 5. Phase details

### 5.1 Always-on connection (Phase 1)

**Files:** `wa-pool.ts`, `wa-manager.ts`, `routes/wa.ts`, `index.ts`, `env.ts`, `packages/db/src/index.ts`

- Boot `DEFAULT_PROJECT_ID` (and/or projects that have `WhatsAppSessionBlob`) after listen, **non-blocking** (do not delay HTTP bind).
- Supervised reconnect: on `disconnected` / non-zero Go `exit`, schedule `ensureRunning` with exponential backoff (cap ~60s); cancel on `shutdown` / `logged_out`.
- Disable idle eviction when always-on; keep a **max warm clients** safety cap (env, default ≥1, suggest 4).
- `/wa/status` and `/wa/qr`: return snapshot immediately; `void start()` if needed.
- Do not await large blob persist on the HTTP status path (fire-and-forget persist after connect is OK).
- Prisma: raise default `connection_limit` from 2 → **5** (still under free pooler + pg-boss); allow `PRISMA_CONNECTION_LIMIT` override.

**Memory kill-switch:** `WA_ALWAYS_ON=false` restores lazy boot + idle eviction for emergency hosts.

**Done when:** Restart API with linked session → within ~30s without opening the web app, `GET /wa/status` (authed) reports connected; kill phone network briefly → reconnect without browser refresh; first page load does not show false “API down” while health OK.

### 5.2 True SENT (Phase 2)

**Files:** Prisma schema + migration, `wa-send.ts`, `wa-manager.ts`, `send-scheduled-message.ts`, light Queue badge if status enum grows

- Add `waMessageId String?` (and optionally `waAcceptedAt`, `waAckedAt`) on `ScheduledMessage`.
- Send helpers return `SendResponse` (or `{ id }`) instead of `void`; worker persists id while still `SENDING` / new `ACCEPTED`.
- `attachClientEvents`: on `message:receipt`, match `ids[]` → `updateMany` to `SENT` where `waMessageId` matches and status is pre-SENT.
- If send Promise resolves but no receipt within N seconds (suggest 60–120s, configurable): mark **FAILED** or **UNCERTAIN** with clear error — **never** green SENT. Prefer a status operators understand; if avoiding new enum, use `FAILED` + error text `"No WhatsApp server receipt for message id …"`.
- Fan-out unchanged: each community row has its own id/receipt.

**Done when:** Unit/integration tests for receipt matcher; manual: send to test group, confirm SENT only after receipt; disconnect mid-send produces honest non-SENT.

### 5.3 Groups periodic refresh (Phase 3)

**Files:** `wa-manager.ts`, optionally `wa-pool.ts`, web WhatsApp / schedule hooks

- While `uiState === connected`, interval refresh `fetchGroupOptions(true)` (or uncached path) every **3–5 minutes**; touch activity so pool does not fight always-on.
- On connect success, refresh once immediately.
- Web: when WA connected, groups should populate without requiring “Load groups”; keep a quieter “Refresh groups” for operators.
- Out of scope for Phase 3: persisting full group catalog to Postgres; `group:*` event wiring (nice follow-up).

**Done when:** Linked session + API up → Schedule destination picker has groups without visiting WhatsApp tab and clicking Load.

### 5.4 Engagement tracker (Phase 4 — deferred prompt only)

**Overhead (planning):** ~0–5 MB RAM on top of always-on; DB tiny at 6 communities; engineering medium. Filter inbound events by allowlisted community JIDs.

- Tables e.g. `MessageReaction`, `MessageReply` → `scheduledMessageId`
- Ingest from whatsmeow `message` / reaction decrypt paths matching `waMessageId` or quoted id
- API counts first; rich UI later
- **No backfill** of historical posts; disconnect gaps miss events

Do not start Phase 4 until Phases 1–2 are stable in production.

---

## 6. Explicit non-goals (this initiative)

- Meta Cloud API / HTTP webhooks from WhatsApp Business
- “All members delivered” / blue ticks for community Announcements
- Collapsing fan-out into one DB row
- Full UI redesign / Queue layout overhaul
- Building engagement dashboards before message ids land
- Raising DO Droplet size (optional ops follow-up if spikes still OOM)

---

## 7. Acceptance (end-to-end)

1. API restart → WA reconnects without browser.
2. Open app first time → WhatsApp shows Connecting/Connected, not false “API not running,” while `/health` OK.
3. Schedule mid-session → brief WA flap recovers without forcing full re-link QR (unless logged out).
4. Value fan-out to N communities → each row SENT only with receipt; missing community shows FAILED/UNCERTAIN, not silent green.
5. Groups available for compose without primary Load click.
6. Schema has `waMessageId` ready for Phase 4 tracker.

---

## 8. Open questions (non-blocking)

- Exact operator label for pre-receipt state (`ACCEPTED` vs keep `SENDING`).
- Boot all projects with blobs vs only `DEFAULT_PROJECT_ID` (single-tenant today → default project is enough).
- Whether Phase 2 adds a Prisma enum value or reuses `FAILED` + error string.

---

*End of plan. Implement via sequential agents in `2026-07-27-wa-reliability-agent-prompts.md`.*
