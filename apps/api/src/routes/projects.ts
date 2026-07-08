/**
 * Lists and creates Prisma `Project` rows. Any signed-in user sees all projects and may create new ones (org-wide access; no per-user membership).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@nmcas/db";
import { seedReminderTemplatesForProject } from "@nmcas/db";
import { z } from "zod";

const CreateProjectBodySchema = z.object({
  name: z.string().min(1, "name is required").max(256),
  description: z.string().max(2000).optional(),
});

const PatchProjectBodySchema = z
  .object({
    sopUrl: z.string().max(2048).nullable().optional(),
    campaignNote: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (b) => b.sopUrl !== undefined || b.campaignNote !== undefined,
    { message: "Provide sopUrl and/or campaignNote" },
  );

function parseHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function projectToJson(p: {
  id: string;
  name: string;
  description: string | null;
  sopUrl: string | null;
  campaignNote: string | null;
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    sopUrl: p.sopUrl,
    campaignNote: p.campaignNote,
  };
}

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
      projects: projects.map(projectToJson),
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
    await seedReminderTemplatesForProject(prisma, project.id);
    return reply.code(201).send({
      project: projectToJson(project),
    });
  });

  app.patch("/projects/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.authUserId;
    if (userId === undefined || userId.length === 0) {
      return reply.code(500).send({ error: "Auth context missing" });
    }
    const id =
      typeof req.params === "object" && req.params !== null && "id" in req.params
        ? String(req.params.id)
        : "";
    if (id.length === 0) {
      return reply.code(400).send({ error: "Missing project id" });
    }
    const parsed = PatchProjectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const existing = await prisma.project.findUnique({ where: { id } });
    if (existing === null) {
      return reply.code(404).send({ error: "Project not found" });
    }
    if (parsed.data.sopUrl !== undefined && parsed.data.sopUrl !== null) {
      if (!parseHttpUrl(parsed.data.sopUrl)) {
        return reply.code(400).send({ error: "sopUrl must be a valid http or https URL" });
      }
    }
    const data: { sopUrl?: string | null; campaignNote?: string | null } = {};
    if (parsed.data.sopUrl !== undefined) {
      data.sopUrl = parsed.data.sopUrl;
    }
    if (parsed.data.campaignNote !== undefined) {
      data.campaignNote = parsed.data.campaignNote;
    }
    const project = await prisma.project.update({
      where: { id },
      data,
    });
    return { project: projectToJson(project) };
  });
}
