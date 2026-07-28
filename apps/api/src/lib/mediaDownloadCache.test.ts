import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MediaDownloadCache,
  MEDIA_CACHE_MAX_ENTRIES,
  MEDIA_CACHE_MAX_TOTAL_BYTES,
  MEDIA_CACHE_TTL_MS,
} from "./mediaDownloadCache.js";

describe("MediaDownloadCache constants", () => {
  it("documents plan caps (32 entries, 32 MiB, 1h TTL)", () => {
    assert.equal(MEDIA_CACHE_MAX_ENTRIES, 32);
    assert.equal(MEDIA_CACHE_MAX_TOTAL_BYTES, 32 * 1024 * 1024);
    assert.equal(MEDIA_CACHE_TTL_MS, 60 * 60 * 1000);
  });
});

describe("MediaDownloadCache.getOrLoad", () => {
  it("calls loader once for sequential same-key loads", async () => {
    const cache = new MediaDownloadCache({ maxEntries: 8, maxTotalBytes: 1024 * 1024 });
    let loaderCalls = 0;
    const path = "posts/proj/a.jpg";
    const buf = Buffer.from("image-bytes-a");

    const loader = async (): Promise<{ buffer: Buffer; mimetype: string }> => {
      loaderCalls += 1;
      return { buffer: buf, mimetype: "image/jpeg" };
    };

    const first = await cache.getOrLoad(path, loader);
    const second = await cache.getOrLoad(path, loader);

    assert.equal(loaderCalls, 1);
    assert.equal(first.mimetype, "image/jpeg");
    assert.ok(first.buffer.equals(buf));
    assert.ok(second.buffer.equals(buf));
    assert.equal(cache.size, 1);
  });

  it("coalesces parallel getOrLoad for the same path into one loader call", async () => {
    const cache = new MediaDownloadCache({ maxEntries: 8, maxTotalBytes: 1024 * 1024 });
    let loaderCalls = 0;
    const path = "posts/proj/fanout.jpg";
    const buf = Buffer.from("shared-fanout-bytes");

    const loader = async (): Promise<{ buffer: Buffer; mimetype: string }> => {
      loaderCalls += 1;
      // Yield so parallel callers attach to the same in-flight Promise.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      return { buffer: buf, mimetype: "image/jpeg" };
    };

    const [a, b, c] = await Promise.all([
      cache.getOrLoad(path, loader),
      cache.getOrLoad(path, loader),
      cache.getOrLoad(path, loader),
    ]);

    assert.equal(loaderCalls, 1);
    assert.ok(a.buffer.equals(buf));
    assert.ok(b.buffer.equals(buf));
    assert.ok(c.buffer.equals(buf));
    assert.equal(cache.size, 1);
  });

  it("evicts least-recently-used when over max entries", async () => {
    const cache = new MediaDownloadCache({ maxEntries: 2, maxTotalBytes: 1024 * 1024 });
    let calls = 0;

    const makeLoader = (label: string) => {
      return async (): Promise<{ buffer: Buffer; mimetype: string }> => {
        calls += 1;
        return { buffer: Buffer.from(label), mimetype: "image/jpeg" };
      };
    };

    await cache.getOrLoad("path/a", makeLoader("a"));
    await cache.getOrLoad("path/b", makeLoader("b"));
    assert.equal(cache.size, 2);

    // Insert third → evict oldest (path/a).
    await cache.getOrLoad("path/c", makeLoader("c"));
    assert.equal(cache.size, 2);
    assert.equal(cache.get("path/a"), undefined);
    assert.ok(cache.get("path/b") !== undefined);
    assert.ok(cache.get("path/c") !== undefined);

    // Reload a → loader runs again.
    const before = calls;
    await cache.getOrLoad("path/a", makeLoader("a2"));
    assert.equal(calls, before + 1);
  });

  it("evicts until under max total bytes", async () => {
    const cache = new MediaDownloadCache({
      maxEntries: 32,
      maxTotalBytes: 100,
    });

    await cache.getOrLoad("big/one", async () => ({
      buffer: Buffer.alloc(60, 1),
      mimetype: "image/jpeg",
    }));
    await cache.getOrLoad("big/two", async () => ({
      buffer: Buffer.alloc(60, 2),
      mimetype: "image/jpeg",
    }));

    // 60 + 60 = 120 > 100 → oldest (big/one) evicted; only big/two remains.
    assert.equal(cache.size, 1);
    assert.equal(cache.get("big/one"), undefined);
    assert.ok(cache.get("big/two") !== undefined);
    assert.ok(cache.totalByteLength <= 100);
  });

  it("forces reload after TTL expiry (injectable clock)", async () => {
    let nowMs = 1_000_000;
    const cache = new MediaDownloadCache({
      maxEntries: 8,
      maxTotalBytes: 1024 * 1024,
      ttlMs: 1_000,
      now: () => nowMs,
    });

    let loaderCalls = 0;
    const path = "posts/proj/ttl.jpg";
    const loader = async (): Promise<{ buffer: Buffer; mimetype: string }> => {
      loaderCalls += 1;
      return { buffer: Buffer.from(`v${String(loaderCalls)}`), mimetype: "image/jpeg" };
    };

    const first = await cache.getOrLoad(path, loader);
    assert.equal(loaderCalls, 1);
    assert.equal(first.buffer.toString("utf8"), "v1");

    nowMs += 500;
    const mid = await cache.getOrLoad(path, loader);
    assert.equal(loaderCalls, 1);
    assert.equal(mid.buffer.toString("utf8"), "v1");

    nowMs += 600; // past 1000ms TTL from storedAt
    const expired = await cache.getOrLoad(path, loader);
    assert.equal(loaderCalls, 2);
    assert.equal(expired.buffer.toString("utf8"), "v2");
  });

  it("does not coalesce failed loads across retries", async () => {
    const cache = new MediaDownloadCache({ maxEntries: 8, maxTotalBytes: 1024 * 1024 });
    let loaderCalls = 0;
    const path = "posts/proj/fail.jpg";

    const failingLoader = async (): Promise<{ buffer: Buffer; mimetype: string }> => {
      loaderCalls += 1;
      throw new Error("Storage download failed: exceed_egress_quota");
    };

    await assert.rejects(() => cache.getOrLoad(path, failingLoader), /exceed_egress_quota/);
    await assert.rejects(() => cache.getOrLoad(path, failingLoader), /exceed_egress_quota/);
    assert.equal(loaderCalls, 2);
    assert.equal(cache.size, 0);
  });
});
