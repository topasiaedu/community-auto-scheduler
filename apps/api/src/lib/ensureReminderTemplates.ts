import type { PrismaClient } from "@nmcas/db";
import { seedReminderTemplatesForProject } from "@nmcas/db";

/**
 * Ensures all SOP reminder template slots exist for a project.
 * Missing slots get SOP default caption copy; existing bodyTemplate / media
 * edits are preserved (schedule metadata may still refresh).
 */
export async function ensureReminderTemplates(
  prisma: PrismaClient,
  projectId: string,
): Promise<void> {
  await seedReminderTemplatesForProject(prisma, projectId);
}
