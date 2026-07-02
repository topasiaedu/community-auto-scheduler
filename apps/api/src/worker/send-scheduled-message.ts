/**
 * pg-boss worker: send one ScheduledMessage (POST or POLL) via whatsmeow-node and update status.
 */

import { createClient } from "@supabase/supabase-js";
import type { PrismaClient, ScheduledMessage } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import type { WaConnectionPool } from "../wa/wa-pool.js";
import { parseSendScheduledMessageJobData, type SendScheduledMessageJobData } from "../types/send-scheduled-message.js";

const MAX_ERROR_LEN = 2000;
const MAX_NOTIFY_ERROR_IN_BODY = 800;

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

/**
 * Downloads post image bytes from the private post-media bucket (object path stored on the row).
 */
async function downloadPostImage(env: ApiEnv, objectPath: string): Promise<Buffer> {
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
  if (row.type !== "POST" && row.type !== "POLL") {
    await markFailedWithNotify(prisma, env, waPool, row, `Unsupported message type for worker: ${row.type}`);
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

  console.warn(`[send-worker] start id=${row.id} type=${row.type} projectId=${row.projectId}`);

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

  if (row.type === "POLL") {
    const question = row.pollQuestion?.trim() ?? "";
    const values = row.pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (question.length === 0 || values.length < 2) {
      await markFailedWithNotify(prisma, env, waPool, row, "Poll row is missing question or needs at least two options");
      return;
    }
    const selectableCount = row.pollMultiSelect ? values.length : 1;
    try {
      await withTimeout(
        wa.sendPoll(row.groupJid, question, values, selectableCount),
        SEND_TO_WHATSAPP_TIMEOUT_MS,
        "WhatsApp poll send",
      );
    } catch (err) {
      if (err instanceof WaSendTimeoutError) {
        const timeoutMsg = `WhatsApp send timed out after ${String(SEND_TO_WHATSAPP_TIMEOUT_MS / 1000)}s — the message may already have been delivered. Check the group and use Re-queue if it was not sent.`;
        console.warn(
          `[send-worker] poll send timed out — marking FAILED (may have sent) id=${row.id}`,
        );
        await markFailedWithNotify(prisma, env, waPool, row, timeoutMsg);
        return;
      }
      const message = err instanceof Error ? err.message : "send failed";
      await markFailedWithNotify(prisma, env, waPool, row, message);
      return;
    }
    const sentPoll = await prisma.scheduledMessage.updateMany({
      where: { id: row.id, status: "SENDING" },
      data: {
        status: "SENT",
        sentAt: new Date(),
        error: null,
      },
    });
    if (sentPoll.count === 0) {
      console.warn(`[send-worker] skip SENT update (row no longer SENDING) id=${row.id}`);
    }
    return;
  }

  let imageBuffer: Buffer | undefined;
  let imageMimetype = "image/jpeg";
  if (row.imageUrl !== null && row.imageUrl.length > 0) {
    try {
      imageBuffer = await downloadPostImage(env, row.imageUrl);
      imageMimetype = guessImageMimetype(row.imageUrl);
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
    await withTimeout(
      wa.sendPost(row.groupJid, text, imageBuffer, imageMimetype),
      SEND_TO_WHATSAPP_TIMEOUT_MS,
      "WhatsApp post send",
    );
  } catch (err) {
    if (err instanceof WaSendTimeoutError) {
      const timeoutMsg = `WhatsApp send timed out after ${String(SEND_TO_WHATSAPP_TIMEOUT_MS / 1000)}s — the message may already have been delivered. Check the group and use Re-queue if it was not sent.`;
      console.warn(
        `[send-worker] post send timed out — marking FAILED (may have sent) id=${row.id}`,
      );
      await markFailedWithNotify(prisma, env, waPool, row, timeoutMsg);
      return;
    }
    const message = err instanceof Error ? err.message : "send failed";
    await markFailedWithNotify(prisma, env, waPool, row, message);
    return;
  }

  const sentPost = await prisma.scheduledMessage.updateMany({
    where: { id: row.id, status: "SENDING" },
    data: {
      status: "SENT",
      sentAt: new Date(),
      error: null,
    },
  });
  if (sentPost.count === 0) {
    console.warn(`[send-worker] skip SENT update (row no longer SENDING) id=${row.id}`);
  }
}
