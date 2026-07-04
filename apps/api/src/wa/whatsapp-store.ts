/**
 * Per-project whatsmeow session store: local SQLite files hydrated from / persisted to
 * Postgres (`WhatsAppSessionBlob`) via Prisma. Avoids whatsmeow opening Postgres directly
 * (Supabase pooler ignores `search_path`; direct `db.*` hosts are often IPv6-only on Render).
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";

const SEND_COMMAND_TIMEOUT_MS = 120_000;

/** IPC timeout for whatsmeow-node; matches worker send timeout. */
export const WHATSAPP_COMMAND_TIMEOUT_MS = SEND_COMMAND_TIMEOUT_MS;

/**
 * Sanitizes `projectId` for use in file names.
 */
export function sanitizeProjectIdForStore(projectId: string): string {
  const trimmed = projectId.trim();
  if (trimmed.length === 0) {
    throw new Error("projectId must be non-empty for WhatsApp store");
  }
  return trimmed.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Example path shown on `/health` for operators.
 */
export function whatsappStoreExample(projectId: string): string {
  return `wa_session_blob/${sanitizeProjectIdForStore(projectId)}`;
}

/** @deprecated Use `whatsappStoreExample` — kept for older call sites. */
export function whatsappSchemaName(projectId: string): string {
  return whatsappStoreExample(projectId);
}

/**
 * Validates WhatsApp store configuration at API startup (SQLite + blob; no special URL required).
 */
export function assertWhatsAppStoreConfig(_env: ApiEnv): void {
  /* no-op: sessions use local SQLite + Prisma blob on DATABASE_URL */
}

/**
 * Directory for on-disk SQLite session files.
 * Optional `WHATSAPP_STORE_URL=file:./data/wa-sessions` overrides the default temp dir.
 */
export function resolveSqliteSessionDir(env: ApiEnv): string {
  const override = env.WHATSAPP_STORE_URL;
  if (override !== undefined && override.startsWith("file:")) {
    return override.slice("file:".length).replace(/\/$/, "");
  }
  return join(tmpdir(), "nmcas-wa-sessions");
}

/**
 * Absolute path to one project's SQLite session database.
 */
export function resolveSqliteSessionPath(env: ApiEnv, projectId: string): string {
  return join(resolveSqliteSessionDir(env), `${sanitizeProjectIdForStore(projectId)}.db`);
}

/**
 * whatsmeow-node `store` URI for one project (always SQLite file).
 */
export function resolveWhatsAppStoreUri(env: ApiEnv, projectId: string): string {
  return `file:${resolveSqliteSessionPath(env, projectId)}`;
}

/**
 * Ensures the SQLite session directory exists.
 */
export async function ensureSqliteStoreDir(env: ApiEnv, projectId: string): Promise<void> {
  const dbPath = resolveSqliteSessionPath(env, projectId);
  await mkdir(join(dbPath, ".."), { recursive: true });
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
 * Writes the Postgres blob (if any) to the local SQLite path before whatsmeow boots.
 */
export async function hydrateWhatsAppSessionFromBlob(
  prisma: PrismaClient,
  env: ApiEnv,
  projectId: string,
): Promise<void> {
  await ensureSqliteStoreDir(env, projectId);
  const dbPath = resolveSqliteSessionPath(env, projectId);
  await unlinkSqliteSessionFiles(dbPath);

  const row = await prisma.whatsAppSessionBlob.findUnique({
    where: { projectId },
  });
  if (row === null) {
    return;
  }
  await writeFile(dbPath, row.data);
  console.info(
    `[whatsapp-store] hydrated session projectId=${projectId} bytes=${String(row.data.length)}`,
  );
}

/**
 * Uploads the local SQLite file to Postgres so the session survives deploys / restarts.
 */
export async function persistWhatsAppSessionToBlob(
  prisma: PrismaClient,
  env: ApiEnv,
  projectId: string,
): Promise<void> {
  const dbPath = resolveSqliteSessionPath(env, projectId);
  let data: Buffer;
  try {
    data = await readFile(dbPath);
  } catch (err: unknown) {
    if (isNodeFsError(err) && err.code === "ENOENT") {
      return;
    }
    throw err;
  }
  if (data.length === 0) {
    return;
  }
  await prisma.whatsAppSessionBlob.upsert({
    where: { projectId },
    create: { projectId, data },
    update: { data },
  });
  console.info(
    `[whatsapp-store] persisted session projectId=${projectId} bytes=${String(data.length)}`,
  );
}

/**
 * Deletes local SQLite files and the Postgres blob so the next boot shows a fresh QR.
 */
export async function wipeWhatsAppStore(
  prisma: PrismaClient,
  env: ApiEnv,
  projectId: string,
): Promise<void> {
  const dbPath = resolveSqliteSessionPath(env, projectId);
  await unlinkSqliteSessionFiles(dbPath);
  await prisma.whatsAppSessionBlob.deleteMany({ where: { projectId } });
}
