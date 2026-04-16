/**
 * WhatsApp status, QR polling, and group list for the schedule UI (scoped by `X-Project-Id`).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WaConnectionPool } from "../wa/wa-pool.js";

function requireActiveProjectId(req: FastifyRequest, reply: FastifyReply): string | undefined {
  const projectId = req.activeProjectId;
  if (projectId === undefined || projectId.length === 0) {
    void reply.code(500).send({ error: "Project scope missing" });
    return undefined;
  }
  return projectId;
}

export function registerWaRoutes(app: FastifyInstance, waPool: WaConnectionPool): void {
  app.get("/wa/status", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = requireActiveProjectId(req, reply);
    if (projectId === undefined) {
      return;
    }
    const wa = waPool.getManager(projectId);
    await wa.start();
    return {
      state: wa.getUiState(),
      hasQr: wa.getLatestQr() !== undefined,
    };
  });

  app.get("/wa/qr", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = requireActiveProjectId(req, reply);
    if (projectId === undefined) {
      return;
    }
    const wa = waPool.getManager(projectId);
    await wa.start();
    const qr = wa.getLatestQr();
    if (qr === undefined) {
      return reply.code(204).send();
    }
    return { qr };
  });

  app.get("/wa/groups", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = requireActiveProjectId(req, reply);
    if (projectId === undefined) {
      return;
    }
    const wa = waPool.getManager(projectId);
    await wa.start();
    const groups = await wa.fetchGroupOptions();
    return { groups };
  });

  app.post("/wa/session/reset", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = requireActiveProjectId(req, reply);
    if (projectId === undefined) {
      return;
    }
    const wa = waPool.getManager(projectId);
    try {
      await wa.resetSessionForLinking();
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reset failed";
      return reply.code(500).send({ ok: false as const, error: message });
    }
  });
}
