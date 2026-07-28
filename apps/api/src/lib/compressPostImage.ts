/**
 * Compresses post/reminder images before Storage upload or send-path caching.
 * Stickers must not use this helper (keep static WebP validation elsewhere).
 */

import sharp from "sharp";

/** Skip compress when under this byte size *and* within max edge (plan §4.2 / §8). */
const SKIP_MAX_BYTES = 400 * 1024;

/** Longest edge target and skip threshold (pixels). */
const MAX_EDGE_PX = 1600;

/** JPEG encode quality for post/reminder output. */
const JPEG_QUALITY = 80;

/**
 * Result of {@link compressPostImage}.
 * Agent 2 should cache/send using `buffer` + `mimetype` (do not trust path extension alone).
 */
export type CompressPostImageResult = {
  /** Bytes to store or send (original when skipped or when compress did not shrink). */
  buffer: Buffer;
  /** MIME type matching `buffer` (e.g. `image/jpeg` after encode). */
  mimetype: string;
  /**
   * `true` when the input was already small enough (≤400 KiB and longest edge ≤1600)
   * and no re-encode ran.
   */
  skipped: boolean;
};

/**
 * Best-effort MIME sniff from magic bytes. Falls back to `image/jpeg` when unknown
 * (common for posts; WhatsApp accepts JPEG broadly).
 */
export function sniffImageMimetype(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 6 &&
    buffer.toString("ascii", 0, 3) === "GIF" &&
    (buffer.toString("ascii", 3, 6) === "87a" || buffer.toString("ascii", 3, 6) === "89a")
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function longestEdge(width: number | undefined, height: number | undefined): number | null {
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return Math.max(width, height);
}

/**
 * Compresses a post or reminder image for smaller Storage objects and WhatsApp payloads.
 *
 * Policy (plan defaults: JPEG q80, max edge 1600):
 * 1. Skip when `input` ≤ 400 KiB **and** longest edge ≤ 1600 (metadata from sharp).
 *    If metadata fails, **attempt compress** (safer than storing an unknown large blob as-is).
 * 2. Else: EXIF `rotate()`, `resize` inside 1600×1600 without enlargement, JPEG quality 80.
 * 3. If encoded size ≥ input size, keep the original buffer and sniffed mimetype.
 *
 * @param input - Raw image bytes from multipart upload or Storage download.
 * @returns Compressed or original buffer, matching mimetype, and whether encode was skipped.
 * @throws When sharp cannot decode/encode the input (corrupt or non-image).
 */
export async function compressPostImage(input: Buffer): Promise<CompressPostImageResult> {
  if (input.byteLength === 0) {
    throw new Error("Empty image buffer");
  }

  const originalMimetype = sniffImageMimetype(input);

  let metaWidth: number | undefined;
  let metaHeight: number | undefined;
  let metadataOk = false;
  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    metaWidth = meta.width;
    metaHeight = meta.height;
    metadataOk = true;
  } catch {
    // Metadata failed: prefer attempting compress rather than a silent skip of unknown bytes.
    metadataOk = false;
  }

  if (metadataOk) {
    const edge = longestEdge(metaWidth, metaHeight);
    if (edge !== null && input.byteLength <= SKIP_MAX_BYTES && edge <= MAX_EDGE_PX) {
      return {
        buffer: input,
        mimetype: originalMimetype,
        skipped: true,
      };
    }
  }

  let encoded: Buffer;
  try {
    encoded = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({
        width: MAX_EDGE_PX,
        height: MAX_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown sharp error";
    throw new Error(`Image compression failed: ${detail}`);
  }

  if (encoded.byteLength >= input.byteLength) {
    return {
      buffer: input,
      mimetype: originalMimetype,
      skipped: false,
    };
  }

  return {
    buffer: encoded,
    mimetype: "image/jpeg",
    skipped: false,
  };
}
