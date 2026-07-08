/**
 * pg-boss worker: send one ScheduledMessage via whatsmeow-node and update status.
 * Routes by P7 `operatorKind` + format; falls back to legacy `type` POST/POLL when `operatorKind` is null.
 */

import { createClient } from "@supabase/supabase-js";
import type { PrismaClient, ScheduledMessage } from "@nmcas/db";
import type { WaManager } from "../wa/wa-manager.js";
import type { ApiEnv } from "../env.js";
import type { WaConnectionPool } from "../wa/wa-pool.js";
import { parseSendScheduledMessageJobData, type SendScheduledMessageJobData } from "../types/send-scheduled-message.js";

const MAX_ERROR_LEN = 2000;
const MAX_NOTIFY_ERROR_IN_BODY = 800;

const MEDIA_PREFIXES = ["posts", "reminders", "stickers"] as const;

/** WhatsApp send has no built-in timeout; slow networks / cold Render can hang indefinitely. */
const SEND_TO_WHATSAPP_TIMEOUT_MS = 120_000;

/**
 * Thrown specifically when `withTimeout` fires — distinguishes a hung send
 * from a genuine WhatsApp error so the worker can mark FAILED instead of retrying.
 */
class WaSendTimeoutError extends Error {
  constructor(ms: number, label: string) {
    super(`${label} timed out after ${String(ms)}ms`);
    this.name = "WaSendTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = globalThis.setTimeout(() => {
      reject(new WaSendTimeoutError(ms, label));
    }, ms);
    void promise.then(
      (v) => {
        globalThis.clearTimeout(t);
        resolve(v);
      },
      (err: unknown) => {
        globalThis.clearTimeout(t);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

function truncateError(message: string): string {
  if (message.length <= MAX_ERROR_LEN) {
    return message;
  }
  return `${message.slice(0, MAX_ERROR_LEN)}…`;
}

function truncateForNotifyBody(message: string): string {
  if (message.length <= MAX_NOTIFY_ERROR_IN_BODY) {
    return message;
  }
  return `${message.slice(0, MAX_NOTIFY_ERROR_IN_BODY)}…`;
}

function formatScheduledAtMyt(d: Date): string {
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function guessImageMimetype(objectPath: string): string {
  const lower = objectPath.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/jpeg";
}

function isAllowedMediaPath(objectPath: string, projectId: string): boolean {
  return MEDIA_PREFIXES.some((prefix) => objectPath.startsWith(`${prefix}/${projectId}/`));
}

/**
 * Sends a single ops alert on the same project's WhatsApp client.
 */
async function sendFailureWhatsAppAlert(
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  errorMessage: string,
): Promise<void> {
  const msisdn = env.NMCAS_FAILURE_NOTIFY_MSISDN;
  const jid = `${msisdn}@s.whatsapp.net`;
  try {
    await waPool.start(row.projectId);
    if (!(await waPool.isSendReady(row.projectId))) {
      return;
    }
    const wa = waPool.getManager(row.projectId);
    const whenMyt = formatScheduledAtMyt(row.scheduledAt);
    const text = `[NMCAS] Failed to send scheduled message to ${row.groupName} at ${whenMyt} MYT. Error: ${truncateForNotifyBody(errorMessage)}`;
    await wa.sendDirectText(jid, text);
  } catch {
    /* ignore — do not fail the job handler because alert delivery failed */
  }
}

/**
 * Persists `FAILED` and pings the configured MSISDN on WhatsApp for that project.
 */
async function markFailedWithNotify(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  message: string,
): Promise<void> {
  const result = await prisma.scheduledMessage.updateMany({
    where: {
      id: row.id,
      status: { in: ["PENDING", "SENDING"] },
    },
    data: {
      status: "FAILED",
      error: truncateError(message),
    },
  });
  if (result.count === 0) {
    return;
  }
  await sendFailureWhatsAppAlert(env, waPool, row, message);
}

async function markSent(prisma: PrismaClient, rowId: string): Promise<void> {
  const result = await prisma.scheduledMessage.updateMany({
    where: { id: rowId, status: "SENDING" },
    data: {
      status: "SENT",
      sentAt: new Date(),
      error: null,
    },
  });
  if (result.count === 0) {
    console.warn(`[send-worker] skip SENT update (row no longer SENDING) id=${rowId}`);
  }
}

/**
 * Downloads media bytes from the private bucket (`posts/`, `reminders/`, `stickers/`).
 */
async function downloadMediaAsset(env: ApiEnv, objectPath: string, projectId: string): Promise<Buffer> {
  if (!isAllowedMediaPath(objectPath, projectId)) {
    throw new Error(`Invalid media path for project: ${objectPath}`);
  }
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.storage
    .from(env.NMCAS_POST_MEDIA_BUCKET)
    .download(objectPath);
  if (error !== null || data === null) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

async function runSendWithTimeout(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  label: string,
  sendFn: () => Promise<void>,
): Promise<boolean> {
  try {
    await withTimeout(sendFn(), SEND_TO_WHATSAPP_TIMEOUT_MS, label);
    return true;
  } catch (err) {
    if (err instanceof WaSendTimeoutError) {
      const timeoutMsg = `WhatsApp send timed out after ${String(SEND_TO_WHATSAPP_TIMEOUT_MS / 1000)}s — the message may already have been delivered. Check the group and use Re-queue if it was not sent.`;
      console.warn(`[send-worker] ${label} timed out — marking FAILED (may have sent) id=${row.id}`);
      await markFailedWithNotify(prisma, env, waPool, row, timeoutMsg);
      return false;
    }
    const message = err instanceof Error ? err.message : "send failed";
    await markFailedWithNotify(prisma, env, waPool, row, message);
    return false;
  }
}

async function sendPollRow(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  wa: WaManager,
): Promise<void> {
  const question = row.pollQuestion?.trim() ?? "";
  const values = row.pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
  if (question.length === 0 || values.length < 2) {
    await markFailedWithNotify(prisma, env, waPool, row, "Poll row is missing question or needs at least two options");
    return;
  }
  const selectableCount = row.pollMultiSelect ? values.length : 1;
  const ok = await runSendWithTimeout(prisma, env, waPool, row, "WhatsApp poll send", () =>
    wa.sendPoll(row.groupJid, question, values, selectableCount),
  );
  if (ok) {
    await markSent(prisma, row.id);
  }
}

async function sendPostRow(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  wa: WaManager,
  text: string,
  imageUrl: string | null,
  requireCaption: boolean,
): Promise<void> {
  const trimmedText = text.trim();
  let imageBuffer: Buffer | undefined;
  let imageMimetype = "image/jpeg";

  if (imageUrl !== null && imageUrl.length > 0) {
    try {
      imageBuffer = await downloadMediaAsset(env, imageUrl, row.projectId);
      imageMimetype = guessImageMimetype(imageUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image download failed";
      await markFailedWithNotify(prisma, env, waPool, row, message);
      return;
    }
  }

  if (requireCaption && trimmedText.length === 0) {
    await markFailedWithNotify(prisma, env, waPool, row, "Reminder image row is missing caption copyText");
    return;
  }
  if (trimmedText.length === 0 && imageBuffer === undefined) {
    await markFailedWithNotify(prisma, env, waPool, row, "Nothing to send (empty text and no image)");
    return;
  }

  const ok = await runSendWithTimeout(prisma, env, waPool, row, "WhatsApp post send", () =>
    wa.sendPost(row.groupJid, trimmedText, imageBuffer, imageMimetype),
  );
  if (ok) {
    await markSent(prisma, row.id);
  }
}

async function sendTextRow(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  wa: WaManager,
  text: string,
  emptyMessage: string,
): Promise<void> {
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    await markFailedWithNotify(prisma, env, waPool, row, emptyMessage);
    return;
  }
  const ok = await runSendWithTimeout(prisma, env, waPool, row, "WhatsApp text send", () =>
    wa.sendPost(row.groupJid, trimmedText, undefined, "image/jpeg"),
  );
  if (ok) {
    await markSent(prisma, row.id);
  }
}

async function sendStickerRow(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  wa: WaManager,
  stickerUrl: string,
): Promise<void> {
  let stickerBuffer: Buffer;
  try {
    stickerBuffer = await downloadMediaAsset(env, stickerUrl, row.projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sticker download failed";
    await markFailedWithNotify(prisma, env, waPool, row, message);
    return;
  }

  const ok = await runSendWithTimeout(prisma, env, waPool, row, "WhatsApp sticker send", () =>
    wa.sendSticker(row.groupJid, stickerBuffer),
  );
  if (ok) {
    await markSent(prisma, row.id);
  }
}

async function sendP7Message(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  wa: WaManager,
): Promise<void> {
  if (row.operatorKind === "VALUE") {
    if (row.valueFormat === "POLL") {
      await sendPollRow(prisma, env, waPool, row, wa);
      return;
    }
    if (row.valueFormat === "TEXT_ONLY") {
      await sendTextRow(prisma, env, waPool, row, wa, row.copyText ?? "", "Value text-only row is missing copyText");
      return;
    }
    if (row.valueFormat === "IMAGE_CAPTION") {
      const imageUrl = row.imageUrl?.trim() ?? "";
      if (imageUrl.length === 0) {
        await markFailedWithNotify(prisma, env, waPool, row, "Value image+caption row is missing imageUrl");
        return;
      }
      await sendPostRow(prisma, env, waPool, row, wa, row.copyText ?? "", imageUrl, false);
      return;
    }
    await markFailedWithNotify(
      prisma,
      env,
      waPool,
      row,
      `Unsupported value format for worker: ${row.valueFormat ?? "null"}`,
    );
    return;
  }

  if (row.operatorKind === "REMINDER") {
    if (row.reminderFormat === "TEXT") {
      await sendTextRow(prisma, env, waPool, row, wa, row.copyText ?? "", "Reminder text row is missing copyText");
      return;
    }
    if (row.reminderFormat === "IMAGE") {
      const imageUrl = row.imageUrl?.trim() ?? "";
      if (imageUrl.length === 0) {
        await markFailedWithNotify(prisma, env, waPool, row, "Reminder image row is missing imageUrl");
        return;
      }
      await sendPostRow(prisma, env, waPool, row, wa, row.copyText ?? "", imageUrl, true);
      return;
    }
    if (row.reminderFormat === "STICKER") {
      const stickerUrl = row.stickerUrl?.trim() ?? "";
      if (stickerUrl.length === 0) {
        await markFailedWithNotify(prisma, env, waPool, row, "Reminder sticker row is missing stickerUrl");
        return;
      }
      await sendStickerRow(prisma, env, waPool, row, wa, stickerUrl);
      return;
    }
    await markFailedWithNotify(
      prisma,
      env,
      waPool,
      row,
      `Unsupported reminder format for worker: ${row.reminderFormat ?? "null"}`,
    );
    return;
  }

  await markFailedWithNotify(
    prisma,
    env,
    waPool,
    row,
    `Unsupported operator kind for worker: ${row.operatorKind ?? "null"}`,
  );
}

async function sendLegacyMessage(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  row: ScheduledMessage,
  wa: WaManager,
): Promise<void> {
  if (row.type === "POLL") {
    await sendPollRow(prisma, env, waPool, row, wa);
    return;
  }
  if (row.type === "POST") {
    await sendPostRow(prisma, env, waPool, row, wa, row.copyText ?? "", row.imageUrl, false);
    return;
  }
  await markFailedWithNotify(
    prisma,
    env,
    waPool,
    row,
    "Unsupported message: missing operatorKind and invalid legacy type",
  );
}

/**
 * Processes one pg-boss job batch for `send-scheduled-message`.
 */
export async function handleSendScheduledMessageJobs(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  jobs: Array<{ id: string; data: unknown }>,
): Promise<void> {
  for (const job of jobs) {
    const parsed = parseSendScheduledMessageJobData(job.data);
    if (parsed === null) {
      console.error(
        `[send-worker] malformed job payload (id=${job.id}), skipping:`,
        JSON.stringify(job.data),
      );
      continue;
    }
    try {
      await processOneJob(prisma, env, waPool, parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[send-worker] unhandled error job=${job.id} scheduledMessageId=${parsed.scheduledMessageId}: ${msg}`,
      );
      const row = await prisma.scheduledMessage.findUnique({
        where: { id: parsed.scheduledMessageId },
      });
      if (row !== null) {
        await markFailedWithNotify(prisma, env, waPool, row, `Worker crashed: ${msg}`);
      }
    }
  }
}

async function processOneJob(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  payload: SendScheduledMessageJobData,
): Promise<void> {
  const row = await prisma.scheduledMessage.findUnique({
    where: { id: payload.scheduledMessageId },
  });
  if (row === null) {
    return;
  }
  if (row.status !== "PENDING" && row.status !== "SENDING") {
    return;
  }

  if (row.operatorKind === null && row.type !== "POST" && row.type !== "POLL") {
    await markFailedWithNotify(
      prisma,
      env,
      waPool,
      row,
      "Unsupported message: missing operatorKind and invalid legacy type",
    );
    return;
  }

  if (row.status === "PENDING") {
    const updated = await prisma.scheduledMessage.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (updated.count === 0) {
      return;
    }
  } else {
    console.warn(
      `[send-worker] retrying row stuck in SENDING id=${row.id} projectId=${row.projectId}`,
    );
  }

  const formatLabel =
    row.operatorKind === "VALUE"
      ? row.valueFormat
      : row.operatorKind === "REMINDER"
        ? row.reminderFormat
        : null;
  console.warn(
    `[send-worker] start id=${row.id} type=${row.type} operatorKind=${row.operatorKind ?? "null"} format=${formatLabel ?? "null"} projectId=${row.projectId}`,
  );

  const projectId = row.projectId;
  await waPool.start(projectId);
  const wa = waPool.getManager(projectId);

  if (!(await waPool.isSendReady(projectId))) {
    console.warn(
      `[send-worker] WA not ready — resetting to PENDING for retry id=${row.id}`,
    );
    await prisma.scheduledMessage.updateMany({
      where: { id: row.id, status: { in: ["PENDING", "SENDING"] } },
      data: { status: "PENDING", error: null },
    });
    return;
  }

  if (row.operatorKind !== null) {
    await sendP7Message(prisma, env, waPool, row, wa);
    return;
  }

  await sendLegacyMessage(prisma, env, waPool, row, wa);
}
