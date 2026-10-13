/**
 * Schedules one Community Reminder that is marked Sent without WhatsApp.
 * Run this on the droplet only after the status-only worker code is deployed.
 *
 *   node apps/api/dist/scripts/schedule-status-only.js
 *   node apps/api/dist/scripts/schedule-status-only.js 5
 *
 * The number is minutes from now (default 3). The Telegram group is updated
 * about a minute after that time, when the status sweep sees Sent.
 */

import { loadEnvFiles } from "../load-env.js";

loadEnvFiles();

import PgBoss from "pg-boss";
import { createPrismaClient } from "@nmcas/db";
import { loadApiEnv } from "../env.js";
import { enqueueScheduledMessage } from "../lib/enqueueMessage.js";
import { createFanOutBatchId } from "../lib/fanOutBatchId.js";
import { STATUS_ONLY_GROUP_JID } from "../lib/statusOnlyGroup.js";
import { SEND_SCHEDULED_MESSAGE_QUEUE } from "../queues.js";

const DEFAULT_DELAY_MINUTES = 3;
const MYT_TIME_ZONE = "Asia/Kuala_Lumpur";

/**
 * Reads an optional minute delay from the command line.
 */
function readDelayMinutes(argv: readonly string[]): number {
  const raw = argv[2];
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_DELAY_MINUTES;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 180) {
    throw new Error("Minutes must be a whole number from 1 to 180");
  }
  return parsed;
}

/**
 * Formats an instant as a clock in Malaysia time.
 */
function formatWhenMyt(instant: Date): string {
  return instant.toLocaleString("en-GB", {
    timeZone: MYT_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

async function main(): Promise<void> {
  const delayMinutes = readDelayMinutes(process.argv);
  const env = loadApiEnv();
  const prisma = createPrismaClient();
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: "nmcas-status-only",
    max: 1,
  });

  const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  let campaignId: string | null = null;
  let bossStarted = false;

  try {
    const named = await prisma.project.findFirst({
      where: { name: { contains: "Jasmine", mode: "insensitive" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const fallback =
      named === null
        ? await prisma.project.findUnique({
            where: { id: env.DEFAULT_PROJECT_ID },
            select: { id: true, name: true },
          })
        : named;
    if (fallback === null) {
      throw new Error("No project found for the status-only schedule");
    }

    const template = await prisma.reminderTemplate.findFirst({
      where: { projectId: fallback.id, slotKey: "welcome" },
      select: { id: true, reminderFormat: true },
    });
    if (template === null) {
      throw new Error(`Project ${fallback.name} has no Welcome reminder template`);
    }

    const webinarDate = new Date(
      scheduledAt.toLocaleDateString("en-CA", { timeZone: MYT_TIME_ZONE }),
    );
    const campaign = await prisma.campaign.create({
      data: {
        projectId: fallback.id,
        webinarDate,
        eventStartTimeMyt: "20:00",
        reminderGroupJid: STATUS_ONLY_GROUP_JID,
        reminderGroupName: "Status test",
        customValues: {},
      },
      select: { id: true },
    });
    campaignId = campaign.id;

    const message = await prisma.scheduledMessage.create({
      data: {
        projectId: fallback.id,
        campaignId: campaign.id,
        fanOutBatchId: createFanOutBatchId(),
        groupJid: STATUS_ONLY_GROUP_JID,
        groupName: "Status test",
        type: "POST",
        operatorKind: "REMINDER",
        reminderFormat: template.reminderFormat,
        reminderTemplateId: template.id,
        copyText: null,
        pollOptions: [],
        scheduledAt,
        status: "PENDING",
      },
      select: { id: true },
    });

    await boss.start();
    bossStarted = true;
    const existingQueue = await boss.getQueue(SEND_SCHEDULED_MESSAGE_QUEUE);
    if (existingQueue === null) {
      await boss.createQueue(SEND_SCHEDULED_MESSAGE_QUEUE);
    }
    await enqueueScheduledMessage(boss, prisma, message.id, scheduledAt);

    console.warn(
      [
        "Scheduled a status-only reminder. No WhatsApp group will receive it.",
        `Project: ${fallback.name}`,
        `When: ${formatWhenMyt(scheduledAt)} MYT`,
        "The Telegram group updates about a minute after that time.",
      ].join("\n"),
    );
  } catch (err: unknown) {
    if (campaignId !== null) {
      await prisma.scheduledMessage.deleteMany({ where: { campaignId } });
      await prisma.campaign.delete({ where: { id: campaignId } });
    }
    const message = err instanceof Error ? err.message : "Failed to schedule status-only reminder";
    throw new Error(message);
  } finally {
    if (bossStarted) {
      await boss.stop({ graceful: false, timeout: 5000, wait: true });
    }
    await prisma.$disconnect();
  }
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Failed to schedule status-only reminder";
  console.error(message);
  process.exitCode = 1;
});
