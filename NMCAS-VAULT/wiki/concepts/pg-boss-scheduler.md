---
title: "pg-boss job scheduler"
type: "concept"
updated: "2026-04-21"
sources: 3
tags: ["scheduling", "pg-boss", "postgres", "nmcas"]
---

# pg-boss job scheduler

## What it is

`pg-boss` is a Postgres-backed job queue for Node.js. NMCAS uses it as the scheduling engine. Jobs are stored as rows in Postgres, so they survive API server restarts and do not require a separate Redis instance.

## Why pg-boss instead of BullMQ + Redis

| Concern | pg-boss | BullMQ + Redis |
|---------|---------|----------------|
| Infrastructure | Uses existing Supabase Postgres | Requires separate Redis service |
| Cost | Free (shared with DB) | Upstash free tier or Render Redis add-on |
| Scale fit | Sufficient for low-volume community scheduler | Overkill for V1 |
| Operational complexity | One fewer service | Two services to manage |

## Scheduling flow in NMCAS

1. User submits a scheduled message via the UI.
2. API saves the `ScheduledMessage` row (`status: PENDING`) and creates a pg-boss job via `boss.sendAfter(queue, { scheduledMessageId }, {}, scheduledAt)`. The returned `jobId` is stored on the row as `pgBossJobId`.
3. At fire time, pg-boss calls the worker function registered via `boss.work(queue, handler)`.
4. Worker reads the row, does a CAS `PENDING → SENDING` via `updateMany { WHERE status='PENDING' }` (PostgreSQL row-level lock — only one concurrent job can win).
5. Worker sends via the project's Baileys socket.
6. On success: `updateMany { WHERE status='SENDING' }` → `SENT`.
7. On WA error: `markFailedWithNotify` → `FAILED` + optional WhatsApp DM to `NMCAS_FAILURE_NOTIFY_MSISDN`.

## Free-tier tuning (index.ts)

```
max: 3                      — pg connection pool limit (shared with Prisma)
maintenanceIntervalSeconds: 120
deleteAfterHours: 24
keepalives + keepalives_idle: 60  — prevents Supabase pooler TCP drops after 5 min idle
```

## Rescue sweep (`rescue-sweep.ts`)

A background interval (default **2 minutes**) guards against orphaned rows that have no active pg-boss job:

| Scenario | Trigger | Action |
|---|---|---|
| PENDING row, job missing/dead | `scheduledAt <= now - 10s` | `sendAfter(now + 5s)`, update `pgBossJobId`, reset `error` |
| SENDING row stuck (worker crashed) | `scheduledAt <= now - 10min` | Same re-enqueue path |

Live-job check: `boss.getJobById(queue, pgBossJobId)` — skips re-enqueue if job state is `created`, `retry`, or `active`. If `updateMany` returns `count=0` (race — row was concurrently completed), the orphan job is cancelled.

Common triggers for orphaned rows: manual DB edit to `PENDING`, process crash, race between deploy and a firing job.

## HTTP requeue (`POST /messages/:id/requeue`)

Allows administrative re-enqueueing of `PENDING`, `SENDING`, or `FAILED` rows:
- Cancels old job (best-effort `safeCancelJob`).
- `fireAt = max(scheduledAt, now + 15s)`.
- Updates `pgBossJobId`, resets `status: PENDING`, clears `error`.
- **409 guard:** SENDING rows with `scheduledAt > now - 5min` are rejected — the worker may still be mid-send and forcing a requeue would cause a duplicate.

## One-off only (V1)

All jobs are one-off. Recurring scheduling is out of scope for V1.

## Race protection summary

| Race | Protection |
|---|---|
| Two jobs for same PENDING row | PostgreSQL row-lock on `UPDATE WHERE status='PENDING'` — one wins, other returns |
| Rescue + worker race on SENDING→SENT | Rescue's `updateMany` guard on `count=0` cancels orphan; worker CAS detects PENDING and skips |
| HTTP requeue while worker mid-send | 409 if SENDING row is < 5 min old |
| Two concurrent rescue sweeps | Orphan cancellation on `count=0` |

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`
- Implementation snapshot: `raw/sources/2026-04-18-nmcas-implementation-snapshot.md`
- Stability hardening: `raw/sources/2026-04-21-stability-hardening-session.md`

## See also

- [[wiki/concepts/wa-connection-pool]]
- [[wiki/entities/scheduled-message]]
- [[wiki/sources/2026-04-21-stability-hardening-session]]
- [[wiki/overview]]
