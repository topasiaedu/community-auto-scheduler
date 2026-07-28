# Raw source: Agent prompts — WA reliability (always-on, true SENT, groups) (2026-07-27)

**Type:** Copy-paste implementation briefs for coding agents (~200k context models).  
**Date:** 2026-07-27  
**Plan (read first):** `NMCAS-VAULT/raw/sources/2026-07-27-wa-reliability-always-on-plan.md`  
**Repo root:** `community-auto-scheduler`

## How to use

1. Run agents **in order: 1 → 2 → 3**. Agent **4** is deferred until 1–2 are stable in prod.
2. Paste the entire prompt block for that agent into a **fresh** chat (do not reuse a chat that already filled context with unrelated work).
3. Each prompt is self-contained but assumes the agent can read the repo and the plan file.
4. **Do not** commit, push, or merge unless the human says so.
5. **Do not** run `npm start` / long production builds — operator likely already has `npm run dev` running. Prefer `npm run typecheck` and targeted `npm test -w @nmcas/api`.
6. If prior agent left uncommitted media-egress files (`compressPostImage`, `mediaDownloadCache`, etc.), **leave them alone** unless they conflict; do not revert unrelated work.

### Sizing rationale

| Agent | Scope | Why this size |
|-------|--------|----------------|
| 1 | Always-on pool, reconnect, cheap `/wa/status`, Prisma pool | One subsystem (connection lifecycle); ~6 files; leaves room for log-driven fixes |
| 2 | `waMessageId` + receipt-gated SENT | Schema + worker + event matching; depends on stable connection from Agent 1 |
| 3 | Periodic group refresh + light web UX | Smaller; needs Agent 1 so refresh has a live client |
| 4 | Engagement tracker (deferred) | Separate product; needs Agent 2 ids; would bloat any earlier chat |

Together 1–3 would fit a 200k window in one mega-chat, but sequential chats keep retries/debugging from blowing the budget.

---

## Agent 1 — Prompt (always-on WA)

Copy everything between the `BEGIN_AGENT_1_PROMPT` / `END_AGENT_1_PROMPT` markers.

```
BEGIN_AGENT_1_PROMPT

# Task: Always-on WhatsApp session + supervised reconnect (NMCAS)

## Context

NMCAS API currently leaves WhatsApp cold until the browser polls `GET /wa/status` (or a send job runs). Idle eviction kills the session after 10 minutes. Cold boot blocks status for ~10s and starves Prisma (`connection_limit=2`), so the UI shows “Cannot reach WhatsApp status / make sure API is running” while `/health` is OK.

Read first:
- `NMCAS-VAULT/raw/sources/2026-07-27-wa-reliability-always-on-plan.md` (§1.1, §2 D1/D6, §5.1)
- `apps/api/src/wa/wa-pool.ts`
- `apps/api/src/wa/wa-manager.ts` (`start`, `ensureRunning`, `attachClientEvents`, `shutdown`, idle helpers)
- `apps/api/src/routes/wa.ts`
- `apps/api/src/index.ts`
- `apps/api/src/env.ts`
- `packages/db/src/index.ts` (`createPrismaClient` / `connection_limit`)

Production host is a memory-tight DO droplet (see vault DO OOM note). Always-on is still preferred: ~80 MB steady. Provide an env kill-switch.

## Your job (Agent 1 only)

1. **Env (`apps/api/src/env.ts`)**
   - `WA_ALWAYS_ON` — default **true** (parse string `"false"`/`"0"`/`"no"` as false).
   - `WA_MAX_WARM_CLIENTS` — positive int, default **4** (safety cap).
   - Document both in comments; do not require `.env` changes for defaults to work.

2. **`WaConnectionPool`**
   - When `WA_ALWAYS_ON`: **do not idle-evict** linked sessions.
   - Enforce max warm clients via LRU/shutdown of other projects (keep QR-in-progress safe).
   - Add something like `warmDefaultProject()` / `warmProjectsWithSessions()` that the API can call after listen — boot `DEFAULT_PROJECT_ID` at minimum; optionally also projects that have a `WhatsAppSessionBlob` row (keep scope tight if multi-project is unused).

3. **`WaManager` supervised reconnect**
   - On `disconnected` and non-zero Go `exit`: if not shutting down and not logged out, schedule reconnect with exponential backoff (base ~1s, cap ~60s), calling existing `start()`/`ensureRunning` chain (serialized via `waOpChain`).
   - Cancel timers on `shutdown` and on `logged_out`.
   - Mark UI `connecting` while reconnecting; `connected` on success.
   - Do **not** wipe session store on ordinary disconnect.

4. **HTTP status must stay cheap**
   - `GET /wa/status` and `GET /wa/qr`: return current snapshot immediately; `void wa.start()` only if needed — **do not await** full cold boot/persist on the request.
   - Add a small `getStatusSnapshot()` (or equivalent) on `WaManager` if helpful.
   - Groups route may still `await start()` (needed for live fetch) but should benefit from always-on.

5. **API startup (`index.ts`)**
   - After `listen`, kick background warm of default project (log errors; do not crash process).
   - Do not block bind on WA connect.

6. **Prisma pool**
   - Change default `connection_limit` from `2` to `5` in `packages/db/src/index.ts`.
   - Optional override via `PRISMA_CONNECTION_LIMIT` env if easy; keep under free-tier pooler + pg-boss headroom.

7. **Tests**
   - Add focused unit tests where practical (e.g. backoff helper, snapshot shape). If hard to unit-test Go IPC, document a short manual checklist in the PR summary instead of fake coverage.

8. **Out of scope for Agent 1**
   - `waMessageId`, receipt-gated SENT, Prisma message schema
   - Periodic group refresh / web Load-groups UX
   - Engagement tracker
   - Do not commit/push unless human asks

## Coding rules

Strict TypeScript; no `any`; no non-null assertion `!`; no `as unknown as T`; double-quoted strings; JSDoc on new exports; full implementations (no placeholders). Match existing file style.

## Done when

- `npm run typecheck` clean for touched workspaces
- API-targeted tests pass if added
- Short summary: files changed, env defaults, how reconnect works, how to disable always-on
- Note follow-ups for Agent 2 (event hook points still free for `message:receipt`)

END_AGENT_1_PROMPT
```

---

## Agent 2 — Prompt (receipt-gated SENT)

Copy everything between the `BEGIN_AGENT_2_PROMPT` / `END_AGENT_2_PROMPT` markers.

**Prerequisite:** Agent 1 landed locally (always-on + cheap status). If Agent 1 is missing, still implement send/receipt logic, but warn that false SENT will remain common on flaky cold boots.

```
BEGIN_AGENT_2_PROMPT

# Task: Store WhatsApp message ids + receipt-gated SENT (NMCAS)

## Context

Today the send worker marks `ScheduledMessage` as `SENT` when `sendRawMessage` / poll send Promise resolves. That is only “IPC/server accept,” not proof the message is visible. Operators see SENT in Queue while a community (e.g. workshop 5.0) has no post. whatsmeow returns `SendResponse { id, timestamp }` and emits `message:receipt` — NMCAS ignores both.

Fan-out stays **one row per community** (do not collapse). Fix reliability per row.

Read first:
- `NMCAS-VAULT/raw/sources/2026-07-27-wa-reliability-always-on-plan.md` (§1.2–1.3, §2 D2/D3, §5.2)
- `apps/api/src/worker/send-scheduled-message.ts` (`markSent`, `runSendWithTimeout`, send*Row)
- `apps/api/src/wa/wa-send.ts` (currently returns `Promise<void>`)
- `apps/api/src/wa/wa-manager.ts` (`sendPost`, `sendPoll`, `attachClientEvents`)
- `packages/db/prisma/schema.prisma` (`ScheduledMessage`, `MessageStatus`)
- `node_modules/@whatsmeow-node/whatsmeow-node/dist/index.d.ts` (`SendResponse`, `message:receipt`)

## Your job (Agent 2 only)

1. **Schema**
   - Add nullable `waMessageId String?` on `ScheduledMessage` (index if useful for receipt lookup: unique-ish per project or plain index on `waMessageId`).
   - Optional but nice: `waAcceptedAt DateTime?`, `waAckedAt DateTime?`.
   - Status approach (pick **one**, document in summary):
     - **Preferred:** keep enum; after send success set status still `SENDING` (or add `ACCEPTED` if you add enum value + migration carefully) until receipt → `SENT`.
     - **Alt:** introduce `ACCEPTED` in `MessageStatus` + migrate; update web Queue badges minimally so ACCEPTED is not shown as green Sent.
   - Create a Prisma migration under `packages/db/prisma/migrations/`. Do not edit old migrations.
   - Run generate via existing workspace scripts (`npm run db:generate` / package scripts).

2. **Send path returns ids**
   - Change `wa-send.ts` helpers to return `SendResponse` (or `{ id: string }`) from `sendRawMessage` / `sendPollCreation`.
   - Thread through `WaManager.sendPost` / `sendPoll` / `sendSticker` / etc.
   - Worker: after successful send IPC, persist `waMessageId` (+ timestamps) **before** considering the job done; **do not** call today’s `markSent` on IPC success alone.

3. **Receipt listener**
   - In `attachClientEvents`, handle `message:receipt`.
   - Match receipt `ids` to rows with that `waMessageId` and pre-SENT status → set `SENT`, `sentAt`, `waAckedAt`, clear error.
   - Scope updates safely (by id); ignore receipts for unknown ids.
   - Consider concurrency: multiple receipts; idempotent updates.

4. **No-receipt timeout**
   - If IPC succeeded and id stored but no receipt within a timeout (default **90s**, constant or env), mark **FAILED** (or dedicated uncertain status) with a clear error string including the waMessageId. Never leave operators with green SENT.
   - Coordinate with existing 120s `runSendWithTimeout` so you do not double-mark inconsistently — document the interaction (e.g. IPC timeout still FAILED “may have sent”; receipt timeout is separate after IPC OK).

5. **Tests**
   - Unit-test pure helpers: map receipt ids → update criteria; timeout messaging.
   - Extend `apps/api` test script if you add compiled test files (follow existing `node:test` + `tsc` pattern).

6. **Out of scope**
   - Always-on / pool idle changes (Agent 1)
   - Group refresh / Load groups UX (Agent 3)
   - Reactions/replies tables (Agent 4)
   - Full Queue UI redesign — only minimal badge if new status added
   - Do not commit/push unless human asks

## Coding rules

Strict TypeScript; no `any`; no `!`; no `as unknown as T`; double-quoted strings; JSDoc on new exports.

## Done when

- Migration + generate OK; typecheck clean
- Tests green for new helpers
- Summary: status model chosen, timeout behavior, how to manually verify with a test group
- Confirm `waMessageId` is queryable for future engagement tracker

END_AGENT_2_PROMPT
```

---

## Agent 3 — Prompt (periodic groups refresh)

Copy everything between the `BEGIN_AGENT_3_PROMPT` / `END_AGENT_3_PROMPT` markers.

**Prerequisite:** Agent 1 always-on so a connected client exists without browser babysitting.

```
BEGIN_AGENT_3_PROMPT

# Task: Periodic WhatsApp groups refresh (NMCAS)

## Context

Group lists live only in `WaManager`’s 5-minute in-memory cache. The web UI still pushes operators toward “Load groups.” There is no Meta webhook; whatsmeow can emit `group:*` later — **this task is periodic refresh only**, not DB persistence and not event wiring.

Read first:
- `NMCAS-VAULT/raw/sources/2026-07-27-wa-reliability-always-on-plan.md` (§1.4, §2 D4, §5.3)
- `apps/api/src/wa/wa-manager.ts` (`fetchGroupOptions`, cache TTL, `attachClientEvents`)
- `apps/api/src/routes/wa.ts` (`GET /wa/groups`)
- `apps/web/src/hooks/useNmcasApp.ts` (groups effects / `refreshGroups`)
- `apps/web/src/components/WhatsAppSection.tsx`

## Your job (Agent 3 only)

1. **Server: periodic refresh**
   - While the manager is connected (and always-on / not shutting down), run an interval (default **3 minutes**, constant OK) that refreshes joined groups (`forceRefresh` / uncached fetch).
   - Refresh **once immediately** when transitioning to connected.
   - Stop interval on shutdown / logout / disconnect (restart on next connect).
   - Log duration/count at info level (match existing `[WaManager] getJoinedGroups` style); swallow errors without crashing the process.
   - Keep existing HTTP `?refresh=1` behavior.

2. **Web: demote click-to-load**
   - When WA is connected, ensure groups auto-load (existing effects may already do this — fix races where list stays empty until manual click).
   - Change primary Connected card CTA from implying “must Load” to a quieter **Refresh groups** when list already non-empty; if empty while connected, show “Loading groups…” / auto-retry rather than only a Load button.
   - Do **not** redesign the whole Schedule page.

3. **Out of scope**
   - Persisting groups to Postgres
   - Subscribing to `group:info` / `group:joined` (optional note in summary as follow-up)
   - Agent 1/2 send/receipt work
   - Do not commit/push unless human asks

## Coding rules

Strict TypeScript; no `any`; no `!`; no `as unknown as T`; double-quoted strings; JSDoc on new exports.

## Done when

- Typecheck clean
- Summary of interval default and UI copy changes
- Manual checklist: API up + linked → open Schedule → destinations populated without WhatsApp “Load groups” click

END_AGENT_3_PROMPT
```

---

## Agent 4 — Prompt (engagement tracker) — DEFERRED

Run only after Agents 1–2 are stable and `waMessageId` exists in production. Copy between markers when ready.

```
BEGIN_AGENT_4_PROMPT

# Task: Reactions / replies engagement tracker foundation (NMCAS) — DEFERRED

## Context

Operators want to know how community Value posts perform (reactions + replies). Overhead is low if allowlisted and count-first. Requires `ScheduledMessage.waMessageId` from Agent 2 and a stable always-on session from Agent 1.

Read first:
- `NMCAS-VAULT/raw/sources/2026-07-27-wa-reliability-always-on-plan.md` (§5.4, §2 D5)
- `apps/api/src/wa/wa-manager.ts` (`attachClientEvents`)
- `packages/db/prisma/schema.prisma`
- whatsmeow-node types: `message` event, `decryptReaction` if needed

## Your job (Agent 4 only)

1. Prisma models for reactions and replies linked to `scheduledMessageId` (unique constraints so duplicate events upsert cleanly).
2. Ingest only events for chats/JIDs that match sent NMCAS rows (or project `activeCommunityJids`) — do not store all group chatter.
3. Match reactions/replies to `waMessageId` / quoted stanza ids.
4. Read API: counts (and optional recent list) per message id — e.g. `GET /messages/:id/engagement`.
5. Minimal web: show counts on Queue row or detail — no full analytics dashboard.
6. Document limitations: no historical backfill; misses during disconnect; announcement vs discussion-group reply scope (implement **quotes on the announcement message** only unless human expands scope).

## Out of scope

- Full BI dashboard, CSV export, member identity directory
- Poll vote analytics (separate)
- UI chrome redesign
- Do not commit/push unless human asks

## Done when

- Migration + typecheck + basic tests for match/upsert helpers
- Summary of event filter rules and known gaps

END_AGENT_4_PROMPT
```

---

## Suggested verification order (human)

1. After Agent 1: restart API alone → WA connects without opening web; refresh WhatsApp tab once — no false “API down.”
2. After Agent 2: send one test post → Queue stays non-SENT until receipt; confirm message visible in group; force disconnect after IPC (if possible) → not green SENT.
3. After Agent 3: open Schedule on cold browser with API already warm → groups present.
4. Agent 4: only after a week of stable sends with `waMessageId` populated.

---

*End of agent prompts.*
