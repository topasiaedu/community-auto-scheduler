/**
 * Loads `.env` files in a predictable order (later files override earlier ones).
 * Default: repo root `.env`, then `apps/api/.env` for local overrides.
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPaths = [
  resolve(__dirname, "../../../.env"),
  resolve(__dirname, "../../.env"),
];

export function loadEnvFiles(): void {
  for (const path of envPaths) {
    if (existsSync(path)) {
      config({ path, override: true });
    }
  }
}
