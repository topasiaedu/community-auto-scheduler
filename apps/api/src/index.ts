/**
 * NMCAS API entry: Fastify HTTP server, Prisma, pg-boss worker, and Baileys (per-project pool).
 */

import { loadEnvFiles } from "./load-env.js";
loadEnvFiles();
import cors from "@fastify/cors";
import Fastify from "fastify";
import PgBoss from "pg-boss";
import { createPrismaClient, type PrismaClient } from "@nmcas/db";
import { getSessionStoragePrefix } from "@nmcas/wa-session-storage";
import {
  createRequireAuthPreHandler,
  createRequireProjectAccessPreHandler,
} from "./auth/supabase-auth.js";
import { loadApiEnv } from "./env.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerPreferencesRoutes } from "./routes/preferences.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import { registerWaRoutes } from "./routes/wa.js";
import { SEND_SCHEDULED_MESSAGE_QUEUE } from "./queues.js";
import { handleSendScheduledMessageJobs } from "./worker/send-scheduled-message.js";
import { WaConnectionPool } from "./wa/wa-pool.js";

async function main(): Promise<void> {
  const env = loadApiEnv();
  const prisma: PrismaClient = createPrismaClient();
  const waPool = new WaConnectionPool(env);

  /**
   * Append keepalive params to pg-boss's connection string so its internal `pg` pool
   * does not get `08006` (connection failure during authentication) when Supabase's
   * session-pooler drops idle TCP sockets after ~5 min of inactivity.
   * These are libpq / TCP keepalive knobs (seconds), forwarded through `pg` to the OS.
   */
  function pgBossUrl(base: string): string {
    try {
      const u = new URL(base);
      const set = (k: string, v: string) => { if (!u.searchParams.has(k)) u.searchParams.set(k, v); };
      set("keepalives", "1");
      set("keepalives_idle", "60");
      set("keepalives_interval", "10");
      set("keepalives_count", "3");
      return u.toString();
    } catch {
      return base;
    }
  }

  const boss = new PgBoss({
    connectionString: pgBossUrl(env.DATABASE_URL),
    application_name: "nmcas-api",
    /**
     * Free-tier tuning:
     * - max:3   → only 3 pg connections for the job pool; Supabase free has ~60 direct slots and we share with Prisma.
     * - maintenanceIntervalSeconds:120 → halve the default 60s maintenance queries to reduce idle DB traffic.
     * - deleteAfterHours:24 → don't keep completed/failed jobs forever; shrinks pgboss tables on free storage.
     */
    max: 3,
    maintenanceIntervalSeconds: 120,
    deleteAfterHours: 24,
  });

  boss.on("error", (err: Error) => {
    console.error("[pg-boss] error:", err);
  });

  await boss.start();

  const existingQueue = await boss.getQueue(SEND_SCHEDULED_MESSAGE_QUEUE);
  if (existingQueue === null) {
    await boss.createQueue(SEND_SCHEDULED_MESSAGE_QUEUE);
  }

  await boss.work(SEND_SCHEDULED_MESSAGE_QUEUE, async (jobs) => {
    await handleSendScheduledMessageJobs(prisma, env, waPool, jobs);
  });

  const fastify = Fastify({
    logger:
      process.env.NODE_ENV === "production"
        ? { level: "warn" }
        : true,
  });

  const webOrigins = env.WEB_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const corsOrigin =
    webOrigins.length === 0
      ? "http://localhost:5173"
      : webOrigins.length === 1
        ? webOrigins[0]
        : webOrigins;

  await fastify.register(cors, {
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Project-Id"],
  });

  fastify.get("/health", async () => ({
    ok: true as const,
    queue: SEND_SCHEDULED_MESSAGE_QUEUE,
    sessionPathExample: getSessionStoragePrefix(env.DEFAULT_PROJECT_ID),
  }));

  fastify.get("/ready", async () => {
    await prisma.$queryRaw`SELECT 1`;
    const installed = await boss.isInstalled();
    return { ok: true as const, database: true, pgBoss: Boolean(installed) };
  });

  const requireAuth = createRequireAuthPreHandler(env);
  const requireProject = createRequireProjectAccessPreHandler(prisma);

  await fastify.register(async (authScope) => {
    authScope.addHook("preHandler", requireAuth);
    registerProjectRoutes(authScope, prisma);

    await authScope.register(async (projectScope) => {
      projectScope.addHook("preHandler", requireProject);
      registerWaRoutes(projectScope, waPool);
      registerMessageRoutes(projectScope, { prisma, boss });
      registerPreferencesRoutes(projectScope, prisma);
      await registerUploadRoutes(projectScope, env);
    });
  });

  let shuttingDown = false;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    clearInterval(keepaliveTimer);
    fastify.log.info({ signal }, "Shutting down");
    try {
      await fastify.close();
    } catch (err) {
      fastify.log.error({ err }, "Error closing Fastify");
    }
    try {
      await boss.offWork(SEND_SCHEDULED_MESSAGE_QUEUE);
    } catch (err) {
      fastify.log.error({ err }, "Error stopping pg-boss worker");
    }
    try {
      await waPool.shutdownAll();
    } catch (err) {
      fastify.log.error({ err }, "Error shutting down WhatsApp");
    }
    try {
      await boss.stop({ graceful: true, timeout: 15000, wait: true });
    } catch (err) {
      fastify.log.error({ err }, "Error stopping pg-boss");
    }
    try {
      await prisma.$disconnect();
    } catch (err) {
      fastify.log.error({ err }, "Error disconnecting Prisma");
    }
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  /**
   * Safety net: log unhandled rejections/exceptions without crashing the process on free-tier containers
   * where an OOM or transient async failure would otherwise kill pg-boss + WA + the job worker together.
   */
  process.on("unhandledRejection", (reason: unknown) => {
    console.error("[unhandledRejection]", reason);
  });
  process.on("uncaughtException", (err: Error) => {
    console.error("[uncaughtException]", err);
  });

  /**
   * Keepalive: run a cheap Prisma heartbeat every 4 minutes to prevent Supabase session-pooler from
   * closing idle pg-boss / Prisma connections (free tier drops idle sockets after ~5 min of inactivity).
   * pg-boss `08006` errors are typically this: pooler closed the TCP connection, next query fails on auth.
   */
  keepaliveTimer = setInterval(() => {
    void prisma.$queryRaw`SELECT 1`.catch((err: unknown) => {
      console.error("[keepalive] heartbeat failed:", err);
    });
  }, 4 * 60 * 1000);

  await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
  fastify.log.info({ port: env.PORT }, "API listening");
}

void main().catch((err: unknown) => {
  console.error("Fatal startup error:", err);
  process.exitCode = 1;
});
