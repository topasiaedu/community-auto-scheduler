/**
 * Enqueues a pg-boss send job for a scheduled message row.
 */

import type { PrismaClient } from "@nmcas/db";
import PgBoss from "pg-boss";
import { SEND_SCHEDULED_MESSAGE_QUEUE } from "../queues.js";

type PgBossInstance = InstanceType<typeof PgBoss>;

type ScheduledMessageUpdater = Pick<PrismaClient, "scheduledMessage">;

/**
 * Schedules a send job and stores the pg-boss job id on the row.
 * Throws if enqueue fails (caller should roll back transaction).
 */
export async function enqueueScheduledMessage(
  boss: PgBossInstance,
  prisma: ScheduledMessageUpdater,
  scheduledMessageId: string,
  scheduledAt: Date,
): Promise<string> {
  const jobId = await boss.sendAfter(
    SEND_SCHEDULED_MESSAGE_QUEUE,
    { scheduledMessageId },
    {},
    scheduledAt,
  );
  if (jobId === null) {
    throw new Error("Failed to enqueue pg-boss job");
  }
  await prisma.scheduledMessage.update({
    where: { id: scheduledMessageId },
    data: { pgBossJobId: jobId },
  });
  return jobId;
}
