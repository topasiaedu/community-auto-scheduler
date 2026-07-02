# Raw source: Stability hardening session (2026-04-21)

**Type:** Engineering capture — incident post-mortem + fixes applied.
**Date:** 2026-04-21
**Scope:** `apps/api/src/worker/`, `apps/api/src/rescue-sweep.ts` (new), `apps/api/src/wa/`, `apps/api/src/routes/messages.ts`, `apps/web/src/hooks/useNmcasApp.ts`, `apps/web/src/components/QueueCard.tsx`

---

## Incidents observed (production)

### 1. Duplicate sends (2–3× per message)
- Messages were arriving in the WhatsApp group 2–3 times.
- Root cause: `sendMessage` in Baileys resolves only when WhatsApp ACKs. On a slow free-tier connection ACK took >60s. The app timed out, assumed "not sent", reset status to `PENDING`, and the rescue loop re-sent.

### 2. 440 connectionReplaced storm
- Every timeout triggered `forceRestart()` on the WA socket.
- `forceRestart()` tore down and immediately rebooted Baileys, which WhatsApp saw as "another device using the same session" → 440 `connectionReplaced` → socket dies → reconnect → repeat.
- Logs showed `[send-worker] post send timed out → resetting to PENDING → force-restarting WA` every ~60s in a tight loop.

### 3. Messages stuck in PENDING after manual DB edit
- User changed a row to `PENDING` in Supabase dashboard; nothing happened.
- Root cause: there was no recovery mechanism. Changing DB status does not create a pg-boss job.

### 4. [rtkcc] log spam
- Render logs flooded with `Closing session: SessionEntry { ... }` (Baileys Signal Protocol debug logs).
- Root cause: `NODE_ENV` not set to `production` on Render; Baileys logger was at `error` level not `silent`.

---

## Fixes applied

### A. Rescue sweep (`apps/api/src/rescue-sweep.ts` — new file)
- Background interval (default **2 minutes**) polls DB for orphaned rows.
- **PENDING rescue:** `scheduledAt <= now - 10s` and no live pg-boss job → re-enqueue with `fireAt = now + 5s`, update `pgBossJobId`, reset `error: null`.
- **SENDING rescue:** `scheduledAt <= now - 10min` and no live pg-boss job → same re-enqueue path (handles worker crash mid-send).
- Live job check: `boss.getJobById(queue, pgBossJobId)` — skips re-enqueue if state is `created`, `retry`, or `active`.
- Race guard: if `updateMany` gets `count=0` (row became SENT/FAILED/CANCELLED concurrently), cancel the orphan pg-boss job just created.
- Started in `index.ts` after `fastify.listen`; cleanup function stored in `stopRescueSweep`.

### B. Worker timeout → FAILED (not PENDING) for connected socket
- Previous: any timeout → `PENDING` → infinite retry loop → duplicate sends.
- New: if `sock !== undefined` and `!sock.ws.isClosed` (socket was connected), timeout → **FAILED** with message: _"WhatsApp send timed out after 120s — the message may already have been delivered. Check the group and use Re-queue if it was not sent."_
- Only reset to `PENDING` when socket is genuinely unavailable (`sock === undefined` or `sock.ws.isClosed`) — safe because no message was even attempted.

### C. Timeout increased 60s → 120s
- 60s caused false timeouts on slow-ACK connections where message had actually sent.
- 120s gives more slack before declaring "unknown" outcome.

### D. `forceRestart()` removed from worker timeout path
- `forceRestart()` (teardown + immediate boot) was fighting Baileys' own `scheduleBootAfterClose` backoff, causing the 440 loop.
- Baileys self-heals via its own reconnect timer (500ms for restartRequired, 8s for connectionClosed, 45s for connectionReplaced). Worker must not override this.
- `forceRestart()` method retained on `WaManager` / `WaConnectionPool` for future administrative use but is no longer called by the worker.

### E. `POST /messages/:id/requeue` route (new)
- Allows re-enqueueing a PENDING, SENDING, or FAILED row.
- Cancels old pg-boss job (best-effort), creates new job with `fireAt = max(scheduledAt, now + 15s)`, writes new `pgBossJobId`, resets status to PENDING, clears `error`.
- **Race guard for SENDING:** if `scheduledAt > now - 5min`, returns HTTP 409 — "may still be sending, wait at least 5 minutes". Prevents user triggering a duplicate send while worker is mid-send.

### F. UI: Re-queue button on all actionable statuses
- **PENDING card:** "Re-queue job" button (alongside Edit / Cancel send).
- **SENDING card:** "Re-queue stuck send" button.
- **FAILED card:** "Re-queue" button → confirmation dialog ("Only re-queue if the message was NOT sent to the group") with "Yes, re-send" / "Cancel". Prevents accidental duplicate on timed-out messages that may have been delivered.

### G. Parse failure logging in worker
- Previously: `parseSendScheduledMessageJobData` returning null → silent `continue` → pg-boss marks job complete → row stays PENDING → rescue re-enqueues → infinite churn.
- Now: `console.error` with full payload dump. Completing (not throwing) is still correct; rescue handles the row.

### H. Rescue PENDING_GRACE_MS reduced 30s → 10s
- Reduces max rescue latency for manually-set PENDING rows from ~2min30s to ~2min10s.

### I. Baileys logger → `silent` in production
- Was: `error` level (still emitted internal Signal Protocol session debug logs from pino).
- Now: `silent` in production — completely suppresses [rtkcc] / `Closing session: SessionEntry` spam.

---

## Infrastructure clarifications (confirmed in session)

- **Render free tier + UptimeRobot (5-min pings):** No cold starts. Render free tier spins down after 15 min of inactivity; 5-min pings prevent this. Upgrade not required.
- **Supabase free tier:** Adequate. Connection drops mitigated by TCP keepalive on pg-boss URL and Prisma `SELECT 1` heartbeat every 4 min. Free project pausing prevented by UptimeRobot-triggered DB activity. No upgrade needed.
- **Personal WhatsApp (Baileys) justified:** Meta's Cloud API cannot manage communities (create/add members to subgroups). Baileys is the only available option for community management use cases.

---

## Remaining known limitation

- **Timeout = "unknown delivery":** When a connected-socket send times out at 120s, the message may or may not have been delivered to the group. There is no way to know without the WA ACK. The FAILED status with clear UI message and Re-queue button is the correct UX for this inherent WhatsApp/Baileys limitation.

---

*Immutable raw capture; wiki digest lives under `wiki/sources/`.*
