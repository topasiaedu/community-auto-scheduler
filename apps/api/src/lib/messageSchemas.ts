/**
 * Shared Zod schemas for campaign custom values and message routes.
 */

import { z } from "zod";

export const CustomValuesSchema = z.object({
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

export const groupJidField = z.string().regex(/@g\.us$/, "groupJid must be a WhatsApp group JID");
export const groupNameField = z.string().min(1).max(512);
export const scheduledAtField = z.string().min(1);
