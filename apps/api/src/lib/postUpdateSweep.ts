/**
 * Closes each finished scheduled post once.
 * Community Reminder batches update one Telegram board message.
 * Community Value batches send one Telegram status message.
 * Every other batch is marked handled with no chat message.
 * The daily digest is unchanged.
 */

import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import {
  formatValuePostTelegram,
  isPostUpdateBatchReady,
  isValuePostBatch,
  type PostUpdateNoticeRow,
  type PostUpdateRowStatus,
} from "./postUpdateNotice.js";
import { sendTelegramText } from "./telegramNotify.js";
import {
  collectReminderBoard,
  deliverReminderBoard,
  parseReminderBoardLines,
  reminderAnnounceNotBeforeMs,
  reminderBatchIsCurrent,
  reminderBoardLinesToJson,
  type ReminderBatchSourceRow,
} from "./reminderStatusBoard.js";

/** Captured when this process loads. Slots scheduled well before this are not announced. */
const processStartedAtMs = Date.now();

/** How long a claimed notice stays owned before another sweep may retry a failed DM. */
const CLAIM_STALE_MS = 2 * 60_000;

/** Batches handled in one pass so a busy minute cannot fan out unbounded sends. */
const MAX_BATCHES_PER_SWEEP = 10;

const POST_UPDATE_INTERVAL_MS = 60_000;

/**
 * One sweep: assign batch ids to finished legacy rows, then close each ready batch once.
 */
export async function runPostUpdateSweep(
  prisma: PrismaClient,
  env: ApiEnv,
): Promise<void> {
  try {
    await assignLegacyBatchIds(prisma);
    const batchIds = await listCandidateBatchIds(prisma);
    for (const batchId of batchIds) {
      await settleBatch(prisma, env, batchId);
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
  intervalMs = POST_UPDATE_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    void runPostUpdateSweep(prisma, env);
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
 * Newest Sent or Failed batches that do not yet have a delivered notice.
 * Already-closed batches are excluded in SQL so a large history cannot hide a new one.
 */
async function listCandidateBatchIds(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ batchId: string | null }>>`
    SELECT s."fanOutBatchId" AS "batchId"
    FROM "ScheduledMessage" s
    WHERE s.status IN ('SENT', 'FAILED')
      AND s."fanOutBatchId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "PostStatusNotice" n
        WHERE n."batchId" = s."fanOutBatchId"
          AND n."postedAt" IS NOT NULL
      )
    GROUP BY s."fanOutBatchId"
    ORDER BY MAX(s."scheduledAt") DESC
    LIMIT ${MAX_BATCHES_PER_SWEEP}
  `;
  const batchIds: string[] = [];
  for (const row of rows) {
    if (typeof row.batchId === "string" && row.batchId.length > 0) {
      batchIds.push(row.batchId);
    }
  }
  return batchIds;
}

/**
 * Builds the Telegram board for a reminder batch, or a one-shot Telegram status for a Value batch.
 * Any other ready batch is closed with no chat message.
 * A failed Telegram call leaves the batch unposted so a later sweep can retry.
 */
async function settleBatch(
  prisma: PrismaClient,
  env: ApiEnv,
  batchId: string,
): Promise<void> {
  try {
    await settleOneBatch(prisma, env, batchId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[post-update] settle failed batch=${batchId} error=${clipPostUpdateLog(message)}`,
    );
  }
}

/**
 * Settles one batch. Throws on unexpected database errors so the caller can log the batch id.
 */
async function settleOneBatch(
  prisma: PrismaClient,
  env: ApiEnv,
  batchId: string,
): Promise<void> {
  const stored = await prisma.scheduledMessage.findMany({
    where: { fanOutBatchId: batchId },
    orderBy: { createdAt: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      reminderTemplate: {
        select: {
          slotKey: true,
          sortOrder: true,
          scheduleRuleKind: true,
          dayOffset: true,
        },
      },
    },
  });
  if (stored.length === 0) {
    return;
  }
  if (
    !isPostUpdateBatchReady(
      stored,
      Date.now(),
      env.WA_RECEIPT_TIMEOUT_MS,
    )
  ) {
    return;
  }
  const owned = await claimNotice(prisma, batchId);
  if (!owned) {
    return;
  }

  const reminder = collectReminderBoard(stored.map((row) => toBoardSource(row)));
  if (reminder === null) {
    await settleNonReminder(prisma, env, batchId, stored);
    return;
  }

  const notBeforeMs = reminderAnnounceNotBeforeMs(processStartedAtMs, Date.now());
  const scheduledAts = reminder.slots.map((slot) => slot.scheduledAt);
  if (!reminderBatchIsCurrent(scheduledAts, notBeforeMs)) {
    await prisma.postStatusNotice.update({
      where: { batchId },
      data: { postedAt: new Date(), body: "", error: null },
    });
    console.warn(`[post-update] skipped old reminder board batch=${batchId}`);
    return;
  }

  const existing = await prisma.campaignReminderBoard.findUnique({
    where: { campaignId: reminder.campaignId },
  });
  console.info(
    `[post-update] reminder board sending batch=${batchId} campaignId=${reminder.campaignId} slots=${String(reminder.slots.length)}`,
  );
  const delivered = await deliverReminderBoard({
    token: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    projectName: reminder.projectName,
    board:
      existing === null
        ? null
        : {
            chatId: existing.chatId,
            messageId: existing.messageId,
            lines: parseReminderBoardLines(existing.lines),
          },
    slots: reminder.slots,
  });
  if (!delivered.ok) {
    await markNoticeError(
      prisma,
      batchId,
      delivered.error,
      `kind=reminder campaignId=${reminder.campaignId}`,
    );
    return;
  }

  await prisma.campaignReminderBoard.upsert({
    where: { campaignId: reminder.campaignId },
    create: {
      campaignId: reminder.campaignId,
      chatId: delivered.next.chatId,
      messageId: delivered.next.messageId,
      lines: reminderBoardLinesToJson(delivered.next.lines),
      error: null,
    },
    update: {
      chatId: delivered.next.chatId,
      messageId: delivered.next.messageId,
      lines: reminderBoardLinesToJson(delivered.next.lines),
      error: null,
    },
  });
  await prisma.postStatusNotice.update({
    where: { batchId },
    data: { postedAt: new Date(), body: delivered.text, error: null },
  });
  const boardMessageId =
    delivered.next.messageId === null ? "" : String(delivered.next.messageId);
  console.warn(
    `[post-update] telegram board ok batch=${batchId} campaignId=${reminder.campaignId} telegramCalled=${String(delivered.telegramCalled)} messageId=${boardMessageId}`,
  );
}

/**
 * Sends one Telegram status for a Value batch, or closes any other non-reminder batch.
 * A Value post scheduled before the announce window is closed with no message.
 */
async function settleNonReminder(
  prisma: PrismaClient,
  env: ApiEnv,
  batchId: string,
  stored: readonly StoredSweepRow[],
): Promise<void> {
  const noticeRows = stored.map((row) => toNoticeRow(row));
  if (!isValuePostBatch(noticeRows)) {
    await markNoticePosted(prisma, batchId, "");
    console.warn(`[post-update] closed without chat message batch=${batchId}`);
    return;
  }

  const notBeforeMs = reminderAnnounceNotBeforeMs(processStartedAtMs, Date.now());
  const scheduledAts = noticeRows.map((row) => row.scheduledAt);
  if (!reminderBatchIsCurrent(scheduledAts, notBeforeMs)) {
    await markNoticePosted(prisma, batchId, "");
    console.warn(`[post-update] skipped old value status batch=${batchId}`);
    return;
  }

  const text = formatValuePostTelegram(noticeRows);
  if (text === null) {
    await markNoticePosted(prisma, batchId, "");
    console.warn(`[post-update] closed value batch with nothing to report batch=${batchId}`);
    return;
  }

  const sentCount = noticeRows.filter((row) => row.status === "SENT").length;
  const failedCount = noticeRows.filter((row) => row.status === "FAILED").length;
  console.info(
    `[post-update] value status sending batch=${batchId} sent=${String(sentCount)} failed=${String(failedCount)} chars=${String(text.length)}`,
  );
  const sent = await sendTelegramText(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text);
  if (!sent.ok) {
    await markNoticeError(prisma, batchId, sent.error, "kind=value");
    return;
  }

  await markNoticePosted(prisma, batchId, text);
  console.warn(
    `[post-update] telegram value ok batch=${batchId} messageId=${String(sent.messageId)} sent=${String(sentCount)} failed=${String(failedCount)}`,
  );
}

/**
 * Marks the batch finished so a later sweep does not send it again.
 */
async function markNoticePosted(
  prisma: PrismaClient,
  batchId: string,
  body: string,
): Promise<void> {
  await prisma.postStatusNotice.update({
    where: { batchId },
    data: { postedAt: new Date(), body, error: null },
  });
}

/**
 * Inserts the notice row, or re-claims it after a failed attempt goes stale.
 * Returns false when another sweep owns the batch or the notice was already sent.
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
  if (claimed.count === 0) {
    const reason = existing.error === null ? "" : ` error=${clipPostUpdateLog(existing.error)}`;
    console.info(`[post-update] retry waiting batch=${batchId}${reason}`);
  }
  return claimed.count > 0;
}

async function markNoticeError(
  prisma: PrismaClient,
  batchId: string,
  error: string,
  context: string,
): Promise<void> {
  await prisma.postStatusNotice.update({
    where: { batchId },
    data: { error, postedAt: null },
  });
  console.warn(
    `[post-update] not sent batch=${batchId} ${context} error=${clipPostUpdateLog(error)}`,
  );
}

/**
 * One-line error text for the sweep log. The database still stores the full Telegram error.
 */
function clipPostUpdateLog(error: string): string {
  const flat = error.replace(/\s+/gu, " ").trim();
  if (flat.length <= 300) {
    return flat;
  }
  return `${flat.slice(0, 300)}…`;
}

type StoredSweepRow = {
  id: string;
  groupName: string;
  status: PostUpdateRowStatus;
  error: string | null;
  copyText: string | null;
  operatorKind: "VALUE" | "REMINDER" | null;
  valueFormat: PostUpdateNoticeRow["valueFormat"];
  reminderFormat: PostUpdateNoticeRow["reminderFormat"];
  type: "POST" | "POLL";
  campaignId: string | null;
  scheduledAt: Date;
  project: { name: string };
  reminderTemplate: StoredBoardRow["reminderTemplate"];
};

/**
 * Maps a stored row into the Value Telegram formatter input.
 */
function toNoticeRow(row: StoredSweepRow): PostUpdateNoticeRow {
  return {
    groupName: row.groupName,
    status: row.status,
    error: row.error,
    copyText: row.copyText,
    operatorKind: row.operatorKind,
    valueFormat: row.valueFormat,
    reminderFormat: row.reminderFormat,
    slotName: null,
    scheduledAt: row.scheduledAt,
    projectName: row.project.name,
    legacyType: row.type,
  };
}

type StoredBoardRow = {
  id: string;
  campaignId: string | null;
  operatorKind: string | null;
  status: string;
  scheduledAt: Date;
  project: { name: string };
  reminderTemplate: {
    slotKey: string;
    sortOrder: number;
    scheduleRuleKind: string;
    dayOffset: number | null;
  } | null;
};

/**
 * Maps a database row into the pure collector input.
 */
function toBoardSource(row: StoredBoardRow): ReminderBatchSourceRow {
  return {
    id: row.id,
    campaignId: row.campaignId,
    operatorKind: row.operatorKind,
    status: row.status,
    scheduledAt: row.scheduledAt,
    projectName: row.project.name,
    slotKey: row.reminderTemplate?.slotKey ?? null,
    sortOrder: row.reminderTemplate?.sortOrder ?? null,
    scheduleRuleKind: row.reminderTemplate?.scheduleRuleKind ?? null,
    dayOffset: row.reminderTemplate?.dayOffset ?? null,
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return false;
  }
  const code = err.code;
  return code === "P2002";
}
