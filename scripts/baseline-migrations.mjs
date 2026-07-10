/**
 * Idempotent baseline for databases that already have NMCAS schema but no
 * `_prisma_migrations` history (Prisma P3005 on `migrate deploy`).
 *
 * For each migration whose schema sentinel is present, runs:
 *   prisma migrate resolve --applied <migration_name>
 *
 * Safe: does not re-run migration SQL or drop data. Skips when history exists.
 */

import { config } from "dotenv";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = resolve(root, "packages", "db");
const migrationsDir = resolve(dbDir, "prisma", "migrations");

const envPaths = [
  resolve(root, ".env"),
  resolve(root, "apps", "api", ".env"),
];

/**
 * @param {string} tableName
 * @param {PrismaClient} prisma
 * @returns {Promise<boolean>}
 */
async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS "exists"
  `;
  const row = rows[0];
  return row !== undefined && row.exists === true;
}

/**
 * @param {string} tableName
 * @param {string} columnName
 * @param {PrismaClient} prisma
 * @returns {Promise<boolean>}
 */
async function columnExists(prisma, tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `;
  const row = rows[0];
  return row !== undefined && row.exists === true;
}

/**
 * True when Prisma migration history exists and has at least one row.
 * An empty `_prisma_migrations` table still needs baselining (P3005).
 *
 * @param {PrismaClient} prisma
 * @returns {Promise<boolean>}
 */
async function hasMigrationHistory(prisma) {
  if (!(await tableExists(prisma, "_prisma_migrations"))) {
    return false;
  }

  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "count"
    FROM "_prisma_migrations"
  `;
  const row = rows[0];
  return row !== undefined && row.count > 0;
}

/**
 * Ordered migration folder names and schema sentinels already present in prod.
 * @type {ReadonlyArray<{ name: string, isApplied: (prisma: PrismaClient) => Promise<boolean> }>}
 */
const MIGRATION_SENTINELS = [
  {
    name: "20260416180000_init",
    isApplied: (prisma) => tableExists(prisma, "Project"),
  },
  {
    name: "20260416203000_project_member",
    isApplied: (prisma) => tableExists(prisma, "ProjectMember"),
  },
  {
    name: "20260418130000_ux_plan_fields",
    isApplied: (prisma) => tableExists(prisma, "UserProjectPreference"),
  },
  {
    name: "20260704090000_wa_session_blob",
    isApplied: (prisma) => tableExists(prisma, "WhatsAppSessionBlob"),
  },
  {
    name: "20260708170000_p7_phase1_campaign_schema",
    isApplied: (prisma) => tableExists(prisma, "Campaign"),
  },
  {
    name: "20260710120000_p8b_active_community_jids",
    isApplied: (prisma) => columnExists(prisma, "Project", "activeCommunityJids"),
  },
];

/**
 * @returns {string[]}
 */
function listMigrationFolders() {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d{14}_/.test(name))
    .sort();
}

/**
 * @param {string} migrationName
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
function resolveMigrationApplied(migrationName) {
  return spawnSync(
    "npx",
    ["prisma", "migrate", "resolve", "--applied", migrationName],
    { cwd: dbDir, stdio: "inherit", env: process.env, shell: true },
  );
}

function loadEnv() {
  for (const path of envPaths) {
    if (existsSync(path)) {
      config({ path, override: true });
    }
  }
}

/**
 * @returns {Promise<void>}
 */
export async function baselineMigrationsIfNeeded() {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    console.error("baseline-migrations: DATABASE_URL is not set");
    process.exit(1);
  }

  const onDisk = listMigrationFolders();
  const known = new Set(MIGRATION_SENTINELS.map((entry) => entry.name));
  const unknown = onDisk.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    console.warn(
      `baseline-migrations: no sentinels for migration(s): ${unknown.join(", ")}`,
    );
  }

  const prisma = new PrismaClient();
  try {
    if (await hasMigrationHistory(prisma)) {
      console.log("baseline-migrations: migration history present; skipping baseline");
      return;
    }

    const hasSchema = await tableExists(prisma, "Project");
    if (!hasSchema) {
      console.log("baseline-migrations: empty database; skipping baseline");
      return;
    }

    console.log(
      "baseline-migrations: schema present without migration history; baselining applied migrations",
    );

    for (const entry of MIGRATION_SENTINELS) {
      if (!onDisk.includes(entry.name)) {
        continue;
      }

      const applied = await entry.isApplied(prisma);
      if (!applied) {
        console.log(`baseline-migrations: leaving pending migration ${entry.name}`);
        continue;
      }

      console.log(`baseline-migrations: marking applied ${entry.name}`);
      const result = resolveMigrationApplied(entry.name);
      if (result.status !== 0) {
        console.error(`baseline-migrations: failed to resolve ${entry.name}`);
        process.exit(result.status === null ? 1 : result.status);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  baselineMigrationsIfNeeded().catch((error) => {
    console.error("baseline-migrations: unexpected error", error);
    process.exit(1);
  });
}
