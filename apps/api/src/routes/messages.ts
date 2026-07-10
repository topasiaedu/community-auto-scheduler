/**
 * Scheduled messages: create (enqueue), list, cancel, draft, update draft / publish.
 * Supports legacy POST/POLL and P7 operatorKind (VALUE / REMINDER) formats.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import PgBoss from "pg-boss";
import { z } from "zod";
import type { PrismaClient } from "@nmcas/db";
import { SEND_SCHEDULED_MESSAGE_QUEUE } from "../queues.js";
import { enqueueScheduledMessage } from "../lib/enqueueMessage.js";
import {
  parseActiveCommunityJids,
  resolveValueFanOutDestinationsForProject,
} from "../lib/valueFanOut.js";
import type { WaConnectionPool } from "../wa/wa-pool.js";
import {
  CustomValuesSchema,
  groupJidField,
  groupNameField,
  scheduledAtField,
} from "../lib/messageSchemas.js";
import {
  buildReminderSnapshot,
  validateReminderTemplateAssets,
} from "../lib/reminderMessage.js";

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

const CreateValueImageCaptionFanOutSchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("IMAGE_CAPTION"),
  fanOut: z.literal(true),
  copyText: z.string().trim().min(1).max(4096),
  imageUrl: z.string().min(1).max(2048),
  scheduledAt: scheduledAtField,
});

const CreateValueImageCaptionSchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("IMAGE_CAPTION"),
  groupJid: groupJidField,
  groupName: groupNameField,
  copyText: z.string().trim().min(1).max(4096),
  imageUrl: z.string().min(1).max(2048),
  scheduledAt: scheduledAtField,
});

const CreateValueTextOnlyFanOutSchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("TEXT_ONLY"),
  fanOut: z.literal(true),
  copyText: z.string().trim().min(1).max(4096),
  scheduledAt: scheduledAtField,
});

const CreateValueTextOnlySchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("TEXT_ONLY"),
  groupJid: groupJidField,
  groupName: groupNameField,
  copyText: z.string().trim().min(1).max(4096),
  scheduledAt: scheduledAtField,
});

const CreateValuePollFanOutSchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("POLL"),
  fanOut: z.literal(true),
  pollQuestion: z.string().min(1).max(4096),
  pollOptions: z
    .array(z.string().min(1).max(256))
    .min(2, "At least two poll options")
    .max(12, "WhatsApp allows at most 12 poll options"),
  pollMultiSelect: z.boolean(),
  scheduledAt: scheduledAtField,
});

const CreateValuePollSchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("POLL"),
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

const CreateReminderSchema = z.object({
  operatorKind: z.literal("REMINDER"),
  reminderTemplateId: z.string().min(1).max(64),
  customValues: CustomValuesSchema,
  groupJid: groupJidField,
  groupName: groupNameField,
  scheduledAt: scheduledAtField,
});

const CreateMessageBodySchema = z.preprocess((raw: unknown) => {
  if (typeof raw === "object" && raw !== null) {
    if ("operatorKind" in raw) {
      return raw;
    }
    if (!("type" in raw)) {
      return { ...raw, type: "POST" as const };
    }
  }
  return raw;
}, z.union([
  CreateReminderSchema,
  CreateValueImageCaptionFanOutSchema,
  CreateValueImageCaptionSchema,
  CreateValueTextOnlyFanOutSchema,
  CreateValueTextOnlySchema,
  CreateValuePollFanOutSchema,
  CreateValuePollSchema,
  CreatePostMessageSchema,
  CreatePollMessageSchema,
]));

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

const PatchDraftValueImageSchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("IMAGE_CAPTION"),
  groupJid: groupJidField,
  groupName: groupNameField,
  scheduledAt: scheduledAtField,
  publish: z.boolean(),
  copyText: z.string().max(4096).optional(),
  imageUrl: z.string().min(1).max(2048).optional(),
});

const PatchDraftValueTextSchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("TEXT_ONLY"),
  groupJid: groupJidField,
  groupName: groupNameField,
  scheduledAt: scheduledAtField,
  publish: z.boolean(),
  copyText: z.string().max(4096).optional(),
});

const PatchDraftValuePollSchema = z.object({
  operatorKind: z.literal("VALUE"),
  valueFormat: z.literal("POLL"),
  groupJid: groupJidField,
  groupName: groupNameField,
  scheduledAt: scheduledAtField,
  publish: z.boolean(),
  pollQuestion: z.string().max(4096).optional(),
  pollOptions: z.array(z.string().max(256)).max(12).optional(),
  pollMultiSelect: z.boolean().optional(),
});

const PatchDraftReminderSchema = z.object({
  operatorKind: z.literal("REMINDER"),
  reminderTemplateId: z.string().min(1).max(64),
  customValues: CustomValuesSchema,
  groupJid: groupJidField,
  groupName: groupNameField,
  scheduledAt: scheduledAtField,
  publish: z.boolean(),
});

const PatchDraftBodySchema = z.preprocess((raw: unknown) => {
  if (typeof raw === "object" && raw !== null && "operatorKind" in raw) {
    return raw;
  }
  return raw;
}, z.union([
  PatchDraftReminderSchema,
  PatchDraftValueImageSchema,
  PatchDraftValueTextSchema,
  PatchDraftValuePollSchema,
  PatchDraftPostSchema,
  PatchDraftPollSchema,
]));

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

async function enqueueAndAttachJob(
  boss: PgBossInstance,
  prisma: PrismaClient,
  rowId: string,
  scheduledAt: Date,
): Promise<string | null> {
  const jobId = await boss.sendAfter(
    SEND_SCHEDULED_MESSAGE_QUEUE,
    { scheduledMessageId: rowId },
    {},
    scheduledAt,
  );
  if (jobId === null) {
    return null;
  }
  await prisma.scheduledMessage.update({
    where: { id: rowId },
    data: { pgBossJobId: jobId },
  });
  return jobId;
}

type ValueFanOutBody =
  | z.infer<typeof CreateValueImageCaptionFanOutSchema>
  | z.infer<typeof CreateValueTextOnlyFanOutSchema>
  | z.infer<typeof CreateValuePollFanOutSchema>;

function isValueFanOutBody(data: z.infer<typeof CreateMessageBodySchema>): data is ValueFanOutBody {
  return (
    "operatorKind" in data &&
    data.operatorKind === "VALUE" &&
    "fanOut" in data &&
    data.fanOut === true
  );
}

export function registerMessageRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; boss: PgBossInstance; waPool: WaConnectionPool },
): void {
  const { prisma, boss, waPool } = deps;

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
    const messageBody = body.data;

    if (isValueFanOutBody(messageBody)) {
      const fanOutBody = messageBody;
      const wa = waPool.getManager(projectId);
      await wa.start();
      const sendReady = await wa.isSendReady();
      if (!sendReady) {
        return reply.code(409).send({ error: "WhatsApp is not connected" });
      }
      const groups = await wa.fetchGroupOptions();
      const activeCommunityJids = parseActiveCommunityJids(project.activeCommunityJids);
      const { destinations, count } = resolveValueFanOutDestinationsForProject(
        groups,
        activeCommunityJids,
      );
      if (count === 0) {
        return reply.code(422).send({
          error:
            "No active communities with an Announcements channel. Check Settings or WhatsApp connection.",
        });
      }
      if (fanOutBody.valueFormat === "IMAGE_CAPTION") {
        const postsPrefix = `posts/${projectId}/`;
        if (!fanOutBody.imageUrl.startsWith(postsPrefix)) {
          return reply.code(400).send({ error: "Value post imageUrl must be under posts/{projectId}/" });
        }
      }

      const messageIds: string[] = [];
      try {
        const fanOutResult = await prisma.$transaction(async (tx) => {
          for (const dest of destinations) {
            const shared = {
              projectId,
              groupJid: dest.groupJid,
              groupName: dest.groupName,
              scheduledAt,
              status: "PENDING" as const,
              createdByUserId,
              operatorKind: "VALUE" as const,
            };
            const row =
              fanOutBody.valueFormat === "IMAGE_CAPTION"
                ? await tx.scheduledMessage.create({
                    data: {
                      ...shared,
                      type: "POST",
                      valueFormat: "IMAGE_CAPTION",
                      copyText: fanOutBody.copyText,
                      imageUrl: fanOutBody.imageUrl,
                      stickerUrl: null,
                      pollQuestion: null,
                      pollOptions: [],
                      pollMultiSelect: false,
                    },
                  })
                : fanOutBody.valueFormat === "TEXT_ONLY"
                  ? await tx.scheduledMessage.create({
                      data: {
                        ...shared,
                        type: "POST",
                        valueFormat: "TEXT_ONLY",
                        copyText: fanOutBody.copyText,
                        imageUrl: null,
                        stickerUrl: null,
                        pollQuestion: null,
                        pollOptions: [],
                        pollMultiSelect: false,
                      },
                    })
                  : await tx.scheduledMessage.create({
                      data: {
                        ...shared,
                        type: "POLL",
                        valueFormat: "POLL",
                        copyText: null,
                        imageUrl: null,
                        stickerUrl: null,
                        pollQuestion: fanOutBody.pollQuestion.trim(),
                        pollOptions: fanOutBody.pollOptions.map((o: string) => o.trim()),
                        pollMultiSelect: fanOutBody.pollMultiSelect,
                      },
                    });
            messageIds.push(row.id);
            await enqueueScheduledMessage(boss, tx, row.id, scheduledAt);
          }
          return {
            fanOutCount: count,
            destinations: destinations.map((d) => d.groupName),
          };
        });
        return reply.code(201).send({
          messageIds,
          fanOutCount: fanOutResult.fanOutCount,
          destinations: fanOutResult.destinations,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Value fan-out schedule failed";
        if (message.includes("enqueue")) {
          return reply.code(500).send({ error: message });
        }
        throw err;
      }
    }

    const baseRow = {
      projectId,
      groupJid: "groupJid" in messageBody ? messageBody.groupJid : "",
      groupName: "groupName" in messageBody ? messageBody.groupName : "",
      scheduledAt,
      status: "PENDING" as const,
      createdByUserId,
    };

    if ("operatorKind" in body.data && body.data.operatorKind === "REMINDER") {
      const template = await prisma.reminderTemplate.findFirst({
        where: { id: body.data.reminderTemplateId, projectId },
      });
      if (template === null) {
        return reply.code(400).send({ error: "Reminder template not found" });
      }
      const assetErr = validateReminderTemplateAssets(template);
      if (assetErr !== undefined) {
        return reply.code(400).send({ error: assetErr });
      }
      const snapshot = buildReminderSnapshot(template, body.data.customValues);
      const row = await prisma.scheduledMessage.create({
        data: {
          ...baseRow,
          type: "POST",
          operatorKind: "REMINDER",
          reminderFormat: snapshot.reminderFormat,
          reminderTemplateId: template.id,
          copyText: snapshot.copyText,
          imageUrl: snapshot.imageUrl,
          stickerUrl: snapshot.stickerUrl,
          pollQuestion: null,
          pollOptions: [],
          pollMultiSelect: false,
        },
      });
      const jobId = await enqueueAndAttachJob(boss, prisma, row.id, scheduledAt);
      if (jobId === null) {
        await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
        });
        return reply.code(500).send({ error: "Failed to enqueue job" });
      }
      const updated = await prisma.scheduledMessage.findUnique({ where: { id: row.id } });
      return reply.code(201).send({ message: updated, jobId });
    }

    if ("operatorKind" in body.data && body.data.operatorKind === "VALUE") {
      if (body.data.valueFormat === "IMAGE_CAPTION") {
        const row = await prisma.scheduledMessage.create({
          data: {
            ...baseRow,
            type: "POST",
            operatorKind: "VALUE",
            valueFormat: "IMAGE_CAPTION",
            copyText: body.data.copyText,
            imageUrl: body.data.imageUrl,
            stickerUrl: null,
            pollQuestion: null,
            pollOptions: [],
            pollMultiSelect: false,
          },
        });
        const jobId = await enqueueAndAttachJob(boss, prisma, row.id, scheduledAt);
        if (jobId === null) {
          await prisma.scheduledMessage.update({
            where: { id: row.id },
            data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
          });
          return reply.code(500).send({ error: "Failed to enqueue job" });
        }
        const updated = await prisma.scheduledMessage.findUnique({ where: { id: row.id } });
        return reply.code(201).send({ message: updated, jobId });
      }
      if (body.data.valueFormat === "TEXT_ONLY") {
        const row = await prisma.scheduledMessage.create({
          data: {
            ...baseRow,
            type: "POST",
            operatorKind: "VALUE",
            valueFormat: "TEXT_ONLY",
            copyText: body.data.copyText,
            imageUrl: null,
            stickerUrl: null,
            pollQuestion: null,
            pollOptions: [],
            pollMultiSelect: false,
          },
        });
        const jobId = await enqueueAndAttachJob(boss, prisma, row.id, scheduledAt);
        if (jobId === null) {
          await prisma.scheduledMessage.update({
            where: { id: row.id },
            data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
          });
          return reply.code(500).send({ error: "Failed to enqueue job" });
        }
        const updated = await prisma.scheduledMessage.findUnique({ where: { id: row.id } });
        return reply.code(201).send({ message: updated, jobId });
      }
      const row = await prisma.scheduledMessage.create({
        data: {
          ...baseRow,
          type: "POLL",
          operatorKind: "VALUE",
          valueFormat: "POLL",
          copyText: null,
          imageUrl: null,
          stickerUrl: null,
          pollQuestion: body.data.pollQuestion.trim(),
          pollOptions: body.data.pollOptions.map((o: string) => o.trim()),
          pollMultiSelect: body.data.pollMultiSelect,
        },
      });
      const jobId = await enqueueAndAttachJob(boss, prisma, row.id, scheduledAt);
      if (jobId === null) {
        await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
        });
        return reply.code(500).send({ error: "Failed to enqueue job" });
      }
      const updated = await prisma.scheduledMessage.findUnique({ where: { id: row.id } });
      return reply.code(201).send({ message: updated, jobId });
    }

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

    const jobId = await enqueueAndAttachJob(boss, prisma, row.id, scheduledAt);
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

    const updated = await prisma.scheduledMessage.findUnique({ where: { id: row.id } });
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
    const rows = await prisma.scheduledMessage.findMany({
      where,
      orderBy: { scheduledAt: "desc" },
      take: 100,
      include: {
        campaign: { select: { id: true, webinarDate: true } },
        reminderTemplate: { select: { slotKey: true, name: true } },
      },
    });
    const messages = rows.map((row) => {
      const { campaign, reminderTemplate, ...message } = row;
      return {
        ...message,
        campaignId: message.campaignId,
        campaignWebinarDate:
          campaign !== null
            ? campaign.webinarDate.toISOString().slice(0, 10)
            : null,
        reminderTemplateSlotKey: reminderTemplate?.slotKey ?? null,
        reminderTemplateName: reminderTemplate?.name ?? null,
      };
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
    if (row.status === "SENDING") {
      const stuckCutoff = new Date(Date.now() - 5 * 60_000);
      if (row.scheduledAt.getTime() > stuckCutoff.getTime()) {
        return reply.code(409).send({
          error:
            "This message may still be sending. Please wait at least 5 minutes after the scheduled time before re-queueing a SENDING message.",
        });
      }
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

    if ("operatorKind" in d && d.operatorKind === "REMINDER") {
      const template = await prisma.reminderTemplate.findFirst({
        where: { id: d.reminderTemplateId, projectId },
      });
      if (template === null) {
        return reply.code(400).send({ error: "Reminder template not found" });
      }
      if (d.publish) {
        const minTime = new Date(Date.now() + 15_000);
        if (scheduledAt.getTime() < minTime.getTime()) {
          return reply.code(400).send({ error: "scheduledAt must be at least ~15 seconds in the future" });
        }
        const assetErr = validateReminderTemplateAssets(template);
        if (assetErr !== undefined) {
          return reply.code(400).send({ error: assetErr });
        }
      }
      const snapshot = buildReminderSnapshot(template, d.customValues);
      let updated = await prisma.scheduledMessage.update({
        where: { id: row.id },
        data: {
          type: "POST",
          operatorKind: "REMINDER",
          reminderFormat: snapshot.reminderFormat,
          reminderTemplateId: template.id,
          valueFormat: null,
          groupJid: d.groupJid,
          groupName: d.groupName,
          scheduledAt,
          copyText: snapshot.copyText,
          imageUrl: snapshot.imageUrl,
          stickerUrl: snapshot.stickerUrl,
          pollQuestion: null,
          pollOptions: [],
          pollMultiSelect: false,
          error: null,
        },
      });
      if (d.publish) {
        const jobId = await enqueueAndAttachJob(boss, prisma, updated.id, scheduledAt);
        if (jobId === null) {
          await prisma.scheduledMessage.update({
            where: { id: row.id },
            data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
          });
          return reply.code(500).send({ error: "Failed to enqueue job" });
        }
        updated = await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: { status: "PENDING", pgBossJobId: jobId },
        });
      }
      return { message: updated };
    }

    if ("operatorKind" in d && d.operatorKind === "VALUE") {
      if (d.valueFormat === "IMAGE_CAPTION") {
        const copyTextTrimmed = d.copyText?.trim() ?? "";
        const hasImage = d.imageUrl !== undefined && d.imageUrl.length > 0;
        if (d.publish) {
          const minTime = new Date(Date.now() + 15_000);
          if (scheduledAt.getTime() < minTime.getTime()) {
            return reply.code(400).send({ error: "scheduledAt must be at least ~15 seconds in the future" });
          }
          if (copyTextTrimmed.length === 0 || !hasImage) {
            return reply.code(400).send({ error: "Image and caption are required when publishing" });
          }
        }
        let updated = await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: {
            type: "POST",
            operatorKind: "VALUE",
            valueFormat: "IMAGE_CAPTION",
            reminderFormat: null,
            reminderTemplateId: null,
            groupJid: d.groupJid,
            groupName: d.groupName,
            scheduledAt,
            copyText: copyTextTrimmed.length > 0 ? copyTextTrimmed : null,
            imageUrl: d.imageUrl ?? null,
            stickerUrl: null,
            pollQuestion: null,
            pollOptions: [],
            pollMultiSelect: false,
            error: null,
          },
        });
        if (d.publish) {
          const jobId = await enqueueAndAttachJob(boss, prisma, updated.id, scheduledAt);
          if (jobId === null) {
            await prisma.scheduledMessage.update({
              where: { id: row.id },
              data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
            });
            return reply.code(500).send({ error: "Failed to enqueue job" });
          }
          updated = await prisma.scheduledMessage.update({
            where: { id: row.id },
            data: { status: "PENDING", pgBossJobId: jobId },
          });
        }
        return { message: updated };
      }

      if (d.valueFormat === "TEXT_ONLY") {
        const copyTextTrimmed = d.copyText?.trim() ?? "";
        if (d.publish) {
          const minTime = new Date(Date.now() + 15_000);
          if (scheduledAt.getTime() < minTime.getTime()) {
            return reply.code(400).send({ error: "scheduledAt must be at least ~15 seconds in the future" });
          }
          if (copyTextTrimmed.length === 0) {
            return reply.code(400).send({ error: "Caption is required when publishing" });
          }
        }
        let updated = await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: {
            type: "POST",
            operatorKind: "VALUE",
            valueFormat: "TEXT_ONLY",
            reminderFormat: null,
            reminderTemplateId: null,
            groupJid: d.groupJid,
            groupName: d.groupName,
            scheduledAt,
            copyText: copyTextTrimmed.length > 0 ? copyTextTrimmed : null,
            imageUrl: null,
            stickerUrl: null,
            pollQuestion: null,
            pollOptions: [],
            pollMultiSelect: false,
            error: null,
          },
        });
        if (d.publish) {
          const jobId = await enqueueAndAttachJob(boss, prisma, updated.id, scheduledAt);
          if (jobId === null) {
            await prisma.scheduledMessage.update({
              where: { id: row.id },
              data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
            });
            return reply.code(500).send({ error: "Failed to enqueue job" });
          }
          updated = await prisma.scheduledMessage.update({
            where: { id: row.id },
            data: { status: "PENDING", pgBossJobId: jobId },
          });
        }
        return { message: updated };
      }

      const pollOpts = (d.pollOptions ?? []).map((o: string) => o.trim()).filter((o: string) => o.length > 0);
      const pollQuestion = d.pollQuestion?.trim() ?? "";
      const pollMultiSelect = d.pollMultiSelect ?? false;
      if (d.publish) {
        const minTime = new Date(Date.now() + 15_000);
        if (scheduledAt.getTime() < minTime.getTime()) {
          return reply.code(400).send({ error: "scheduledAt must be at least ~15 seconds in the future" });
        }
        if (pollQuestion.length === 0) {
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
          operatorKind: "VALUE",
          valueFormat: "POLL",
          reminderFormat: null,
          reminderTemplateId: null,
          groupJid: d.groupJid,
          groupName: d.groupName,
          scheduledAt,
          copyText: null,
          imageUrl: null,
          stickerUrl: null,
          pollQuestion: pollQuestion.length > 0 ? pollQuestion : null,
          pollOptions: pollOpts,
          pollMultiSelect,
          error: null,
        },
      });
      if (d.publish) {
        const jobId = await enqueueAndAttachJob(boss, prisma, updated.id, scheduledAt);
        if (jobId === null) {
          await prisma.scheduledMessage.update({
            where: { id: row.id },
            data: { status: "FAILED", error: "Failed to enqueue pg-boss job" },
          });
          return reply.code(500).send({ error: "Failed to enqueue job" });
        }
        updated = await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: { status: "PENDING", pgBossJobId: jobId },
        });
      }
      return { message: updated };
    }

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
        const jobId = await enqueueAndAttachJob(boss, prisma, updated.id, scheduledAt);
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
      const jobId = await enqueueAndAttachJob(boss, prisma, updated.id, scheduledAt);
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
