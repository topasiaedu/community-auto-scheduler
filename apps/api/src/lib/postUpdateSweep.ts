/**
 * Sends one WhatsApp post-update DM per finished scheduled post.
 * Replaces the immediate per-row failure alert. The daily digest is unchanged.
 */

import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import type { WaConnectionPool } from "../wa/wa-pool.js";
import { toWhatsAppUserJid } from "./notifyMsisdn.js";
import {
  formatPostUpdateNotice,
  isPostUpdateBatchReady,
  type PostUpdateNoticeRow,
  type PostUpdateRowStatus,
} from "./postUpdateNotice.js";

/** How long a claimed notice stays owned before another sweep may retry a failed DM. */
const CLAIM_STALE_MS = 2 * 60_000;

/** Batches handled in one pass so a busy minute cannot fan out unbounded sends. */
const MAX_BATCHES_PER_SWEEP = 10;

const POST_UPDATE_INTERVAL_MS = 60_000;

/**
 * One sweep: assign batch ids to finished legacy rows, then DM each ready batch once.
 */
export async function runPostUpdateSweep(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
): Promise<void> {
  try {
    await assignLegacyBatchIds(prisma);
    const batchIds = await listCandidateBatchIds(prisma);
    for (const batchId of batchIds) {
      await notifyBatch(prisma, env, waPool, batchId);
    }
  } catch (err: unknown) {
    console.error(
      "[post-update] sweep failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Starts the sweep and returns a stop function for shutdown.
 */
export function startPostUpdateSweep(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  intervalMs = POST_UPDATE_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    void runPostUpdateSweep(prisma, env, waPool);
  }, intervalMs);
  timer.unref?.();
  console.warn(`[post-update] started (interval=${String(intervalMs)}ms)`);
  return () => {
    clearInterval(timer);
  };
}

/**
 * Finished rows created before fanOutBatchId existed get their own batch so they still notify once.
 */
async function assignLegacyBatchIds(prisma: PrismaClient): Promise<void> {
  const legacy = await prisma.scheduledMessage.findMany({
    where: {
      fanOutBatchId: null,
      status: { in: ["SENT", "FAILED"] },
    },
    select: { id: true },
    take: MAX_BATCHES_PER_SWEEP,
  });
  for (const row of legacy) {
    await prisma.scheduledMessage.updateMany({
      where: { id: row.id, fanOutBatchId: null },
      data: { fanOutBatchId: row.id },
    });
  }
}

/**
 * Batch ids that have at least one Sent or Failed row and no delivered notice yet.
 */
async function listCandidateBatchIds(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.scheduledMessage.findMany({
    where: {
      fanOutBatchId: { not: null },
      status: { in: ["SENT", "FAILED"] },
    },
    distinct: ["fanOutBatchId"],
    select: { fanOutBatchId: true },
    take: 40,
  });
  const batchIds: string[] = [];
  for (const row of rows) {
    if (row.fanOutBatchId !== null && row.fanOutBatchId.length > 0) {
      batchIds.push(row.fanOutBatchId);
    }
  }
  if (batchIds.length === 0) {
    return [];
  }
  const posted = await prisma.postStatusNotice.findMany({
    where: { batchId: { in: batchIds }, postedAt: { not: null } },
    select: { batchId: true },
  });
  const done = new Set(posted.map((notice) => notice.batchId));
  return batchIds.filter((id) => !done.has(id)).slice(0, MAX_BATCHES_PER_SWEEP);
}

/**
 * Builds and sends the DM for one batch when it is ready. A second sweep does not send again.
 */
async function notifyBatch(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  batchId: string,
): Promise<void> {
  const stored = await prisma.scheduledMessage.findMany({
    where: { fanOutBatchId: batchId },
    orderBy: { createdAt: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      reminderTemplate: { select: { name: true } },
    },
  });
  if (stored.length === 0) {
    return;
  }
  const noticeRows = stored.flatMap((row) => {
    const mapped = toNoticeRow(row);
    return mapped === null ? [] : [mapped];
  });
  if (
    !isPostUpdateBatchReady(
      noticeRows,
      Date.now(),
      env.WA_RECEIPT_TIMEOUT_MS,
    )
  ) {
    return;
  }
  const text = formatPostUpdateNotice(noticeRows);
  const owned = await claimNotice(prisma, batchId);
  if (!owned) {
    return;
  }
  if (text === null) {
    await prisma.postStatusNotice.update({
      where: { batchId },
      data: { postedAt: new Date(), body: "", error: null },
    });
    return;
  }
  const projectId = stored[0]?.projectId;
  if (projectId === undefined || projectId.length === 0) {
    await markNoticeError(prisma, batchId, text, "Missing project id");
    return;
  }
  const delivered = await deliverNotice(env, waPool, projectId, text);
  if (delivered > 0) {
    await prisma.postStatusNotice.update({
      where: { batchId },
      data: { postedAt: new Date(), body: text, error: null },
    });
    console.warn(
      `[post-update] sent batch=${batchId} projectId=${projectId} recipients=${String(delivered)}`,
    );
    return;
  }
  await markNoticeError(prisma, batchId, text, "WhatsApp post-update was not accepted by any recipient");
}

/**
 * Inserts the notice row, or re-claims it after a failed attempt goes stale.
 * Returns false when another sweep owns the batch or the DM was already sent.
 */
async function claimNotice(prisma: PrismaClient, batchId: string): Promise<boolean> {
  try {
    await prisma.postStatusNotice.create({
      data: { batchId, body: "" },
    });
    return true;
  } catch (err: unknown) {
    if (!isUniqueConstraintError(err)) {
      throw err;
    }
  }
  const existing = await prisma.postStatusNotice.findUnique({ where: { batchId } });
  if (existing === null || existing.postedAt !== null) {
    return false;
  }
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
  const claimed = await prisma.postStatusNotice.updateMany({
    where: { batchId, postedAt: null, updatedAt: { lt: staleBefore } },
    data: { error: null },
  });
  return claimed.count > 0;
}

async function markNoticeError(
  prisma: PrismaClient,
  batchId: string,
  body: string,
  error: string,
): Promise<void> {
  await prisma.postStatusNotice.update({
    where: { batchId },
    data: { body, error, postedAt: null },
  });
  console.warn(`[post-update] not sent batch=${batchId}: ${error}`);
}

/**
 * Sends the same text to every ops number on that project's linked WhatsApp account.
 * Returns how many numbers accepted the send.
 */
async function deliverNotice(
  env: ApiEnv,
  waPool: WaConnectionPool,
  projectId: string,
  text: string,
): Promise<number> {
  const msisdns = env.NMCAS_FAILURE_NOTIFY_MSISDN;
  if (msisdns.length === 0) {
    return 0;
  }
  try {
    await waPool.start(projectId);
    if (!(await waPool.isSendReady(projectId))) {
      return 0;
    }
    const wa = waPool.getManager(projectId);
    let delivered = 0;
    for (const msisdn of msisdns) {
      try {
        await wa.sendDirectText(toWhatsAppUserJid(msisdn), text);
        delivered += 1;
      } catch (err: unknown) {
        console.warn(
          `[post-update] recipient failed projectId=${projectId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return delivered;
  } catch (err: unknown) {
    console.warn(
      `[post-update] WhatsApp send failed projectId=${projectId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return 0;
  }
}

type StoredNoticeRow = {
  groupName: string;
  status: string;
  error: string | null;
  copyText: string | null;
  operatorKind: string | null;
  valueFormat: string | null;
  reminderFormat: string | null;
  scheduledAt: Date;
  project: { name: string };
  reminderTemplate: { name: string } | null;
  type: string;
};

function toNoticeRow(row: StoredNoticeRow): PostUpdateNoticeRow | null {
  const status = toRowStatus(row.status);
  if (status === null) {
    return null;
  }
  return {
    groupName: row.groupName,
    status,
    error: row.error,
    copyText: row.copyText,
    operatorKind: toOperatorKind(row.operatorKind),
    valueFormat: toValueFormat(row.valueFormat),
    reminderFormat: toReminderFormat(row.reminderFormat),
    slotName: row.reminderTemplate?.name ?? null,
    scheduledAt: row.scheduledAt,
    projectName: row.project.name,
    legacyType: row.type === "POLL" ? "POLL" : "POST",
  };
}

function toRowStatus(status: string): PostUpdateRowStatus | null {
  if (
    status === "PENDING" ||
    status === "SENDING" ||
    status === "SENT" ||
    status === "FAILED" ||
    status === "DRAFT" ||
    status === "CANCELLED"
  ) {
    return status;
  }
  return null;
}

function toOperatorKind(value: string | null): PostUpdateNoticeRow["operatorKind"] {
  if (value === "VALUE" || value === "REMINDER") {
    return value;
  }
  return null;
}

function toValueFormat(value: string | null): PostUpdateNoticeRow["valueFormat"] {
  if (value === "IMAGE_CAPTION" || value === "TEXT_ONLY" || value === "POLL") {
    return value;
  }
  return null;
}

function toReminderFormat(value: string | null): PostUpdateNoticeRow["reminderFormat"] {
  if (value === "IMAGE" || value === "TEXT" || value === "STICKER") {
    return value;
  }
  return null;
}

function isUniqueConstraintError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return false;
  }
  const code = err.code;
  return code === "P2002";
}
