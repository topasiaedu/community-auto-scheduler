/**
 * Process-local download cache for scheduled-send media (posts / reminders / stickers).
 *
 * Caps (plan §4.1): max 32 entries, max 32 MiB total, TTL 1 hour.
 * Concurrent misses for the same path share one in-flight Promise (fan-out coalesce).
 * Restart clears the cache — acceptable for a single API process.
 */

/** Maximum distinct object paths retained. */
export const MEDIA_CACHE_MAX_ENTRIES = 32;

/** Hard cap on sum of cached buffer sizes (32 MiB). */
export const MEDIA_CACHE_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

/** Entries older than this are treated as misses and reloaded. */
export const MEDIA_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * One cached media object keyed by Storage object path.
 */
export type MediaDownloadCacheEntry = {
  /** Immutable bytes to send (treat as read-only; callers should not mutate). */
  buffer: Buffer;
  /** MIME type matching `buffer` (prefer over path extension when sending). */
  mimetype: string;
  /** Wall-clock ms when the entry was stored (`Date.now()` or injectable clock). */
  storedAt: number;
  /** `buffer.byteLength` at store time (used for total-byte accounting). */
  byteLength: number;
};

/**
 * Payload returned by {@link MediaDownloadCache.getOrLoad} / {@link MediaDownloadCache.get}.
 */
export type MediaDownloadPayload = {
  buffer: Buffer;
  mimetype: string;
};

type LoaderFn = () => Promise<MediaDownloadPayload>;

/**
 * Options for constructing a {@link MediaDownloadCache}.
 * Tests may shrink caps / TTL and inject a clock.
 */
export type MediaDownloadCacheOptions = {
  maxEntries?: number;
  maxTotalBytes?: number;
  ttlMs?: number;
  /** Injectable clock for TTL tests; defaults to `Date.now`. */
  now?: () => number;
};

/**
 * In-process LRU media cache with Promise coalescing for identical paths.
 *
 * Eviction: when over max entries or max total bytes, drop least-recently-used
 * entries (Map insertion order with re-insert on get/set = LRU).
 */
export class MediaDownloadCache {
  private readonly maxEntries: number;
  private readonly maxTotalBytes: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  /** Path → entry; Map order is LRU (oldest first). */
  private readonly entries = new Map<string, MediaDownloadCacheEntry>();

  /** In-flight loaders keyed by path (coalesce concurrent misses). */
  private readonly inflight = new Map<string, Promise<MediaDownloadPayload>>();

  private totalBytes = 0;

  /**
   * @param options - Optional overrides for caps, TTL, and clock (tests).
   */
  constructor(options: MediaDownloadCacheOptions = {}) {
    this.maxEntries =
      typeof options.maxEntries === "number" && options.maxEntries > 0
        ? options.maxEntries
        : MEDIA_CACHE_MAX_ENTRIES;
    this.maxTotalBytes =
      typeof options.maxTotalBytes === "number" && options.maxTotalBytes > 0
        ? options.maxTotalBytes
        : MEDIA_CACHE_MAX_TOTAL_BYTES;
    this.ttlMs =
      typeof options.ttlMs === "number" && options.ttlMs > 0
        ? options.ttlMs
        : MEDIA_CACHE_TTL_MS;
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
  }

  /**
   * Returns a live entry if present and not TTL-expired; refreshes LRU order.
   * Expired entries are removed and treated as a miss.
   */
  get(path: string): MediaDownloadCacheEntry | undefined {
    const existing = this.entries.get(path);
    if (existing === undefined) {
      return undefined;
    }
    if (this.now() - existing.storedAt > this.ttlMs) {
      this.deleteEntry(path);
      return undefined;
    }
    // Refresh LRU: delete + re-insert moves to most-recent end.
    this.entries.delete(path);
    this.entries.set(path, existing);
    return existing;
  }

  /**
   * Stores (or replaces) an entry, then evicts until under caps.
   * Oversized single buffers still store once; eviction clears older peers first.
   */
  set(path: string, buffer: Buffer, mimetype: string): void {
    const previous = this.entries.get(path);
    if (previous !== undefined) {
      this.totalBytes -= previous.byteLength;
      this.entries.delete(path);
    }

    const byteLength = buffer.byteLength;
    const entry: MediaDownloadCacheEntry = {
      buffer,
      mimetype,
      storedAt: this.now(),
      byteLength,
    };
    this.entries.set(path, entry);
    this.totalBytes += byteLength;
    this.evictIfNeeded();
  }

  /**
   * Returns cached payload on hit; otherwise runs `loader` once (coalesced),
   * stores the result, and returns it.
   *
   * Concurrent callers for the same `path` share one in-flight Promise.
   */
  async getOrLoad(path: string, loader: LoaderFn): Promise<MediaDownloadPayload> {
    const hit = this.get(path);
    if (hit !== undefined) {
      console.warn(
        `[media-cache] hit path=${path} bytes=${String(hit.byteLength)} mimetype=${hit.mimetype}`,
      );
      return { buffer: hit.buffer, mimetype: hit.mimetype };
    }

    const pending = this.inflight.get(path);
    if (pending !== undefined) {
      console.warn(`[media-cache] coalesce path=${path}`);
      return pending;
    }

    console.warn(`[media-cache] miss path=${path}`);
    const loadPromise = this.runLoader(path, loader);
    this.inflight.set(path, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.inflight.delete(path);
    }
  }

  /** Current number of stored entries (for tests / diagnostics). */
  get size(): number {
    return this.entries.size;
  }

  /** Sum of cached `byteLength` values (for tests / diagnostics). */
  get totalByteLength(): number {
    return this.totalBytes;
  }

  /** Removes all entries and in-flight tracking (tests). */
  clear(): void {
    this.entries.clear();
    this.inflight.clear();
    this.totalBytes = 0;
  }

  private async runLoader(path: string, loader: LoaderFn): Promise<MediaDownloadPayload> {
    const loaded = await loader();
    this.set(path, loaded.buffer, loaded.mimetype);
    console.warn(
      `[media-cache] stored path=${path} bytes=${String(loaded.buffer.byteLength)} mimetype=${loaded.mimetype}`,
    );
    return { buffer: loaded.buffer, mimetype: loaded.mimetype };
  }

  private deleteEntry(path: string): void {
    const existing = this.entries.get(path);
    if (existing === undefined) {
      return;
    }
    this.totalBytes -= existing.byteLength;
    this.entries.delete(path);
  }

  /**
   * Drop LRU (oldest Map keys) until entry count and total bytes are within caps.
   * If a single entry exceeds `maxTotalBytes`, keep it alone (still need to serve it).
   */
  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.oldestKey();
      if (oldestKey === undefined) {
        break;
      }
      this.deleteEntry(oldestKey);
    }

    while (this.totalBytes > this.maxTotalBytes && this.entries.size > 1) {
      const oldestKey = this.oldestKey();
      if (oldestKey === undefined) {
        break;
      }
      this.deleteEntry(oldestKey);
    }
  }

  private oldestKey(): string | undefined {
    const iterator = this.entries.keys().next();
    if (iterator.done === true) {
      return undefined;
    }
    return iterator.value;
  }
}

/**
 * Shared process-wide cache used by the send worker.
 * Fan-out jobs for the same `imageUrl` hit this Map within one API process.
 */
export const mediaDownloadCache = new MediaDownloadCache();
