/**
 * Detects animated WebP stickers (ANIM chunk or VP8X animation flag).
 */

const RIFF = "RIFF";
const WEBP = "WEBP";

/**
 * Returns true when the buffer is an animated WebP (not supported for stickers).
 */
export function isAnimatedWebP(buffer: Buffer): boolean {
  if (buffer.length < 16) {
    return false;
  }
  if (buffer.toString("ascii", 0, 4) !== RIFF) {
    return false;
  }
  if (buffer.toString("ascii", 8, 12) !== WEBP) {
    return false;
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "ANIM") {
      return true;
    }
    if (chunkId === "VP8X" && chunkSize >= 4 && offset + 12 < buffer.length) {
      const flags = buffer[offset + 8];
      if ((flags & 0x02) !== 0) {
        return true;
      }
    }
    const padded = chunkSize + (chunkSize % 2);
    offset += 8 + padded;
    if (chunkSize === 0 && chunkId !== "VP8X") {
      break;
    }
  }
  return false;
}
