import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Dev proxy: browser calls `/api/*` → Fastify (same `PORT` as root `.env`, default 3001) without `/api` prefix.
 * `strictPort: true` avoids silently moving to 5174 while `WEB_ORIGIN` still lists 5173 (CORS would break the UI).
 * Set `VITE_API_URL` when you want to hit the API directly (e.g. production preview).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, monorepoRoot, "");
  const apiPort = env.PORT !== undefined && env.PORT.trim().length > 0 ? env.PORT.trim() : "3001";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(dirname(fileURLToPath(import.meta.url)), "./src"),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
