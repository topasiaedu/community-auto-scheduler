/**
 * Per-project whatsmeow session store URIs (SQLite file or Postgres schema isolation).
 */

import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";

const SEND_COMMAND_TIMEOUT_MS = 120_000;

/** IPC timeout for whatsmeow-node; matches worker send timeout. */
export const WHATSAPP_COMMAND_TIMEOUT_MS = SEND_COMMAND_TIMEOUT_MS;

/**
 * Sanitizes `projectId` for use in Postgres schema / file names.
 */
export function sanitizeProjectIdForStore(projectId: string): string {
  const trimmed = projectId.trim();
  if (trimmed.length === 0) {
    throw new Error("projectId must be non-empty for WhatsApp store");
  }
  return trimmed.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Postgres schema name for one project's whatsmeow tables.
 */
export function whatsappSchemaName(projectId: string): string {
  return `wa_${sanitizeProjectIdForStore(projectId)}`;
}

/**
 * Returns true when the store base URL is a Postgres connection string.
 */
export function isPostgresStoreUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * True when the URL targets Supabase Supavisor (pooler).
 */
export function isSupabasePoolerUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("pooler.supabase.com");
  } catch {
    return false;
  }
}

/**
 * True for Supabase **transaction** pooler (port 6543). Session state such as `search_path`
 * is not reliable there; use session mode (`:5432`) or direct Postgres instead.
 */
export function isSupabaseTransactionPoolerUrl(url: string): boolean {
  if (!isSupabasePoolerUrl(url)) {
    return false;
  }
  try {
    const port = new URL(url).port;
    return port === "6543";
  } catch {
    return false;
  }
}

/**
 * Base store URL before per-project schema / file isolation is applied.
 */
export function resolveWhatsAppStoreBase(env: ApiEnv): string {
  return env.WHATSAPP_STORE_URL ?? env.DATABASE_URL;
}

/**
 * Validates WhatsApp store configuration at API startup.
 *
 * Prefer Supabase **session** pooler (`*.pooler.supabase.com:5432`) on Render: direct
 * `db.<ref>.supabase.co` is often IPv6-only and returns "network is unreachable" on IPv4 hosts.
 * Transaction pooler (`:6543`) is rejected because per-schema `search_path` is unreliable.
 */
export function assertWhatsAppStoreConfig(env: ApiEnv): void {
  const storeBase = resolveWhatsAppStoreBase(env);
  if (!isPostgresStoreUrl(storeBase)) {
    return;
  }
  if (isSupabaseTransactionPoolerUrl(storeBase)) {
    throw new Error(
      "WHATSAPP_STORE_URL must not use the Supabase transaction pooler (port 6543). " +
        "Use session mode (port 5432 on *.pooler.supabase.com) — same style as DATABASE_URL — " +
        "or direct Postgres if your host has IPv6 / Supabase IPv4 add-on.",
    );
  }
}

/**
 * Builds an isolated whatsmeow store URI for one NMCAS project.
 *
 * - Postgres base: same database, dedicated `search_path` schema per project (requires direct URL).
 * - Otherwise: SQLite file under the given directory (e.g. `./data/wa-sessions` for local-only dev).
 */
export function resolveWhatsAppStoreUri(env: ApiEnv, projectId: string): string {
  const base = resolveWhatsAppStoreBase(env);
  if (isPostgresStoreUrl(base)) {
    const schema = whatsappSchemaName(projectId);
    const url = new URL(base);
    const searchPathOpt = `-c search_path=${schema},public`;
    const existing = url.searchParams.get("options");
    if (existing !== null && existing.length > 0) {
      url.searchParams.set("options", `${existing} ${searchPathOpt}`);
    } else {
      url.searchParams.set("options", searchPathOpt);
    }
    return url.toString();
  }

  const dir = base.startsWith("file:") ? base.slice("file:".length).replace(/\/$/, "") : base.replace(/\/$/, "");
  const fileName = `${sanitizeProjectIdForStore(projectId)}.db`;
  return `file:${join(dir, fileName)}`;
}

/**
 * Ensures the SQLite session directory exists when not using Postgres.
 */
export async function ensureSqliteStoreDir(env: ApiEnv, projectId: string): Promise<void> {
  const base = resolveWhatsAppStoreBase(env);
  if (isPostgresStoreUrl(base)) {
    return;
  }
  const uri = resolveWhatsAppStoreUri(env, projectId);
  const pathPart = uri.startsWith("file:") ? uri.slice("file:".length) : uri;
  const dir = join(pathPart, "..");
  await mkdir(dir, { recursive: true });
}

/**
 * Creates the per-project Postgres schema if missing (no-op for SQLite stores).
 */
export async function ensurePostgresWhatsAppSchema(
  prisma: PrismaClient,
  projectId: string,
): Promise<void> {
  const schema = whatsappSchemaName(projectId);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
}

/**
 * Brief pause so the whatsmeow Go subprocess releases SQLite file handles (Windows EBUSY).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isNodeFsError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/**
 * Deletes one SQLite session file, retrying when Windows reports EBUSY after client shutdown.
 */
async function unlinkWithRetry(filePath: string, attempts = 8): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await unlink(filePath);
      return;
    } catch (err: unknown) {
      if (isNodeFsError(err) && err.code === "ENOENT") {
        return;
      }
      if (isNodeFsError(err) && err.code === "EBUSY" && attempt < attempts) {
        await sleep(250 * attempt);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Removes the main SQLite DB and its WAL sidecar files for one project session.
 */
async function unlinkSqliteSessionFiles(dbPath: string): Promise<void> {
  await unlinkWithRetry(dbPath);
  await unlinkWithRetry(`${dbPath}-shm`);
  await unlinkWithRetry(`${dbPath}-wal`);
}

/**
 * Drops per-project whatsmeow session data so the next boot shows a fresh QR.
 */
export async function wipeWhatsAppStore(
  prisma: PrismaClient,
  env: ApiEnv,
  projectId: string,
): Promise<void> {
  const base = resolveWhatsAppStoreBase(env);
  if (isPostgresStoreUrl(base)) {
    const schema = whatsappSchemaName(projectId);
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await ensurePostgresWhatsAppSchema(prisma, projectId);
    return;
  }

  const uri = resolveWhatsAppStoreUri(env, projectId);
  const pathPart = uri.startsWith("file:") ? uri.slice("file:".length) : uri;
  await unlinkSqliteSessionFiles(pathPart);
}
