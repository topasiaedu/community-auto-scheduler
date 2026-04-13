---
title: "pg-boss job scheduler"
type: "concept"
updated: "2026-04-13"
sources: 1
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
2. API saves the `ScheduledMessage` row (status `PENDING`) and creates a `pg-boss` job with `startAfter` set to the message's UTC `scheduledAt` datetime.
3. At fire time, `pg-boss` picks up the job and calls the worker function.
4. Worker retrieves the `ScheduledMessage`, looks up the Baileys socket in the connection pool, sends the message.
5. Message status updated to `SENT` or `FAILED`. On failure, notify recipients are messaged.

## One-off only (V1)

All jobs are one-off (`startAfter` + no repeat). Recurring scheduling is out of scope for V1.

## Sources

- Grounded in: `raw/sources/2026-04-13-nmcas-prd-v1.md`

## See also

- [[wiki/concepts/wa-connection-pool]]
- [[wiki/entities/scheduled-message]]
- [[wiki/overview]]
