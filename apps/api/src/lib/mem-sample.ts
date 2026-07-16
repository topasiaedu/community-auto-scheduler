/**
 * Lightweight process memory snapshots for Render / local OOM debugging.
 * Logs to stdout (Render log stream), appends JSONL to a local file, and can
 * be attached to `/health`.
 *
 * Note: `process.memoryUsage().rss` is the Node process only. whatsmeow's Go
 * subprocess is extra native RAM outside this figure — warm client count is
 * included so spikes can be correlated with WA being up.
 *
 * File default: `apps/api/data/mem-usage.jsonl` (gitignored under `apps/api/data/`).
 * Override with env `NMCAS_MEM_LOG_PATH`. On Render the disk is ephemeral across
 * deploys — copy the file down if you need history after a redeploy.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export type MemSample = {
  /** Resident set size of the Node process (bytes). */
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  /** Warm WaManager entries (each may hold a Go subprocess). */
  waWarmClients: number;
  sampledAt: string;
};

type WaWarmCountProvider = {
  getWarmClientCount: () => number;
};

function bytesToMb(n: number): number {
  return Math.round((n / (1024 * 1024)) * 10) / 10;
}

/**
 * Default JSONL path next to the API package (`apps/api/data/mem-usage.jsonl`).
 */
export function defaultMemLogPath(): string {
  const fromEnv = process.env.NMCAS_MEM_LOG_PATH;
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    const trimmed = fromEnv.trim();
    return isAbsolute(trimmed) ? trimmed : join(process.cwd(), trimmed);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  // src/lib → ../../data
  return join(here, "..", "..", "data", "mem-usage.jsonl");
}

/**
 * Captures the current Node memory snapshot plus warm WA client count.
 */
export function sampleMemory(waPool: WaWarmCountProvider): MemSample {
  const u = process.memoryUsage();
  return {
    rss: u.rss,
    heapUsed: u.heapUsed,
    heapTotal: u.heapTotal,
    external: u.external,
    arrayBuffers: u.arrayBuffers,
    waWarmClients: waPool.getWarmClientCount(),
    sampledAt: new Date().toISOString(),
  };
}

/**
 * Human-readable MB fields for JSON health / log payloads.
 */
export function memSampleForJson(sample: MemSample): Record<string, number | string> {
  return {
    rssMb: bytesToMb(sample.rss),
    heapUsedMb: bytesToMb(sample.heapUsed),
    heapTotalMb: bytesToMb(sample.heapTotal),
    externalMb: bytesToMb(sample.external),
    arrayBuffersMb: bytesToMb(sample.arrayBuffers),
    waWarmClients: sample.waWarmClients,
    sampledAt: sample.sampledAt,
  };
}

async function appendSampleToFile(filePath: string, sample: MemSample): Promise<void> {
  const line = `${JSON.stringify(memSampleForJson(sample))}\n`;
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, line, "utf8");
}

/**
 * Starts a periodic `[mem]` log line and appends JSONL to disk.
 * Returns a stop function for shutdown.
 */
export function startMemoryLogger(
  waPool: WaWarmCountProvider,
  intervalMs = 60_000,
  filePath: string = defaultMemLogPath(),
): () => void {
  const logOnce = () => {
    const sample = sampleMemory(waPool);
    const j = memSampleForJson(sample);
    console.info(
      `[mem] rssMb=${String(j.rssMb)} heapUsedMb=${String(j.heapUsedMb)} heapTotalMb=${String(j.heapTotalMb)} externalMb=${String(j.externalMb)} waWarm=${String(j.waWarmClients)} file=${filePath}`,
    );
    void appendSampleToFile(filePath, sample).catch((err: unknown) => {
      console.error("[mem] failed to append sample file:", err);
    });
  };
  logOnce();
  const timer = setInterval(logOnce, intervalMs);
  timer.unref?.();
  return () => {
    clearInterval(timer);
  };
}
