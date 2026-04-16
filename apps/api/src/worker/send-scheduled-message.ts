/**
 * pg-boss worker: send one ScheduledMessage (POST or POLL) via Baileys and update status.
 */

import { createClient } from "@supabase/supabase-js";
import type { PrismaClient, ScheduledMessage } from "@nmcas/db";
import type { WASocket } from "@whiskeysockets/baileys";
import type { ApiEnv } from "../env.js";
import type { WaConnectionPool } from "../wa/wa-pool.js";
import { parseSendScheduledMessageJobData, type SendScheduledMessageJobData } from "../types/send-scheduled-message.js";

const MAX_ERROR_LEN = 2000;
const MAX_NOTIFY_ERROR_IN_BODY = 800;

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

/**
 * Sends a single ops alert on the same project's Baileys socket (PRD §9 style).
 * Swallows errors so a notify failure never breaks the worker.
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
    const sock = waPool.getSocket(row.projectId);
    if (sock === undefined) {
      return;
    }
    const whenMyt = formatScheduledAtMyt(row.scheduledAt);
    const text = `[NMCAS] Failed to send scheduled message to ${row.groupName} at ${whenMyt} MYT. Error: ${truncateForNotifyBody(errorMessage)}`;
    await sock.sendMessage(jid, { text });
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
  await prisma.scheduledMessage.update({
    where: { id: row.id },
    data: {
      status: "FAILED",
      error: truncateError(message),
    },
  });
  await sendFailureWhatsAppAlert(env, waPool, row, message);
}

/**
 * Downloads post image bytes from the private post-media bucket (object path stored on the row).
 */
async function downloadPostImage(
  env: ApiEnv,
  objectPath: string,
): Promise<Buffer> {
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

/**
 * Sends WhatsApp content for a POST row (text and/or image).
 */
async function sendPostToWhatsApp(
  sock: WASocket,
  msg: ScheduledMessage,
  imageBuffer: Buffer | undefined,
): Promise<void> {
  const text = msg.copyText ?? "";
  if (imageBuffer !== undefined) {
    if (text.trim().length > 0) {
      await sock.sendMessage(msg.groupJid, {
        image: imageBuffer,
        caption: text,
      });
    } else {
      await sock.sendMessage(msg.groupJid, { image: imageBuffer });
    }
    return;
  }
  await sock.sendMessage(msg.groupJid, { text });
}

/**
 * Sends a native WhatsApp poll for a POLL row (`selectableCount` 1 = single answer, else multi).
 */
async function sendPollToWhatsApp(sock: WASocket, msg: ScheduledMessage): Promise<void> {
  const question = msg.pollQuestion?.trim() ?? "";
  const values = msg.pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
  if (question.length === 0 || values.length < 2) {
    throw new Error("Poll row is missing question or needs at least two options");
  }
  const selectableCount = msg.pollMultiSelect ? values.length : 1;
  await sock.sendMessage(msg.groupJid, {
    poll: {
      name: question,
      values,
      selectableCount,
    },
  });
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
      continue;
    }
    await processOneJob(prisma, env, waPool, parsed);
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
  if (row.status !== "PENDING") {
    return;
  }
  if (row.type !== "POST" && row.type !== "POLL") {
    await markFailedWithNotify(prisma, env, waPool, row, `Unsupported message type for worker: ${row.type}`);
    return;
  }

  const updated = await prisma.scheduledMessage.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status: "SENDING" },
  });
  if (updated.count === 0) {
    return;
  }

  const projectId = row.projectId;
  await waPool.start(projectId);
  const sock = waPool.getSocket(projectId);
  if (sock === undefined) {
    await markFailedWithNotify(prisma, env, waPool, row, "WhatsApp is not connected");
    return;
  }

  if (row.type === "POLL") {
    try {
      await sendPollToWhatsApp(sock, row);
    } catch (err) {
      const message = err instanceof Error ? err.message : "sendMessage failed";
      await markFailedWithNotify(prisma, env, waPool, row, message);
      return;
    }
    await prisma.scheduledMessage.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        error: null,
      },
    });
    return;
  }

  let imageBuffer: Buffer | undefined;
  if (row.imageUrl !== null && row.imageUrl.length > 0) {
    try {
      imageBuffer = await downloadPostImage(env, row.imageUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image download failed";
      await markFailedWithNotify(prisma, env, waPool, row, message);
      return;
    }
  }

  const text = row.copyText ?? "";
  if (text.length === 0 && imageBuffer === undefined) {
    await markFailedWithNotify(prisma, env, waPool, row, "Nothing to send (empty text and no image)");
    return;
  }

  try {
    await sendPostToWhatsApp(sock, row, imageBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "sendMessage failed";
    await markFailedWithNotify(prisma, env, waPool, row, message);
    return;
  }

  await prisma.scheduledMessage.update({
    where: { id: row.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      error: null,
    },
  });
}
