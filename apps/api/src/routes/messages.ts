/**
 * Scheduled messages: create (enqueue), list, cancel, draft, update draft / publish — POST and POLL.
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
    copyText: z.string().max(4096).optional(),
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
  status: z
    .enum(["PENDING", "SENDING", "SENT", "FAILED", "DRAFT", "CANCELLED"])
    .optional(),
  type: z.enum(["POST", "POLL"]).optional(),
});

const PatchDraftPostSchema = z.object({
  type: z.literal("POST"),
  groupJid: groupJidField,
  groupName: groupNameField,
  scheduledAt: scheduledAtField,
  publish: z.boolean(),
  copyText: z.string().max(4096).optional(),
  imageUrl: z.string().min(1).max(2048).optional(),
});

const PatchDraftPollSchema = z.object({
  type: z.literal("POLL"),
  groupJid: groupJidField,
  groupName: groupNameField,
  scheduledAt: scheduledAtField,
  publish: z.boolean(),
  pollQuestion: z.string().max(4096),
  pollOptions: z.array(z.string().max(256)).max(12),
  pollMultiSelect: z.boolean(),
});

const PatchDraftBodySchema = z.union([PatchDraftPostSchema, PatchDraftPollSchema]);

function parseScheduledAtUtc(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error("scheduledAt must be a valid ISO-8601 datetime");
  }
  return d;
}

type PgBossInstance = InstanceType<typeof PgBoss>;

async function safeCancelJob(boss: PgBossInstance, jobId: string | null | undefined): Promise<void> {
  if (jobId === null || jobId === undefined || jobId.length === 0) {
    return;
  }
  try {
    await boss.cancel(SEND_SCHEDULED_MESSAGE_QUEUE, jobId);
  } catch {
    /* job may have completed or been removed */
  }
}

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

    const createdByUserId = req.authUserId ?? null;

    const baseRow = {
      projectId,
      groupJid: body.data.groupJid,
      groupName: body.data.groupName,
      scheduledAt,
      status: "PENDING" as const,
      createdByUserId,
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

    const updated = await prisma.scheduledMessage.update({
      where: { id: row.id },
      data: { pgBossJobId: jobId },
    });

    return reply.code(201).send({ message: updated, jobId });
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
      status?:
        | "PENDING"
        | "SENDING"
        | "SENT"
        | "FAILED"
        | "DRAFT"
        | "CANCELLED";
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

  app.post("/messages/:id/cancel", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const id = typeof req.params === "object" && req.params !== null && "id" in req.params ? String(req.params.id) : "";
    if (id.length === 0) {
      return reply.code(400).send({ error: "Missing id" });
    }
    const row = await prisma.scheduledMessage.findFirst({
      where: { id, projectId },
    });
    if (row === null) {
      return reply.code(404).send({ error: "Message not found" });
    }
    if (row.status !== "PENDING" && row.status !== "DRAFT") {
      return reply.code(400).send({ error: "Only pending or draft messages can be cancelled" });
    }
    await safeCancelJob(boss, row.pgBossJobId);
    const updated = await prisma.scheduledMessage.update({
      where: { id: row.id },
      data: {
        status: "CANCELLED",
        pgBossJobId: null,
      },
    });
    return { message: updated };
  });

  /**
   * Re-enqueue the pg-boss send job. Needed when the row was set to PENDING/SENDING in SQL (no job exists),
   * or a stuck SENDING row lost its worker job after a deploy/crash.
   */
  app.post("/messages/:id/requeue", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const id = typeof req.params === "object" && req.params !== null && "id" in req.params ? String(req.params.id) : "";
    if (id.length === 0) {
      return reply.code(400).send({ error: "Missing id" });
    }
    const row = await prisma.scheduledMessage.findFirst({
      where: { id, projectId },
    });
    if (row === null) {
      return reply.code(404).send({ error: "Message not found" });
    }
    if (row.status !== "PENDING" && row.status !== "SENDING" && row.status !== "FAILED") {
      return reply
        .code(400)
        .send({ error: "Only PENDING, SENDING, or FAILED messages can be requeued" });
    }
    await safeCancelJob(boss, row.pgBossJobId);
    const minFire = new Date(Date.now() + 15_000);
    const fireAt =
      row.scheduledAt.getTime() < minFire.getTime() ? minFire : row.scheduledAt;
    const jobId = await boss.sendAfter(
      SEND_SCHEDULED_MESSAGE_QUEUE,
      { scheduledMessageId: row.id },
      {},
      fireAt,
    );
    if (jobId === null) {
      return reply.code(500).send({ error: "Failed to enqueue job" });
    }
    const updated = await prisma.scheduledMessage.update({
      where: { id: row.id },
      data: {
        status: "PENDING",
        pgBossJobId: jobId,
        error: null,
      },
    });
    return {
      message: updated,
      jobId,
      fireAt: fireAt.toISOString(),
    };
  });

  app.post("/messages/:id/draft", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const id = typeof req.params === "object" && req.params !== null && "id" in req.params ? String(req.params.id) : "";
    if (id.length === 0) {
      return reply.code(400).send({ error: "Missing id" });
    }
    const row = await prisma.scheduledMessage.findFirst({
      where: { id, projectId },
    });
    if (row === null) {
      return reply.code(404).send({ error: "Message not found" });
    }
    if (row.status !== "PENDING") {
      return reply.code(400).send({ error: "Only pending messages can be moved to draft" });
    }
    await safeCancelJob(boss, row.pgBossJobId);
    const updated = await prisma.scheduledMessage.update({
      where: { id: row.id },
      data: {
        status: "DRAFT",
        pgBossJobId: null,
      },
    });
    return { message: updated };
  });

  app.patch("/messages/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const id = typeof req.params === "object" && req.params !== null && "id" in req.params ? String(req.params.id) : "";
    if (id.length === 0) {
      return reply.code(400).send({ error: "Missing id" });
    }
    const body = PatchDraftBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.flatten() });
    }

    const row = await prisma.scheduledMessage.findFirst({
      where: { id, projectId },
    });
    if (row === null) {
      return reply.code(404).send({ error: "Message not found" });
    }
    if (row.status !== "DRAFT") {
      return reply.code(400).send({ error: "Only draft messages can be updated with this endpoint" });
    }

    const scheduledAt = parseScheduledAtUtc(body.data.scheduledAt);
    const d = body.data;

    if (d.type === "POST") {
      const copyTextTrimmed = d.copyText?.trim() ?? "";
      const hasImage = d.imageUrl !== undefined && d.imageUrl.length > 0;
      if (d.publish) {
        const minTime = new Date(Date.now() + 15_000);
        if (scheduledAt.getTime() < minTime.getTime()) {
          return reply.code(400).send({ error: "scheduledAt must be at least ~15 seconds in the future" });
        }
        if (copyTextTrimmed.length === 0 && !hasImage) {
          return reply.code(400).send({ error: "Provide text and/or image when publishing" });
        }
      }

      let updated = await prisma.scheduledMessage.update({
        where: { id: row.id },
        data: {
          type: "POST",
          groupJid: d.groupJid,
          groupName: d.groupName,
          scheduledAt,
          copyText: copyTextTrimmed.length > 0 ? copyTextTrimmed : null,
          imageUrl: d.imageUrl ?? null,
          pollQuestion: null,
          pollOptions: [],
          pollMultiSelect: false,
          error: null,
        },
      });

      if (d.publish) {
        const jobId = await boss.sendAfter(
          SEND_SCHEDULED_MESSAGE_QUEUE,
          { scheduledMessageId: updated.id },
          {},
          scheduledAt,
        );
        if (jobId === null) {
          await prisma.scheduledMessage.update({
            where: { id: row.id },
            data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
          });
          return reply.code(500).send({ error: "Failed to enqueue job" });
        }
        updated = await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: {
            status: "PENDING",
            pgBossJobId: jobId,
          },
        });
      }

      return { message: updated };
    }

    const pollOpts = d.pollOptions.map((o: string) => o.trim()).filter((o: string) => o.length > 0);
    if (d.publish) {
      const minTime = new Date(Date.now() + 15_000);
      if (scheduledAt.getTime() < minTime.getTime()) {
        return reply.code(400).send({ error: "scheduledAt must be at least ~15 seconds in the future" });
      }
      if (d.pollQuestion.trim().length === 0) {
        return reply.code(400).send({ error: "Poll question is required when publishing" });
      }
      if (pollOpts.length < 2) {
        return reply.code(400).send({ error: "At least two poll options required when publishing" });
      }
    }

    let updated = await prisma.scheduledMessage.update({
      where: { id: row.id },
      data: {
        type: "POLL",
        groupJid: d.groupJid,
        groupName: d.groupName,
        scheduledAt,
        copyText: null,
        imageUrl: null,
        pollQuestion: d.pollQuestion.trim().length > 0 ? d.pollQuestion.trim() : null,
        pollOptions: pollOpts,
        pollMultiSelect: d.pollMultiSelect,
        error: null,
      },
    });

    if (d.publish) {
      const jobId = await boss.sendAfter(
        SEND_SCHEDULED_MESSAGE_QUEUE,
        { scheduledMessageId: updated.id },
        {},
        scheduledAt,
      );
      if (jobId === null) {
        await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
        });
        return reply.code(500).send({ error: "Failed to enqueue job" });
      }
      updated = await prisma.scheduledMessage.update({
        where: { id: row.id },
        data: {
          status: "PENDING",
          pgBossJobId: jobId,
        },
      });
    }

    return { message: updated };
  });
}
