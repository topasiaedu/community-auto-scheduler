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
    if (wa.shouldKickStartForQr()) {
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
      if (wa.shouldKickStartForQr()) {
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
    try {
      const groups = await wa.fetchGroupOptions(forceRefresh);
      return { groups };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch groups";
      console.error(`[wa/groups] projectId=${projectId}:`, err);
      // 503 tells the client groups are temporarily unavailable (sync in progress / IPC timeout).
      return reply.code(503).send({ groups: [] as unknown[], error: message });
    }
  });

  app.post("/wa/session/reset", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = requireActiveProjectId(req, reply);
    if (projectId === undefined) {
      return;
    }
    const wa = waPool.getManager(projectId);
    try {
      // On 512 MB hosts, three warm Go clients can prevent QR connect from completing.
      await waPool.prepareForQrPairing(projectId);
      await wa.resetSessionForLinking();
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reset failed";
      return reply.code(500).send({ ok: false as const, error: message });
    }
  });

  /**
   * Phone-number pairing fallback when QR never appears.
   * Body: `{ "phone": "60123456789" }` (digits only, country code, no +).
   */
  app.post("/wa/pair-code", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = requireActiveProjectId(req, reply);
    if (projectId === undefined) {
      return;
    }
    const body = req.body as { phone?: unknown } | null;
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    if (phone.length === 0) {
      return reply.code(400).send({ error: "phone is required (digits with country code, no +)" });
    }
    const wa = waPool.getManager(projectId);
    try {
      await waPool.prepareForQrPairing(projectId);
      const code = await wa.requestPairCode(phone);
      return { code };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Pairing code request failed";
      console.error(`[wa/pair-code] projectId=${projectId}:`, err);
      return reply.code(500).send({ error: message });
    }
  });
}
