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
    const snap = wa.getStatusSnapshot();
    // Keep this endpoint cheap: never await a cold boot/persist on the request path.
    // If we're truly idle, start in the background and return the updated snapshot.
    if (snap.state === "disconnected" && snap.hasQr === false) {
      void wa.start();
      return wa.getStatusSnapshot();
    }
    return snap;
  });

  app.get("/wa/qr", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = requireActiveProjectId(req, reply);
    if (projectId === undefined) {
      return;
    }
    const wa = waPool.getManager(projectId);
    const qr = wa.getLatestQr();
    if (qr === undefined) {
      // Start only if we're idle; do not block this request on cold boot.
      if (wa.getUiState() === "disconnected") {
        void wa.start();
      }
      return reply.code(204).send();
    }
    return { qr };
  });

  app.get("/wa/groups", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = requireActiveProjectId(req, reply);
    if (projectId === undefined) {
      return;
    }
    const query = req.query as { refresh?: string } | undefined;
    const forceRefresh = query?.refresh === "1" || query?.refresh === "true";
    const wa = waPool.getManager(projectId);
    await wa.start();
    const groups = await wa.fetchGroupOptions(forceRefresh);
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
