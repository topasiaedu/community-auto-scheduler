/**
 * Rescue sweep: periodically detects scheduled messages that should have fired but didn't,
 * and re-enqueues them into pg-boss so the worker picks them up.
 *
 * Two scenarios handled:
 *  1. PENDING rows whose scheduledAt is in the past by > PENDING_GRACE_MS — the job was never
 *     created (e.g. manual DB edit), was cancelled, or was lost after a crash. We check the
 *     pg-boss job state; if it is gone or terminal we re-enqueue immediately (fire ASAP).
 *  2. SENDING rows whose scheduledAt is in the past by > SENDING_STUCK_MS — the worker set the
 *     row to SENDING but then crashed before completing. Same check: if the pg-boss job is gone
 *     we re-enqueue so the worker retries.
 */

import PgBoss from "pg-boss";
import type { PrismaClient } from "@nmcas/db";
import { SEND_SCHEDULED_MESSAGE_QUEUE } from "./queues.js";

type PgBossInstance = InstanceType<typeof PgBoss>;

/** PENDING rows that are this far overdue are eligible for rescue. */
const PENDING_GRACE_MS = 10_000; // 10 s — fast pickup for manually-set rows

/** SENDING rows that are this far overdue are eligible for rescue. */
const SENDING_STUCK_MS = 10 * 60_000; // 10 min

/** Job states where a live job is already working — do not re-enqueue. */
const LIVE_STATES = new Set(["created", "retry", "active"]);

/**
 * Runs one rescue sweep pass, re-enqueueing any orphaned messages.
 * Swallows all errors so a transient DB hiccup never kills the interval.
 */
export async function runRescueSweep(
  prisma: PrismaClient,
  boss: PgBossInstance,
): Promise<void> {
  try {
    await rescuePending(prisma, boss);
    await rescueSending(prisma, boss);
  } catch (err: unknown) {
    console.error("[rescue-sweep] unexpected error:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Finds PENDING rows that are overdue with no live pg-boss job and re-enqueues them.
 */
async function rescuePending(prisma: PrismaClient, boss: PgBossInstance): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MS);

  const rows = await prisma.scheduledMessage.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: cutoff },
    },
    take: 20,
  });

  for (const row of rows) {
    const jobAlive = await isJobAlive(boss, row.pgBossJobId);
    if (jobAlive) {
      continue;
    }
    console.warn(
      `[rescue-sweep] re-enqueueing overdue PENDING id=${row.id} scheduledAt=${row.scheduledAt.toISOString()}`,
    );
    await enqueueNow(prisma, boss, row.id);
  }
}

/**
 * Finds SENDING rows that have been stuck for longer than SENDING_STUCK_MS and re-enqueues them.
 */
async function rescueSending(prisma: PrismaClient, boss: PgBossInstance): Promise<void> {
  const cutoff = new Date(Date.now() - SENDING_STUCK_MS);

  const rows = await prisma.scheduledMessage.findMany({
    where: {
      status: "SENDING",
      scheduledAt: { lte: cutoff },
    },
    take: 10,
  });

  for (const row of rows) {
    const jobAlive = await isJobAlive(boss, row.pgBossJobId);
    if (jobAlive) {
      continue;
    }
    console.warn(
      `[rescue-sweep] re-enqueueing stuck SENDING id=${row.id} scheduledAt=${row.scheduledAt.toISOString()}`,
    );
    await enqueueNow(prisma, boss, row.id);
  }
}

/**
 * Returns true if the pg-boss job is in a live state (created / retry / active).
 * Any terminal state or a null result means the job is gone and needs re-enqueueing.
 */
async function isJobAlive(boss: PgBossInstance, pgBossJobId: string | null): Promise<boolean> {
  if (pgBossJobId === null || pgBossJobId.length === 0) {
    return false;
  }
  try {
    const job = (await boss.getJobById(SEND_SCHEDULED_MESSAGE_QUEUE, pgBossJobId)) as
      | { state?: string }
      | null
      | undefined;
    if (job === null || job === undefined) {
      return false;
    }
    return typeof job.state === "string" && LIVE_STATES.has(job.state);
  } catch {
    return false;
  }
}

/**
 * Creates a new pg-boss job for the given message (firing ASAP), updating the row's
 * pgBossJobId and resetting status to PENDING.  Uses updateMany with a status guard
 * so a concurrent worker cannot race to mark SENT at the same time.
 */
async function enqueueNow(
  prisma: PrismaClient,
  boss: PgBossInstance,
  messageId: string,
): Promise<void> {
  const fireAt = new Date(Date.now() + 5_000); // 5 s from now

  try {
    const jobId = await boss.sendAfter(
      SEND_SCHEDULED_MESSAGE_QUEUE,
      { scheduledMessageId: messageId },
      {},
      fireAt,
    );
    if (jobId === null) {
      console.error(`[rescue-sweep] boss.sendAfter returned null for id=${messageId}`);
      return;
    }
    const updated = await prisma.scheduledMessage.updateMany({
      where: {
        id: messageId,
        status: { in: ["PENDING", "SENDING"] },
      },
      data: {
        status: "PENDING",
        pgBossJobId: jobId,
        error: null,
      },
    });
    if (updated.count === 0) {
      /**
       * Row was concurrently updated (SENT/FAILED/CANCELLED) between our `isJobAlive` check
       * and this write. Cancel the orphan job we just created so it does not fire uselessly.
       */
      console.warn(`[rescue-sweep] row no longer PENDING/SENDING (race?) id=${messageId} — cancelling orphan job ${jobId}`);
      try {
        await boss.cancel(SEND_SCHEDULED_MESSAGE_QUEUE, jobId);
      } catch {
        /* best-effort — orphan job will exit early via status guard in worker */
      }
    } else {
      console.warn(`[rescue-sweep] re-enqueued id=${messageId} jobId=${jobId} fireAt=${fireAt.toISOString()}`);
    }
  } catch (err: unknown) {
    console.error(
      `[rescue-sweep] failed to enqueue id=${messageId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Starts the rescue sweep on the given interval and returns a cleanup function.
 * Call the returned function on shutdown to stop the interval.
 */
export function startRescueSweep(
  prisma: PrismaClient,
  boss: PgBossInstance,
  intervalMs = 2 * 60_000,
): () => void {
  const timer = setInterval(() => {
    void runRescueSweep(prisma, boss);
  }, intervalMs);

  console.warn(`[rescue-sweep] started (interval=${String(intervalMs)}ms)`);

  return () => {
    clearInterval(timer);
  };
}
