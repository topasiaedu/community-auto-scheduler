---
title: "Stability hardening session (2026-04-21)"
type: "source-summary"
updated: "2026-04-21"
sources: 1
tags: ["nmcas", "stability", "worker", "rescue-sweep", "wa", "post-mortem"]
---

# Stability hardening session (2026-04-21)

**Raw:** `raw/sources/2026-04-21-stability-hardening-session.md`

## Summary

A production incident session where three bugs causing duplicate sends, infinite retry loops, and stuck messages were root-caused and fixed. New rescue sweep and requeue route added. WA timeout handling fundamentally redesigned.

## Key incidents

| Incident | Root cause |
|---|---|
| Messages sent 2–3× | Timeout reset to PENDING → rescue re-enqueued → resent; Baileys ACK is async and arrived after our timeout |
| 440 `connectionReplaced` loop | `forceRestart()` in timeout path fought Baileys' own reconnect backoff |
| Manual PENDING edits ignored | No pg-boss job = no worker pickup; no recovery mechanism existed |
| `[rtkcc]` log spam | `NODE_ENV` not set; Baileys pino logger was at `error` not `silent` |

## Key decisions

1. **Timeout on connected socket → FAILED (not PENDING).** Prevents automatic retry when we cannot know if the message was delivered. User verifies group and re-queues manually.
2. **Rescue sweep instead of forceRestart.** A background poll every 2 min re-enqueues orphaned rows. Baileys handles its own reconnect; the worker must never force it.
3. **HTTP requeue blocks fresh SENDING rows (409).** Prevents race condition where user re-queues a mid-send row, causing duplicate.
4. **Confirmed: Render free tier + UptimeRobot = viable.** No upgrade needed for either Render or Supabase.

## Files changed

| File | Change |
|---|---|
| `apps/api/src/rescue-sweep.ts` | **New.** Background sweep rescuing orphaned PENDING/SENDING rows. |
| `apps/api/src/index.ts` | Wires rescue sweep; `stopRescueSweep` on shutdown. |
| `apps/api/src/routes/messages.ts` | New `POST /messages/:id/requeue`; allows FAILED; SENDING 5-min race guard. |
| `apps/api/src/worker/send-scheduled-message.ts` | Timeout→FAILED for connected socket; PENDING for unavailable socket; 120s timeout; parse failure log; forceRestart removed. |
| `apps/api/src/wa/wa-manager.ts` | Logger `silent` in prod; `forceRestart()` method added (unused by worker). |
| `apps/api/src/wa/wa-pool.ts` | `forceRestart(projectId)` proxy. |
| `apps/web/src/hooks/useNmcasApp.ts` | `onRequeueMessage` handler; FAILED allowed. |
| `apps/web/src/components/QueueCard.tsx` | Re-queue on PENDING/SENDING/FAILED; FAILED confirmation dialog. |

## See also

- [[wiki/concepts/pg-boss-scheduler]] — rescue sweep details
- [[wiki/concepts/wa-connection-pool]] — timeout/forceRestart changes
- [[wiki/entities/scheduled-message]] — updated status lifecycle + requeue
- [[wiki/sources/2026-04-17-wa-p2-api-stability]] — prior WA stability work
- [[wiki/sources/2026-04-18-nmcas-implementation-snapshot]] — prior implementation state
