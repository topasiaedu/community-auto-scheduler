/**
 * Queue row badge labels and content excerpts (P7 UX spec §7).
 */

import { REMINDER_SLOT_LABELS } from "./campaignFormat.js";
import type { ScheduledMessage } from "../types/models.js";

const VALUE_FORMAT_LABELS: Record<string, string> = {
  IMAGE_CAPTION: "Image",
  TEXT_ONLY: "Text",
  POLL: "Poll",
};

const REMINDER_FORMAT_LABELS: Record<string, string> = {
  IMAGE: "Image",
  TEXT: "Text",
  STICKER: "Sticker",
};

const EXCERPT_MAX = 120;

export type QueueKindFilter = "all" | "campaign" | "other" | "reminder" | "value";

export function kindBadgeLabel(message: ScheduledMessage): string {
  if (message.operatorKind === "REMINDER") {
    return "Reminder";
  }
  if (message.operatorKind === "VALUE") {
    return "Value";
  }
  return message.type === "POLL" ? "Poll" : "Post";
}

export function subBadgeLabel(message: ScheduledMessage): string | null {
  if (message.operatorKind === "REMINDER") {
    if (
      message.reminderTemplateSlotKey !== null &&
      message.reminderTemplateSlotKey !== undefined &&
      message.reminderTemplateSlotKey.length > 0
    ) {
      return REMINDER_SLOT_LABELS[message.reminderTemplateSlotKey] ?? message.reminderTemplateName ?? null;
    }
    if (message.reminderFormat !== null && message.reminderFormat !== undefined) {
      return REMINDER_FORMAT_LABELS[message.reminderFormat] ?? null;
    }
    return null;
  }
  if (message.operatorKind === "VALUE") {
    if (message.valueFormat !== null && message.valueFormat !== undefined) {
      return VALUE_FORMAT_LABELS[message.valueFormat] ?? null;
    }
    return "Image";
  }
  if (message.type === "POLL") {
    return "Poll";
  }
  if (message.imageUrl !== null && message.imageUrl.length > 0) {
    return "Image";
  }
  return message.copyText !== null && message.copyText.length > 0 ? "Text" : null;
}

export function excerptText(text: string, max = EXCERPT_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

export function matchesQueueKindFilter(
  message: ScheduledMessage,
  filter: QueueKindFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "campaign":
      return message.campaignId !== null && message.campaignId !== undefined && message.campaignId.length > 0;
    case "other":
      return message.campaignId === null || message.campaignId === undefined || message.campaignId.length === 0;
    case "reminder":
      return message.operatorKind === "REMINDER";
    case "value":
      return message.operatorKind === "VALUE";
    default:
      return true;
  }
}
