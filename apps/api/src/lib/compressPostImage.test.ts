import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { compressPostImage, sniffImageMimetype } from "./compressPostImage.js";

describe("sniffImageMimetype", () => {
  it("detects JPEG magic bytes", async () => {
    const buf = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    assert.equal(sniffImageMimetype(buf), "image/jpeg");
  });

  it("detects PNG magic bytes", async () => {
    const buf = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    assert.equal(sniffImageMimetype(buf), "image/png");
  });

  it("falls back to image/jpeg for unknown bytes", () => {
    assert.equal(sniffImageMimetype(Buffer.from("not-an-image")), "image/jpeg");
  });
});

describe("compressPostImage", () => {
  it("skips when already small and within max edge", async () => {
    const input = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 80, g: 120, b: 160 } },
    })
      .png()
      .toBuffer();
    assert.ok(input.byteLength <= 400 * 1024);

    const result = await compressPostImage(input);
    assert.equal(result.skipped, true);
    assert.equal(result.buffer.byteLength, input.byteLength);
    assert.ok(result.buffer.equals(input));
    assert.equal(result.mimetype, "image/png");
  });

  it("shrinks oversized images to JPEG under the input size", async () => {
    const noise = Buffer.alloc(2000 * 2000 * 3);
    for (let i = 0; i < noise.length; i += 1) {
      noise[i] = (i * 37 + 11) % 256;
    }
    const input = await sharp(noise, {
      raw: { width: 2000, height: 2000, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    assert.ok(input.byteLength > 400 * 1024);

    const result = await compressPostImage(input);
    assert.equal(result.skipped, false);
    assert.equal(result.mimetype, "image/jpeg");
    assert.ok(result.buffer.byteLength < input.byteLength);
    assert.equal(sniffImageMimetype(result.buffer), "image/jpeg");

    const outMeta = await sharp(result.buffer).metadata();
    const outEdge = Math.max(outMeta.width ?? 0, outMeta.height ?? 0);
    assert.ok(outEdge <= 1600);
  });

  it("keeps original when compressed output is not smaller", async () => {
    // Flat PNG with longest edge > 1600 forces encode; JPEG of flat color is often larger.
    const input = await sharp({
      create: {
        width: 1610,
        height: 10,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .png()
      .toBuffer();
    assert.ok(input.byteLength <= 400 * 1024);

    const result = await compressPostImage(input);
    assert.equal(result.skipped, false);
    assert.ok(result.buffer.equals(input));
    assert.equal(result.mimetype, "image/png");
    assert.ok(result.buffer.byteLength <= input.byteLength);
  });

  it("rejects corrupt non-image input with a clear error", async () => {
    await assert.rejects(
      () => compressPostImage(Buffer.from("this is not an image file")),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Image compression failed/i);
        return true;
      },
    );
  });
});
