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

/** WhatsApp `sendMessage` has no built-in timeout; slow networks / cold Render can hang indefinitely. */
const SEND_TO_WHATSAPP_TIMEOUT_MS = 60_000;

/**
 * Thrown specifically when `withTimeout` fires — distinguishes a hung-socket timeout
 * from a genuine WhatsApp error so the worker can reset to PENDING instead of FAILED.
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
  const sock = waPool.getSocket(projectId);

  /**
   * Socket is undefined during Baileys' reconnect backoff (e.g. after a 440 connectionReplaced).
   * Do NOT mark FAILED — reset to PENDING so the rescue sweep retries once WA is back up.
   */
  if (sock === undefined) {
    console.warn(
      `[send-worker] WA socket not ready — resetting to PENDING for retry id=${row.id}`,
    );
    await prisma.scheduledMessage.updateMany({
      where: { id: row.id, status: { in: ["PENDING", "SENDING"] } },
      data: { status: "PENDING", error: null },
    });
    return;
  }

  /**
   * Pre-send socket health check. Baileys may return a socket whose underlying WebSocket TCP
   * connection was dropped by the remote peer without yet emitting a `connection.update` close
   * event (TCP half-open). Attempting `sendMessage` on a closed socket hangs until our timeout.
   * Detect this early: reset to PENDING so the rescue sweep retries after WA reconnects.
   * Do NOT call forceRestart() here — that creates a 440 connectionReplaced loop by reconnecting
   * immediately while the WA server may still see the old session as live.
   */
  if (sock.ws.isClosed) {
    console.warn(
      `[send-worker] socket is closed before send — resetting to PENDING for retry id=${row.id}`,
    );
    await prisma.scheduledMessage.updateMany({
      where: { id: row.id, status: { in: ["PENDING", "SENDING"] } },
      data: { status: "PENDING", error: null },
    });
    return;
  }

  if (row.type === "POLL") {
    try {
      await withTimeout(
        sendPollToWhatsApp(sock, row),
        SEND_TO_WHATSAPP_TIMEOUT_MS,
        "WhatsApp poll sendMessage",
      );
    } catch (err) {
      if (err instanceof WaSendTimeoutError) {
        console.warn(
          `[send-worker] poll send timed out — resetting to PENDING, Baileys will self-heal id=${row.id}`,
        );
        await prisma.scheduledMessage.updateMany({
          where: { id: row.id, status: { in: ["PENDING", "SENDING"] } },
          data: { status: "PENDING", error: null },
        });
        return;
      }
      const message = err instanceof Error ? err.message : "sendMessage failed";
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
    await withTimeout(
      sendPostToWhatsApp(sock, row, imageBuffer),
      SEND_TO_WHATSAPP_TIMEOUT_MS,
      "WhatsApp post sendMessage",
    );
  } catch (err) {
    if (err instanceof WaSendTimeoutError) {
      console.warn(
        `[send-worker] post send timed out — resetting to PENDING, Baileys will self-heal id=${row.id}`,
      );
      await prisma.scheduledMessage.updateMany({
        where: { id: row.id, status: { in: ["PENDING", "SENDING"] } },
        data: { status: "PENDING", error: null },
      });
      return;
    }
    const message = err instanceof Error ? err.message : "sendMessage failed";
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
