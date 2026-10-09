/**
 * Identifies every ScheduledMessage row that belongs to one scheduled post.
 * Value fan-out siblings share one id. A single community row has its own id.
 */

import { randomUUID } from "node:crypto";

/**
 * Returns a new batch id. Re-queue calls this again so the retry gets its own post-update DM.
 */
export function createFanOutBatchId(): string {
  return randomUUID();
}
