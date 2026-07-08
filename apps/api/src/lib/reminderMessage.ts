/**
 * Builds snapshot fields for a REMINDER scheduled message from a template + custom values.
 */

import type { CampaignCustomValues, ReminderTemplate } from "@nmcas/db";
import { mergeTemplate } from "@nmcas/db";

export type ReminderSnapshot = {
  copyText: string | null;
  imageUrl: string | null;
  stickerUrl: string | null;
  reminderFormat: ReminderTemplate["reminderFormat"];
};

export function validateReminderTemplateAssets(template: ReminderTemplate): string | undefined {
  if (template.reminderFormat === "IMAGE") {
    if (template.mediaUrl === null || template.mediaUrl.length === 0) {
      return "Reminder template is missing image asset";
    }
    if (template.bodyTemplate === null || template.bodyTemplate.trim().length === 0) {
      return "Reminder template is missing body copy";
    }
    return undefined;
  }
  if (template.reminderFormat === "TEXT") {
    if (template.bodyTemplate === null || template.bodyTemplate.trim().length === 0) {
      return "Reminder template is missing body copy";
    }
    return undefined;
  }
  if (template.reminderFormat === "STICKER") {
    if (template.stickerUrl === null || template.stickerUrl.length === 0) {
      return "Reminder template is missing sticker asset";
    }
    return undefined;
  }
  return "Unknown reminder format";
}

export function buildReminderSnapshot(
  template: ReminderTemplate,
  customValues: CampaignCustomValues,
): ReminderSnapshot {
  if (template.reminderFormat === "IMAGE") {
    return {
      copyText: mergeTemplate(customValues, template.bodyTemplate ?? ""),
      imageUrl: template.mediaUrl,
      stickerUrl: null,
      reminderFormat: "IMAGE",
    };
  }
  if (template.reminderFormat === "TEXT") {
    return {
      copyText: mergeTemplate(customValues, template.bodyTemplate ?? ""),
      imageUrl: null,
      stickerUrl: null,
      reminderFormat: "TEXT",
    };
  }
  return {
    copyText: null,
    imageUrl: null,
    stickerUrl: template.stickerUrl,
    reminderFormat: "STICKER",
  };
}
