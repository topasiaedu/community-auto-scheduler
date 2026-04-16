/**
 * Scheduled messages: create (enqueue) and list — POST (text/image) and POLL (native WA poll).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import PgBoss from "pg-boss";
import { z } from "zod";
import type { PrismaClient } from "@nmcas/db";
import { SEND_SCHEDULED_MESSAGE_QUEUE } from "../queues.js";

const groupJidField = z.string().regex(/@g\.us$/, "groupJid must be a WhatsApp group JID");
const groupNameField = z.string().min(1).max(512);
const scheduledAtField = z.string().min(1);

const CreatePostMessageSchema = z
  .object({
    type: z.literal("POST"),
    groupJid: groupJidField,
    groupName: groupNameField,
    copyText: z.string().max(65536).optional(),
    imageUrl: z.string().min(1).max(2048).optional(),
    scheduledAt: scheduledAtField,
  })
  .refine(
    (b) =>
      (b.copyText !== undefined && b.copyText.trim().length > 0) ||
      (b.imageUrl !== undefined && b.imageUrl.length > 0),
    { message: "Provide non-empty copyText and/or imageUrl" },
  );

const CreatePollMessageSchema = z.object({
  type: z.literal("POLL"),
  groupJid: groupJidField,
  groupName: groupNameField,
  pollQuestion: z.string().min(1).max(4096),
  pollOptions: z
    .array(z.string().min(1).max(256))
    .min(2, "At least two poll options")
    .max(12, "WhatsApp allows at most 12 poll options"),
  pollMultiSelect: z.boolean(),
  scheduledAt: scheduledAtField,
});

const CreateMessageBodySchema = z.preprocess((raw: unknown) => {
  if (typeof raw === "object" && raw !== null && !("type" in raw)) {
    return { ...raw, type: "POST" as const };
  }
  return raw;
}, z.union([CreatePostMessageSchema, CreatePollMessageSchema]));

const ListQuerySchema = z.object({
  status: z.enum(["PENDING", "SENDING", "SENT", "FAILED"]).optional(),
  type: z.enum(["POST", "POLL"]).optional(),
});

function parseScheduledAtUtc(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error("scheduledAt must be a valid ISO-8601 datetime");
  }
  return d;
}

type PgBossInstance = InstanceType<typeof PgBoss>;

export function registerMessageRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; boss: PgBossInstance },
): void {
  const { prisma, boss } = deps;

  app.post("/messages", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = CreateMessageBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.flatten() });
    }
    const scheduledAt = parseScheduledAtUtc(body.data.scheduledAt);
    const minTime = new Date(Date.now() + 15_000);
    if (scheduledAt.getTime() < minTime.getTime()) {
      return reply
        .code(400)
        .send({ error: "scheduledAt must be at least ~15 seconds in the future" });
    }

    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project === null) {
      return reply.code(500).send({
        error: `Project "${projectId}" not found. Run: npm run db:seed`,
      });
    }

    const baseRow = {
      projectId,
      groupJid: body.data.groupJid,
      groupName: body.data.groupName,
      scheduledAt,
      status: "PENDING" as const,
    };

    const row =
      body.data.type === "POST"
        ? await prisma.scheduledMessage.create({
            data: {
              ...baseRow,
              type: "POST",
              copyText: body.data.copyText?.trim() ?? null,
              imageUrl: body.data.imageUrl ?? null,
              pollQuestion: null,
              pollOptions: [],
              pollMultiSelect: false,
            },
          })
        : await prisma.scheduledMessage.create({
            data: {
              ...baseRow,
              type: "POLL",
              copyText: null,
              imageUrl: null,
              pollQuestion: body.data.pollQuestion.trim(),
              pollOptions: body.data.pollOptions.map((o: string) => o.trim()),
              pollMultiSelect: body.data.pollMultiSelect,
            },
          });

    const jobId = await boss.sendAfter(
      SEND_SCHEDULED_MESSAGE_QUEUE,
      { scheduledMessageId: row.id },
      {},
      scheduledAt,
    );
    if (jobId === null) {
      await prisma.scheduledMessage.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          error: "Failed to enqueue pg-boss job",
        },
      });
      return reply.code(500).send({ error: "Failed to enqueue job" });
    }

    return reply.code(201).send({ message: row, jobId });
  });

  app.get("/messages", async (req: FastifyRequest, reply: FastifyReply) => {
    const q = ListQuerySchema.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: "Invalid query", details: q.error.flatten() });
    }
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const where: {
      projectId: string;
      status?: "PENDING" | "SENDING" | "SENT" | "FAILED";
      type?: "POST" | "POLL";
    } = { projectId };
    if (q.data.status !== undefined) {
      where.status = q.data.status;
    }
    if (q.data.type !== undefined) {
      where.type = q.data.type;
    }
    const messages = await prisma.scheduledMessage.findMany({
      where,
      orderBy: { scheduledAt: "desc" },
      take: 100,
    });
    return { messages };
  });
}
