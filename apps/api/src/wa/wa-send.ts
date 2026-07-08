/**
 * Outbound WhatsApp sends via whatsmeow-node with `messageSecret` for community groups.
 */

import { mkdtemp, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WhatsmeowClient } from "@whatsmeow-node/whatsmeow-node";
import { createMessageContextInfo } from "./message-secret.js";

/**
 * Sends plain text to a group JID with `messageSecret` so reactions work in community groups.
 */
export async function sendGroupText(client: WhatsmeowClient, groupJid: string, text: string): Promise<void> {
  await client.sendRawMessage(groupJid, {
    conversation: text,
    messageContextInfo: createMessageContextInfo(),
  });
}

/**
 * Uploads an image from disk and sends it to a group with caption and `messageSecret`.
 */
export async function sendGroupImage(
  client: WhatsmeowClient,
  groupJid: string,
  imageFilePath: string,
  caption: string,
  mimetype: string,
): Promise<void> {
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
  await client.sendRawMessage(groupJid, {
    imageMessage,
    messageContextInfo: createMessageContextInfo(),
  });
}

/**
 * Writes a buffer to a temp file, runs `fn`, then deletes the file.
 */
export async function withTempImageFile(
  imageBuffer: Buffer,
  mimetype: string,
  fn: (filePath: string) => Promise<void>,
): Promise<void> {
  const ext = mimetype.includes("png") ? ".png" : mimetype.includes("webp") ? ".webp" : ".jpg";
  const dir = await mkdtemp(join(tmpdir(), "nmcas-wa-"));
  const filePath = join(dir, `post${ext}`);
  await writeFile(filePath, imageBuffer);
  try {
    await fn(filePath);
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
 */
export async function sendGroupSticker(
  client: WhatsmeowClient,
  groupJid: string,
  stickerFilePath: string,
): Promise<void> {
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
  await client.sendRawMessage(groupJid, {
    stickerMessage,
    messageContextInfo: createMessageContextInfo(),
  });
}

/**
 * Sends a native WhatsApp poll (`sendPollCreation` includes poll message secret in whatsmeow).
 */
export async function sendGroupPoll(
  client: WhatsmeowClient,
  groupJid: string,
  question: string,
  options: string[],
  selectableCount: number,
): Promise<void> {
  await client.sendPollCreation(groupJid, question, options, selectableCount);
}
