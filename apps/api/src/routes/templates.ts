/**
 * Templates routes: list and patch reminder template slots per project.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PrismaClient, ReminderFormat } from "@nmcas/db";
import { REMINDER_TEMPLATE_SLOT_DEFINITIONS } from "@nmcas/db";
import { ensureReminderTemplates } from "../lib/ensureReminderTemplates.js";

const VALID_SLOT_KEYS = new Set(
  REMINDER_TEMPLATE_SLOT_DEFINITIONS.map((s) => s.slotKey),
);

const PatchTemplateBodySchema = z
  .object({
    mediaUrl: z.string().min(1).max(2048).optional(),
    stickerUrl: z.string().min(1).max(2048).optional(),
    bodyTemplate: z.string().max(16000).optional(),
  })
  .refine(
    (b) =>
      b.mediaUrl !== undefined ||
      b.stickerUrl !== undefined ||
      b.bodyTemplate !== undefined,
    { message: "Provide at least one of mediaUrl, stickerUrl, or bodyTemplate" },
  );

function templateToJson(row: {
  id: string;
  slotKey: string;
  name: string;
  reminderFormat: ReminderFormat;
  mediaUrl: string | null;
  stickerUrl: string | null;
  bodyTemplate: string | null;
  scheduleRuleKind: string;
  dayOffset: number | null;
  clockTimeMyt: string | null;
  startOffsetMinutes: number | null;
  sortOrder: number;
}) {
  return {
    id: row.id,
    slotKey: row.slotKey,
    name: row.name,
    reminderFormat: row.reminderFormat,
    mediaUrl: row.mediaUrl,
    stickerUrl: row.stickerUrl,
    bodyTemplate: row.bodyTemplate,
    scheduleRuleKind: row.scheduleRuleKind,
    dayOffset: row.dayOffset,
    clockTimeMyt: row.clockTimeMyt,
    startOffsetMinutes: row.startOffsetMinutes,
    sortOrder: row.sortOrder,
  };
}

function validateMediaPath(path: string, prefix: string): boolean {
  return path.startsWith(prefix);
}

function validatePatchForFormat(
  format: ReminderFormat,
  projectId: string,
  body: z.infer<typeof PatchTemplateBodySchema>,
): string | undefined {
  if (format === "IMAGE") {
    if (body.stickerUrl !== undefined) {
      return "stickerUrl is not allowed for IMAGE templates";
    }
    if (
      body.mediaUrl !== undefined &&
      !validateMediaPath(body.mediaUrl, `reminders/${projectId}/`)
    ) {
      return "mediaUrl must be under reminders/{projectId}/";
    }
    if (
      body.bodyTemplate !== undefined &&
      body.bodyTemplate.trim().length === 0
    ) {
      return "bodyTemplate must be non-empty for IMAGE templates";
    }
    return undefined;
  }
  if (format === "TEXT") {
    if (body.mediaUrl !== undefined || body.stickerUrl !== undefined) {
      return "mediaUrl and stickerUrl are not allowed for TEXT templates";
    }
    if (
      body.bodyTemplate !== undefined &&
      body.bodyTemplate.trim().length === 0
    ) {
      return "bodyTemplate must be non-empty for TEXT templates";
    }
    return undefined;
  }
  if (format === "STICKER") {
    if (body.bodyTemplate !== undefined && body.bodyTemplate.trim().length > 0) {
      return "bodyTemplate must be empty for STICKER templates";
    }
    if (body.mediaUrl !== undefined) {
      return "mediaUrl is not allowed for STICKER templates";
    }
    if (
      body.stickerUrl !== undefined &&
      !validateMediaPath(body.stickerUrl, `stickers/${projectId}/`)
    ) {
      return "stickerUrl must be under stickers/{projectId}/";
    }
    return undefined;
  }
  return "Unknown reminder format";
}

export function registerTemplateRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get("/templates", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    await ensureReminderTemplates(prisma, projectId);
    const rows = await prisma.reminderTemplate.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
    });
    return { templates: rows.map(templateToJson) };
  });

  app.get("/templates/:slotKey", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const slotKey =
      typeof req.params === "object" && req.params !== null && "slotKey" in req.params
        ? String(req.params.slotKey)
        : "";
    if (!VALID_SLOT_KEYS.has(slotKey)) {
      return reply.code(404).send({ error: "Unknown template slot" });
    }
    await ensureReminderTemplates(prisma, projectId);
    const row = await prisma.reminderTemplate.findUnique({
      where: { projectId_slotKey: { projectId, slotKey } },
    });
    if (row === null) {
      return reply.code(404).send({ error: "Template not found" });
    }
    return { template: templateToJson(row) };
  });

  app.patch("/templates/:slotKey", async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const slotKey =
      typeof req.params === "object" && req.params !== null && "slotKey" in req.params
        ? String(req.params.slotKey)
        : "";
    if (!VALID_SLOT_KEYS.has(slotKey)) {
      return reply.code(404).send({ error: "Unknown template slot" });
    }
    const parsed = PatchTemplateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    await ensureReminderTemplates(prisma, projectId);
    const existing = await prisma.reminderTemplate.findUnique({
      where: { projectId_slotKey: { projectId, slotKey } },
    });
    if (existing === null) {
      return reply.code(404).send({ error: "Template not found" });
    }
    const formatError = validatePatchForFormat(
      existing.reminderFormat,
      projectId,
      parsed.data,
    );
    if (formatError !== undefined) {
      return reply.code(400).send({ error: formatError });
    }
    const data: {
      mediaUrl?: string | null;
      stickerUrl?: string | null;
      bodyTemplate?: string | null;
    } = {};
    if (parsed.data.mediaUrl !== undefined) {
      data.mediaUrl = parsed.data.mediaUrl;
    }
    if (parsed.data.stickerUrl !== undefined) {
      data.stickerUrl = parsed.data.stickerUrl;
    }
    if (parsed.data.bodyTemplate !== undefined) {
      data.bodyTemplate = parsed.data.bodyTemplate;
    }
    const updated = await prisma.reminderTemplate.update({
      where: { projectId_slotKey: { projectId, slotKey } },
      data,
    });
    return { template: templateToJson(updated) };
  });
}
