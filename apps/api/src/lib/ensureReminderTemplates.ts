import type { PrismaClient } from "@nmcas/db";
import { seedReminderTemplatesForProject } from "@nmcas/db";

/**
 * Ensures all six SOP reminder template slots exist and caption copy matches the
 * current SOP defaults. Uploaded mediaUrl / stickerUrl are preserved.
 */
export async function ensureReminderTemplates(
  prisma: PrismaClient,
  projectId: string,
): Promise<void> {
  await seedReminderTemplatesForProject(prisma, projectId);
}
