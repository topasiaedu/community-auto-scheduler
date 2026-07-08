/**
 * Human-readable schedule rule lines for reminder template slots (Settings UI).
 */

import type { ReminderTemplateRow } from "../types/models.js";

function formatClockTimeMyt(hhMm: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhMm.trim());
  if (match === null) {
    return hhMm;
  }
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(hour12)}:${minute} ${period}`;
}

function formatDayOffset(dayOffset: number): string {
  if (dayOffset === 0) {
    return "Webinar date";
  }
  if (dayOffset < 0) {
    const days = Math.abs(dayOffset);
    return `Webinar date − ${String(days)} day${days === 1 ? "" : "s"}`;
  }
  return `Webinar date + ${String(dayOffset)} day${dayOffset === 1 ? "" : "s"}`;
}

function formatStartOffset(minutes: number): string {
  if (minutes === 0) {
    return "Event start";
  }
  if (minutes < 0) {
    const abs = Math.abs(minutes);
    return `Event start − ${String(abs)} min`;
  }
  return `Event start + ${String(minutes)} min`;
}

/**
 * Returns a read-only schedule rule line for a template row.
 */
export function formatScheduleRuleLabel(template: ReminderTemplateRow): string {
  if (template.scheduleRuleKind === "WEBINAR_DATE_OFFSET") {
    const dayPart =
      template.dayOffset !== null ? formatDayOffset(template.dayOffset) : "Webinar date";
    const clock =
      template.clockTimeMyt !== null && template.clockTimeMyt.length > 0
        ? ` @ ${formatClockTimeMyt(template.clockTimeMyt)} MYT`
        : "";
    return `${dayPart}${clock}`;
  }

  if (template.scheduleRuleKind === "EVENT_START_OFFSET") {
    const offsetPart =
      template.startOffsetMinutes !== null
        ? formatStartOffset(template.startOffsetMinutes)
        : "Event start";
    return `${offsetPart} MYT`;
  }

  return "Fixed SOP schedule";
}
