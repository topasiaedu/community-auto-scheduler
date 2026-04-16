/**
 * Lists and creates Prisma `Project` rows for the authenticated Supabase user.
 * Any signed-in user may create a project and becomes its first `ProjectMember`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@nmcas/db";
import { z } from "zod";

const CreateProjectBodySchema = z.object({
  name: z.string().min(1, "name is required").max(256),
  description: z.string().max(2000).optional(),
});

export function registerProjectRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/projects", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.authUserId;
    if (userId === undefined || userId.length === 0) {
      return reply.code(500).send({ error: "Auth context missing" });
    }
    const rows = await prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      projects: rows.map((row) => ({
        id: row.project.id,
        name: row.project.name,
        description: row.project.description,
      })),
    };
  });

  app.post("/projects", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.authUserId;
    if (userId === undefined || userId.length === 0) {
      return reply.code(500).send({ error: "Auth context missing" });
    }
    const parsed = CreateProjectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const name = parsed.data.name.trim();
    const description =
      parsed.data.description !== undefined && parsed.data.description.trim().length > 0
        ? parsed.data.description.trim()
        : null;
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: { name, description },
      });
      await tx.projectMember.create({
        data: { userId, projectId: created.id },
      });
      return created;
    });
    return reply.code(201).send({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
    });
  });
}
