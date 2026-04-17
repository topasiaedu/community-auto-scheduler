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

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: "nmcas-api",
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

  const fastify = Fastify({ logger: true });

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
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
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

  await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
  fastify.log.info({ port: env.PORT }, "API listening");
}

void main().catch((err: unknown) => {
  console.error("Fatal startup error:", err);
  process.exitCode = 1;
});
