/**
 * Reminder template asset and merge validation for campaign wizard step 3.
 */

import type { CampaignCustomValues, ReminderTemplateRow } from "../types/models.js";
import { hasUnresolvedPlaceholders, mergeTemplate } from "./mergeTemplate.js";

type CustomValueKey = keyof CampaignCustomValues;

const REQUIRED_KEYS_BY_SLOT: Record<string, readonly CustomValueKey[]> = {
  welcome: [
    "workshopDay",
    "workshopDate",
    "workshopTime",
    "zoomLink",
    "sessionDate",
    "sessionTime",
    "zoomId",
    "zoomPasscode",
  ],
  countdown_2d: ["workshopDay", "workshopDate", "workshopTime"],
  countdown_1d: ["workshopTime", "zoomLink"],
  starting_soon: ["zoomLink", "sessionDate", "sessionTime", "zoomId", "zoomPasscode"],
  live_now: ["zoomLink"],
  post_live_sticker: [],
};

/** True when the slot has a usable asset/copy (STICKER may be empty — it's optional). */
export function templateHasRequiredAssets(template: ReminderTemplateRow): boolean {
  if (template.reminderFormat === "IMAGE") {
    return (
      template.mediaUrl !== null &&
      template.mediaUrl.length > 0 &&
      template.bodyTemplate !== null &&
      template.bodyTemplate.trim().length > 0
    );
  }
  if (template.reminderFormat === "TEXT") {
    return template.bodyTemplate !== null && template.bodyTemplate.trim().length > 0;
  }
  if (template.reminderFormat === "STICKER") {
    return template.stickerUrl !== null && template.stickerUrl.length > 0;
  }
  return false;
}

/** Post-live sticker may be skipped until a static WebP is uploaded. */
export function isOptionalReminderTemplate(template: ReminderTemplateRow): boolean {
  return template.reminderFormat === "STICKER" || template.slotKey === "post_live_sticker";
}

/** Ready to schedule: required slots must be complete; optional sticker may be empty. */
export function templateReadyForCampaign(template: ReminderTemplateRow): boolean {
  if (isOptionalReminderTemplate(template)) {
    return true;
  }
  return templateHasRequiredAssets(template);
}

export function mergePreviewForSlot(
  template: ReminderTemplateRow,
  customValues: CampaignCustomValues,
): { ok: true; text: string } | { ok: false; reason: string } {
  if (template.reminderFormat === "STICKER") {
    return { ok: true, text: "" };
  }
  if (template.bodyTemplate === null || template.bodyTemplate.trim().length === 0) {
    return { ok: false, reason: "Missing body template" };
  }
  const required = REQUIRED_KEYS_BY_SLOT[template.slotKey] ?? [];
  for (const key of required) {
    if (customValues[key].trim().length === 0) {
      return { ok: false, reason: `Missing custom value: ${key}` };
    }
  }
  const merged = mergeTemplate(customValues, template.bodyTemplate);
  if (hasUnresolvedPlaceholders(merged)) {
    return { ok: false, reason: "Unresolved placeholders after merge" };
  }
  return { ok: true, text: merged };
}
