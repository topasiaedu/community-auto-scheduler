/**
 * Campaign bulk schedule: transactional create of reminder + value fan-out rows.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import PgBoss from "pg-boss";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { CampaignCustomValues, PrismaClient, ReminderTemplate } from "@nmcas/db";
import {
  hasUnresolvedPlaceholders,
  mergeTemplate,
  REMINDER_TEMPLATE_SLOT_DEFINITIONS,
} from "@nmcas/db";
import { ensureReminderTemplates } from "../lib/ensureReminderTemplates.js";
import {
  computeOptionalValueTime,
  computeReminderSlotTime,
  computeValueSlotTime,
  isWebinarDateValid,
} from "../lib/campaignSchedule.js";
import {
  CAMPAIGN_MIN_LEAD_MS,
  classifyReminderSlot,
  type SkippedCampaignSlot,
} from "../lib/campaignSlotSkip.js";
import { enqueueScheduledMessage } from "../lib/enqueueMessage.js";
import { resolveValueFanOutDestinationsForProject, parseActiveCommunityJids } from "../lib/valueFanOut.js";
import type { WaConnectionPool } from "../wa/wa-pool.js";

type PgBossInstance = InstanceType<typeof PgBoss>;

const groupJidField = z.string().regex(/@g\.us$/, "groupJid must be a WhatsApp group JID");
const dateYmdField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const timeMytField = z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm");

const CustomValuesSchema = z.object({
  workshopDay: z.string().trim().min(1).max(32),
  workshopDate: z.string().trim().min(1).max(32),
  workshopTime: z.string().trim().min(1).max(64),
  zoomLink: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .refine((u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "zoomLink must be a valid http or https URL"),
  sessionDate: z.string().trim().min(1).max(64),
  sessionTime: z.string().trim().min(1).max(64),
  zoomId: z.string().trim().min(1).max(32),
  zoomPasscode: z.string().trim().min(1).max(16),
});

const ValuePostSchema = z.object({
  slotKey: z.enum(["value_1", "value_2", "value_3"]),
  imageUrl: z.string().min(1).max(2048),
  copyText: z.string().trim().min(1).max(4096),
});

const OptionalValuePostSchema = z.object({
  scheduledDate: dateYmdField,
  imageUrl: z.string().min(1).max(2048),
  copyText: z.string().trim().min(1).max(4096),
});

const reminderSlotKeyEnum = z.enum(
  REMINDER_TEMPLATE_SLOT_DEFINITIONS.map((s) => s.slotKey) as [
    string,
    ...string[],
  ],
);

const ScheduleCampaignBodySchema = z.object({
  webinarDate: dateYmdField,
  eventStartTimeMyt: timeMytField,
  customValues: CustomValuesSchema,
  reminderGroupJid: groupJidField,
  reminderGroupName: z.string().min(1).max(512),
  valuePosts: z.array(ValuePostSchema).optional().default([]),
  optionalValuePosts: z.array(OptionalValuePostSchema).optional().default([]),
  skipSlotKeys: z.array(reminderSlotKeyEnum).optional().default([]),
});

function customValuesToJson(values: CampaignCustomValues): Prisma.InputJsonValue {
  return {
    workshopDay: values.workshopDay,
    workshopDate: values.workshopDate,
    workshopTime: values.workshopTime,
    zoomLink: values.zoomLink,
    sessionDate: values.sessionDate,
    sessionTime: values.sessionTime,
    zoomId: values.zoomId,
    zoomPasscode: values.zoomPasscode,
  };
}

function validateTemplateAssets(template: ReminderTemplate): string | undefined {
  if (template.reminderFormat === "IMAGE") {
    if (template.mediaUrl === null || template.mediaUrl.length === 0) {
      return `Template "${template.slotKey}" is missing mediaUrl`;
    }
    if (template.bodyTemplate === null || template.bodyTemplate.trim().length === 0) {
      return `Template "${template.slotKey}" is missing bodyTemplate`;
    }
    return undefined;
  }
  if (template.reminderFormat === "TEXT") {
    if (template.bodyTemplate === null || template.bodyTemplate.trim().length === 0) {
      return `Template "${template.slotKey}" is missing bodyTemplate`;
    }
    return undefined;
  }
  if (template.reminderFormat === "STICKER") {
    // Post-live sticker is optional until a static WebP is uploaded — skipped at schedule time.
    return undefined;
  }
  return `Unknown format for template "${template.slotKey}"`;
}

function validateMergedCopy(
  template: ReminderTemplate,
  customValues: CampaignCustomValues,
): string | undefined {
  if (
    template.reminderFormat !== "IMAGE" &&
    template.reminderFormat !== "TEXT"
  ) {
    return undefined;
  }
  if (template.bodyTemplate === null) {
    return `Template "${template.slotKey}" has no bodyTemplate`;
  }
  const merged = mergeTemplate(customValues, template.bodyTemplate);
  if (hasUnresolvedPlaceholders(merged)) {
    return `Template "${template.slotKey}" has unresolved placeholders after merge`;
  }
  return undefined;
}

export function registerCampaignRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; boss: PgBossInstance; waPool: WaConnectionPool },
): void {
  const { prisma, boss, waPool } = deps;

  app.post("/campaigns/schedule", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ScheduleCampaignBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const projectId = req.activeProjectId;
    if (projectId === undefined || projectId.length === 0) {
      return reply.code(500).send({ error: "Project scope missing" });
    }
    const createdByUserId = req.authUserId ?? null;
    const body = parsed.data;
    const customValues: CampaignCustomValues = body.customValues;

    if (!isWebinarDateValid(body.webinarDate)) {
      return reply.code(400).send({ error: "webinarDate must be today or in the future (MYT)" });
    }

    const postsPrefix = `posts/${projectId}/`;
    for (const vp of [...body.valuePosts, ...body.optionalValuePosts]) {
      if (!vp.imageUrl.startsWith(postsPrefix)) {
        return reply.code(400).send({ error: "Value post imageUrl must be under posts/{projectId}/" });
      }
    }

    const requiredSlotKeys = ["value_1", "value_2", "value_3"] as const;
    if (body.valuePosts.length > 0) {
      const receivedSlotKeys = body.valuePosts.map((v) => v.slotKey).sort();
      const requiredSorted = [...requiredSlotKeys].sort();
      if (
        receivedSlotKeys.length !== requiredSorted.length ||
        receivedSlotKeys.some((key, i) => key !== requiredSorted[i])
      ) {
        return reply.code(400).send({ error: "valuePosts must include value_1, value_2, and value_3" });
      }
    }

    await ensureReminderTemplates(prisma, projectId);
    const templates = await prisma.reminderTemplate.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
    });
    if (templates.length < 6) {
      return reply.code(400).send({ error: "Reminder templates are not fully configured" });
    }

    for (const template of templates) {
      const assetErr = validateTemplateAssets(template);
      if (assetErr !== undefined) {
        return reply.code(400).send({ error: assetErr });
      }
      const mergeErr = validateMergedCopy(template, customValues);
      if (mergeErr !== undefined) {
        return reply.code(400).send({ error: mergeErr });
      }
    }

    const wa = waPool.getManager(projectId);
    await wa.start();
    const sendReady = await wa.isSendReady();
    if (!sendReady) {
      return reply.code(409).send({ error: "WhatsApp is not connected" });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project === null) {
      return reply.code(500).send({ error: `Project "${projectId}" not found` });
    }

    const groups = await wa.fetchGroupOptions();
    const hasValuePosts =
      body.valuePosts.length > 0 || body.optionalValuePosts.length > 0;
    const activeCommunityJids = parseActiveCommunityJids(project.activeCommunityJids);
    const { destinations, count } = resolveValueFanOutDestinationsForProject(
      groups,
      activeCommunityJids,
    );
    if (hasValuePosts && count === 0) {
      return reply
        .code(422)
        .send({ error: "No fan-out destinations: link WhatsApp and ensure at least one community has an Announcements channel" });
    }

    const webinarDate = new Date(`${body.webinarDate}T12:00:00+08:00`);
    const messageIds: string[] = [];
    const nowMs = Date.now();
    const minTime = new Date(nowMs + CAMPAIGN_MIN_LEAD_MS);
    const skipSlotKeySet = new Set(body.skipSlotKeys);
    const skippedSlots: SkippedCampaignSlot[] = [];
    let schedulableReminderCount = 0;

    for (const template of templates) {
      const scheduledAt = computeReminderSlotTime(
        template,
        body.webinarDate,
        body.eventStartTimeMyt,
      );
      const decision = classifyReminderSlot({
        template,
        scheduledAt,
        nowMs,
        skipSlotKeys: skipSlotKeySet,
      });
      if (decision.schedule) {
        schedulableReminderCount += 1;
      } else {
        skippedSlots.push({ slotKey: template.slotKey, reason: decision.reason });
      }
    }

    if (schedulableReminderCount === 0) {
      return reply
        .code(400)
        .send({ error: "No reminder slots are still in the future for this webinar date" });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const campaign = await tx.campaign.create({
          data: {
            projectId,
            webinarDate,
            eventStartTimeMyt: body.eventStartTimeMyt,
            reminderGroupJid: body.reminderGroupJid,
            reminderGroupName: body.reminderGroupName,
            customValues: customValuesToJson(customValues),
          },
        });

        let reminderCount = 0;
        for (const template of templates) {
          const scheduledAt = computeReminderSlotTime(
            template,
            body.webinarDate,
            body.eventStartTimeMyt,
          );
          const decision = classifyReminderSlot({
            template,
            scheduledAt,
            nowMs,
            skipSlotKeys: skipSlotKeySet,
          });
          if (!decision.schedule) {
            continue;
          }

          let copyText: string | null = null;
          let imageUrl: string | null = null;
          let stickerUrl: string | null = null;

          if (template.reminderFormat === "IMAGE") {
            copyText = mergeTemplate(customValues, template.bodyTemplate ?? "");
            imageUrl = template.mediaUrl;
          } else if (template.reminderFormat === "TEXT") {
            copyText = mergeTemplate(customValues, template.bodyTemplate ?? "");
          } else if (template.reminderFormat === "STICKER") {
            stickerUrl = template.stickerUrl;
          }

          const row = await tx.scheduledMessage.create({
            data: {
              projectId,
              campaignId: campaign.id,
              groupJid: body.reminderGroupJid,
              groupName: body.reminderGroupName,
              type: "POST",
              operatorKind: "REMINDER",
              reminderFormat: template.reminderFormat,
              reminderTemplateId: template.id,
              copyText,
              imageUrl,
              stickerUrl,
              pollQuestion: null,
              pollOptions: [],
              pollMultiSelect: false,
              scheduledAt,
              status: "PENDING",
              createdByUserId,
            },
          });
          messageIds.push(row.id);
          await enqueueScheduledMessage(boss, tx, row.id, scheduledAt);
          reminderCount += 1;
        }

        const valueRows: Array<{
          scheduledAt: Date;
          imageUrl: string;
          copyText: string;
        }> = body.valuePosts.map((vp) => ({
          scheduledAt: computeValueSlotTime(vp.slotKey, body.webinarDate),
          imageUrl: vp.imageUrl,
          copyText: vp.copyText,
        }));
        for (const ov of body.optionalValuePosts) {
          valueRows.push({
            scheduledAt: computeOptionalValueTime(ov.scheduledDate),
            imageUrl: ov.imageUrl,
            copyText: ov.copyText,
          });
        }

        if (valueRows.length > 0) {
          for (const valueRow of valueRows) {
            if (valueRow.scheduledAt.getTime() < minTime.getTime()) {
              throw new Error("A value post slot is in the past");
            }
            for (const dest of destinations) {
              const row = await tx.scheduledMessage.create({
                data: {
                  projectId,
                  campaignId: campaign.id,
                  groupJid: dest.groupJid,
                  groupName: dest.groupName,
                  type: "POST",
                  operatorKind: "VALUE",
                  valueFormat: "IMAGE_CAPTION",
                  copyText: valueRow.copyText,
                  imageUrl: valueRow.imageUrl,
                  stickerUrl: null,
                  pollQuestion: null,
                  pollOptions: [],
                  pollMultiSelect: false,
                  scheduledAt: valueRow.scheduledAt,
                  status: "PENDING",
                  createdByUserId,
                },
              });
              messageIds.push(row.id);
              await enqueueScheduledMessage(boss, tx, row.id, valueRow.scheduledAt);
            }
          }
        }

        const valueCount = valueRows.length * destinations.length;
        return {
          campaignId: campaign.id,
          reminderCount,
          valueCount,
          fanOutDestinations: destinations.map((d) => d.groupName),
        };
      });

      return reply.code(201).send({
        campaignId: result.campaignId,
        messageIds,
        reminderCount: result.reminderCount,
        skippedSlots,
        valueCount: result.valueCount,
        fanOutDestinations: result.fanOutDestinations,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Campaign schedule failed";
      if (message.includes("in the past")) {
        return reply.code(400).send({ error: message });
      }
      if (message.includes("enqueue")) {
        return reply.code(500).send({ error: message });
      }
      throw err;
    }
  });
}
