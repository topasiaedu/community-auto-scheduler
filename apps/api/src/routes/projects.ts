/**
 * Lists and creates Prisma `Project` rows. Any signed-in user sees all projects and may create new ones (org-wide access; no per-user membership).
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
    const projects = await prisma.project.findMany({
      orderBy: { name: "asc" },
    });
    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
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
    const project = await prisma.project.create({
      data: { name, description },
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
