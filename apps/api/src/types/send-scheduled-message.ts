/**
 * pg-boss job payload for `send-scheduled-message` queue.
 */
export type SendScheduledMessageJobData = {
  scheduledMessageId: string;
};

export function parseSendScheduledMessageJobData(
  raw: unknown,
): SendScheduledMessageJobData | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  const id = rec.scheduledMessageId;
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }
  return { scheduledMessageId: id };
}
