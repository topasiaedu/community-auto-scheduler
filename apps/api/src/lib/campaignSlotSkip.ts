/**
 * Per-slot skip decisions for Show Up campaign scheduling (P8-A).
 */

import type { ReminderTemplate } from "@nmcas/db";

export const CAMPAIGN_MIN_LEAD_MS = 15_000;

export type CampaignSlotSkipReason = "past" | "skipped" | "no_asset";

export type SkippedCampaignSlot = {
  slotKey: string;
  reason: CampaignSlotSkipReason;
};

type ReminderTemplateLike = Pick<ReminderTemplate, "slotKey" | "reminderFormat" | "stickerUrl">;

export type ClassifyReminderSlotParams = {
  template: ReminderTemplateLike;
  scheduledAt: Date;
  nowMs: number;
  skipSlotKeys: ReadonlySet<string>;
};

export type ReminderSlotDecision =
  | { schedule: true }
  | { schedule: false; reason: CampaignSlotSkipReason };

/**
 * True when a STICKER template has an uploaded asset (non-sticker slots always pass).
 */
export function stickerHasAsset(template: ReminderTemplateLike): boolean {
  if (template.reminderFormat !== "STICKER") {
    return true;
  }
  return template.stickerUrl !== null && template.stickerUrl.length > 0;
}

/**
 * Classifies whether a reminder slot should be created and why it might be skipped.
 * Operator skip takes precedence over past / no-asset.
 */
export function classifyReminderSlot(params: ClassifyReminderSlotParams): ReminderSlotDecision {
  const { template, scheduledAt, nowMs, skipSlotKeys } = params;
  const minTime = nowMs + CAMPAIGN_MIN_LEAD_MS;

  if (skipSlotKeys.has(template.slotKey)) {
    return { schedule: false, reason: "skipped" };
  }
  if (!stickerHasAsset(template)) {
    return { schedule: false, reason: "no_asset" };
  }
  if (scheduledAt.getTime() < minTime) {
    return { schedule: false, reason: "past" };
  }
  return { schedule: true };
}

/**
 * Returns true when a reminder row should be created for this slot.
 */
export function shouldScheduleReminderSlot(params: ClassifyReminderSlotParams): boolean {
  return classifyReminderSlot(params).schedule;
}
