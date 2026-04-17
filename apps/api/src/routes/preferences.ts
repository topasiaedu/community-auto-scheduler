/**
 * Per-user preferences for the active project (e.g. last selected WhatsApp group).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@nmcas/db";
import { z } from "zod";

const PatchBodySchema = z.object({
  lastGroupJid: z.string().min(1).max(512).optional(),
  lastGroupName: z.string().min(1).max(512).optional(),
});

export function registerPreferencesRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/preferences", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.authUserId;
    const projectId = req.activeProjectId;
    if (userId === undefined || userId.length === 0 || projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Auth or project scope missing" });
    }
    const row = await prisma.userProjectPreference.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    return {
      preference: row,
    };
  });

  app.patch("/preferences", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.authUserId;
    const projectId = req.activeProjectId;
    if (userId === undefined || userId.length === 0 || projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Auth or project scope missing" });
    }
    const parsed = PatchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const { lastGroupJid, lastGroupName } = parsed.data;
    if (lastGroupJid === undefined && lastGroupName === undefined) {
      return reply.code(400).send({ error: "Provide lastGroupJid and/or lastGroupName" });
    }
    const row = await prisma.userProjectPreference.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: {
        userId,
        projectId,
        lastGroupJid: lastGroupJid ?? null,
        lastGroupName: lastGroupName ?? null,
      },
      update: {
        ...(lastGroupJid !== undefined ? { lastGroupJid } : {}),
        ...(lastGroupName !== undefined ? { lastGroupName } : {}),
      },
    });
    return { preference: row };
  });
}
