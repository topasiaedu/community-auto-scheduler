/**
 * Runs `prisma migrate deploy` in packages/db after loading the same env files as the API.
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const envPaths = [
  resolve(root, ".env"),
  resolve(root, "apps", "api", ".env"),
];

for (const path of envPaths) {
  if (existsSync(path)) {
    config({ path, override: true });
  }
}

const dbDir = resolve(root, "packages", "db");
const result = spawnSync(
  "npx",
  ["prisma", "migrate", "deploy"],
  { cwd: dbDir, stdio: "inherit", env: process.env, shell: true },
);

process.exit(result.status === null ? 1 : result.status);
