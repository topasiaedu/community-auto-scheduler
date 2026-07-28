/**
 * Outbound WhatsApp sends via whatsmeow-node with `messageSecret` for community groups.
 */

import { mkdtemp, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SendResponse, WhatsmeowClient } from "@whatsmeow-node/whatsmeow-node";
import { createMessageContextInfo } from "./message-secret.js";

/**
 * Sends plain text to a group JID with `messageSecret` so reactions work in community groups.
 * @returns WhatsApp `SendResponse` (stanza id for receipt matching).
 */
export async function sendGroupText(
  client: WhatsmeowClient,
  groupJid: string,
  text: string,
): Promise<SendResponse> {
  return client.sendRawMessage(groupJid, {
    conversation: text,
    messageContextInfo: createMessageContextInfo(),
  });
}

/**
 * Uploads an image from disk and sends it to a group with caption and `messageSecret`.
 * @returns WhatsApp `SendResponse` (stanza id for receipt matching).
 */
export async function sendGroupImage(
  client: WhatsmeowClient,
  groupJid: string,
  imageFilePath: string,
  caption: string,
  mimetype: string,
): Promise<SendResponse> {
  const media = await client.uploadMedia(imageFilePath, "image");
  const imageMessage: Record<string, unknown> = {
    URL: media.URL,
    directPath: media.directPath,
    mediaKey: media.mediaKey,
    fileEncSHA256: media.fileEncSHA256,
    fileSHA256: media.fileSHA256,
    fileLength: String(media.fileLength),
    mimetype,
  };
  if (caption.trim().length > 0) {
    imageMessage.caption = caption;
  }
  return client.sendRawMessage(groupJid, {
    imageMessage,
    messageContextInfo: createMessageContextInfo(),
  });
}

/**
 * Writes a buffer to a temp file, runs `fn`, then deletes the file.
 */
export async function withTempImageFile<T>(
  imageBuffer: Buffer,
  mimetype: string,
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const ext = mimetype.includes("png") ? ".png" : mimetype.includes("webp") ? ".webp" : ".jpg";
  const dir = await mkdtemp(join(tmpdir(), "nmcas-wa-"));
  const filePath = join(dir, `post${ext}`);
  await writeFile(filePath, imageBuffer);
  try {
    return await fn(filePath);
  } finally {
    try {
      await unlink(filePath);
    } catch {
      /* ignore */
    }
  }
}

/** Standard static WebP sticker dimensions per WhatsApp SOP. */
const STICKER_WIDTH = 512;
const STICKER_HEIGHT = 512;

/**
 * Uploads a static WebP sticker and sends it to a group with `messageSecret` (no caption).
 * @returns WhatsApp `SendResponse` (stanza id for receipt matching).
 */
export async function sendGroupSticker(
  client: WhatsmeowClient,
  groupJid: string,
  stickerFilePath: string,
): Promise<SendResponse> {
  const media = await client.uploadMedia(stickerFilePath, "image");
  const stickerMessage: Record<string, unknown> = {
    URL: media.URL,
    directPath: media.directPath,
    mediaKey: media.mediaKey,
    fileEncSHA256: media.fileEncSHA256,
    fileSHA256: media.fileSHA256,
    fileLength: String(media.fileLength),
    mimetype: "image/webp",
    width: STICKER_WIDTH,
    height: STICKER_HEIGHT,
  };
  return client.sendRawMessage(groupJid, {
    stickerMessage,
    messageContextInfo: createMessageContextInfo(),
  });
}

/**
 * Sends a native WhatsApp poll (`sendPollCreation` includes poll message secret in whatsmeow).
 * @returns WhatsApp `SendResponse` (stanza id for receipt matching).
 */
export async function sendGroupPoll(
  client: WhatsmeowClient,
  groupJid: string,
  question: string,
  options: string[],
  selectableCount: number,
): Promise<SendResponse> {
  return client.sendPollCreation(groupJid, question, options, selectableCount);
}
