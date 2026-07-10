/**
 * Baselines existing prod schema if needed, then runs `prisma migrate deploy`.
 */

import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { baselineMigrationsIfNeeded } from "./baseline-migrations.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = resolve(root, "packages", "db");
const migrationsDir = resolve(dbDir, "prisma", "migrations");

const migrationCount = readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_/.test(name))
  .length;

console.log(`migrate-deploy: starting (${migrationCount} migration folder(s) on disk)`);

await baselineMigrationsIfNeeded();

const result = spawnSync(
  "npx",
  ["prisma", "migrate", "deploy"],
  { cwd: dbDir, stdio: "inherit", env: process.env, shell: true },
);

process.exit(result.status === null ? 1 : result.status);
