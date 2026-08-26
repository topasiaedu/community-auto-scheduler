/**
 * One-off: apply WhatsApp bold + spacing copy to Lucas + Dr Jasmine templates,
 * then refresh PENDING/DRAFT reminder snapshots. Does NOT send or re-enqueue jobs.
 *
 * Usage (from repo root):
 *   npx tsx scripts/format-reminder-copy.ts --dry-run
 *   npx tsx scripts/format-reminder-copy.ts
 */

import { config } from "dotenv";
import {
  mergeTemplate,
  PrismaClient,
  REMINDER_TEMPLATE_SLOT_DEFINITIONS,
  type CampaignCustomValues,
} from "@nmcas/db";
import {
  LUCAS_BODY_BY_SLOT,
  LUCAS_PROJECT_ID,
} from "./lucasReminderBodies.js";

config();

const DR_JASMINE_PROJECT_ID = "cmresmpxn0000x1w6vet6i42z";
const TARGET_PROJECT_IDS = [LUCAS_PROJECT_ID, DR_JASMINE_PROJECT_ID] as const;

const EMPTY_CUSTOM_VALUES: CampaignCustomValues = {
  workshopDay: "",
  workshopDate: "",
  workshopTime: "",
  zoomLink: "",
  sessionDate: "",
  sessionTime: "",
  zoomId: "",
  zoomPasscode: "",
};

function asCustomValues(raw: unknown): CampaignCustomValues {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_CUSTOM_VALUES;
  }
  const o = raw as Record<string, unknown>;
  return {
    workshopDay: typeof o.workshopDay === "string" ? o.workshopDay : "",
    workshopDate: typeof o.workshopDate === "string" ? o.workshopDate : "",
    workshopTime: typeof o.workshopTime === "string" ? o.workshopTime : "",
    zoomLink: typeof o.zoomLink === "string" ? o.zoomLink : "",
    sessionDate: typeof o.sessionDate === "string" ? o.sessionDate : "",
    sessionTime: typeof o.sessionTime === "string" ? o.sessionTime : "",
    zoomId: typeof o.zoomId === "string" ? o.zoomId : "",
    zoomPasscode: typeof o.zoomPasscode === "string" ? o.zoomPasscode : "",
  };
}

function jasmineBodyBySlot(): Map<string, string> {
  const map = new Map<string, string>();
  for (const slot of REMINDER_TEMPLATE_SLOT_DEFINITIONS) {
    if (slot.bodyTemplate !== null) {
      map.set(slot.slotKey, slot.bodyTemplate);
    }
  }
  return map;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL required");
  }

  const prisma = new PrismaClient();
  const jasmineBodies = jasmineBodyBySlot();

  try {
    const projects = await prisma.project.findMany({
      where: { id: { in: [...TARGET_PROJECT_IDS] } },
      select: { id: true, name: true },
    });
    if (projects.length !== TARGET_PROJECT_IDS.length) {
      throw new Error(
        `Expected ${String(TARGET_PROJECT_IDS.length)} projects, found ${String(projects.length)}`,
      );
    }

    let templateUpdates = 0;
    for (const project of projects) {
      const bodies =
        project.id === LUCAS_PROJECT_ID ? LUCAS_BODY_BY_SLOT : Object.fromEntries(jasmineBodies);
      const templates = await prisma.reminderTemplate.findMany({
        where: { projectId: project.id },
        select: { id: true, slotKey: true, bodyTemplate: true },
      });

      for (const template of templates) {
        const nextBody = bodies[template.slotKey];
        if (nextBody === undefined) {
          continue;
        }
        if (template.bodyTemplate === nextBody) {
          continue;
        }
        templateUpdates += 1;
        console.log(
          `[template] ${project.name} ${template.slotKey} → ${String(nextBody.length)} chars`,
        );
        if (!dryRun) {
          await prisma.reminderTemplate.update({
            where: { id: template.id },
            data: { bodyTemplate: nextBody },
          });
        }
      }
    }

    const unsent = await prisma.scheduledMessage.findMany({
      where: {
        projectId: { in: [...TARGET_PROJECT_IDS] },
        status: { in: ["PENDING", "DRAFT"] },
        operatorKind: "REMINDER",
        reminderFormat: { in: ["TEXT", "IMAGE"] },
        reminderTemplateId: { not: null },
      },
      select: {
        id: true,
        projectId: true,
        status: true,
        campaignId: true,
        reminderTemplateId: true,
        scheduledAt: true,
        copyText: true,
      },
    });

    const campaigns = await prisma.campaign.findMany({
      where: {
        id: {
          in: unsent
            .map((row) => row.campaignId)
            .filter((id): id is string => id !== null),
        },
      },
      select: { id: true, customValues: true },
    });
    const customByCampaign = new Map(
      campaigns.map((c) => [c.id, asCustomValues(c.customValues)] as const),
    );

    const templatesById = new Map(
      (
        await prisma.reminderTemplate.findMany({
          where: {
            id: {
              in: unsent
                .map((row) => row.reminderTemplateId)
                .filter((id): id is string => id !== null),
            },
          },
          select: { id: true, slotKey: true, bodyTemplate: true, projectId: true },
        })
      ).map((t) => [t.id, t] as const),
    );

    let messageUpdates = 0;
    for (const row of unsent) {
      if (row.reminderTemplateId === null) {
        continue;
      }
      const template = templatesById.get(row.reminderTemplateId);
      if (template === undefined || template.bodyTemplate === null) {
        continue;
      }
      const bodies =
        row.projectId === LUCAS_PROJECT_ID
          ? LUCAS_BODY_BY_SLOT
          : Object.fromEntries(jasmineBodies);
      const bodySource = bodies[template.slotKey] ?? template.bodyTemplate;
      const customValues =
        row.campaignId !== null
          ? (customByCampaign.get(row.campaignId) ?? EMPTY_CUSTOM_VALUES)
          : EMPTY_CUSTOM_VALUES;
      const nextCopy = mergeTemplate(customValues, bodySource);
      if (row.copyText === nextCopy) {
        continue;
      }
      messageUpdates += 1;
      console.log(
        `[message] ${row.id} ${template.slotKey} ${row.status} scheduledAt=${row.scheduledAt.toISOString()}`,
      );
      if (!dryRun) {
        await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: { copyText: nextCopy },
        });
      }
    }

    console.log(
      dryRun
        ? `Dry run: would update ${String(templateUpdates)} templates and ${String(messageUpdates)} unsent messages.`
        : `Updated ${String(templateUpdates)} templates and ${String(messageUpdates)} unsent messages.`,
    );
    console.log("No jobs enqueued. Sent rows untouched.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
