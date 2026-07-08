/**
 * MYT (UTC+8) campaign slot timing — pure functions for reminder and value post schedules.
 */

import type { ReminderTemplate, ScheduleRuleKind } from "@nmcas/db";

const MYT_OFFSET = "+08:00";
const VALUE_SLOT_OFFSETS: Record<string, number> = {
  value_1: -3,
  value_2: -1,
  value_3: 1,
};

/**
 * Parses a MYT calendar date + clock time into a UTC Date.
 */
export function mytInstant(dateYmd: string, hhmm: string): Date {
  const timePart = hhmm.length === 5 ? `${hhmm}:00` : hhmm;
  const d = new Date(`${dateYmd}T${timePart}${MYT_OFFSET}`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid MYT instant: ${dateYmd} ${hhmm}`);
  }
  return d;
}

/**
 * Returns today's calendar date in MYT as YYYY-MM-DD.
 */
export function todayMytYmd(): string {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
  const datePart = s.split(" ")[0];
  if (datePart === undefined || datePart.length === 0) {
    throw new Error("Failed to compute today in MYT");
  }
  return datePart;
}

/**
 * Adds calendar days to a MYT date string (YYYY-MM-DD).
 */
export function addMytCalendarDays(dateYmd: string, deltaDays: number): string {
  const d = mytInstant(dateYmd, "12:00");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const s = d.toLocaleString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
  const datePart = s.split(" ")[0];
  if (datePart === undefined || datePart.length === 0) {
    throw new Error("Failed to add MYT calendar days");
  }
  return datePart;
}

/**
 * True when webinarDate is today or in the future (MYT calendar day).
 */
export function isWebinarDateValid(webinarDateYmd: string): boolean {
  return webinarDateYmd >= todayMytYmd();
}

type ReminderTemplateTiming = Pick<
  ReminderTemplate,
  "scheduleRuleKind" | "dayOffset" | "clockTimeMyt" | "startOffsetMinutes"
>;

/**
 * Computes the UTC send time for a reminder template slot.
 */
export function computeReminderSlotTime(
  template: ReminderTemplateTiming,
  webinarDateYmd: string,
  eventStartTimeMyt: string,
): Date {
  if (template.scheduleRuleKind === "WEBINAR_DATE_OFFSET") {
    if (template.dayOffset === null || template.clockTimeMyt === null) {
      throw new Error("WEBINAR_DATE_OFFSET template missing dayOffset or clockTimeMyt");
    }
    const slotDate = addMytCalendarDays(webinarDateYmd, template.dayOffset);
    return mytInstant(slotDate, template.clockTimeMyt);
  }
  if (template.scheduleRuleKind === "EVENT_START_OFFSET") {
    if (template.startOffsetMinutes === null) {
      throw new Error("EVENT_START_OFFSET template missing startOffsetMinutes");
    }
    const eventStart = mytInstant(webinarDateYmd, eventStartTimeMyt);
    return new Date(eventStart.getTime() + template.startOffsetMinutes * 60_000);
  }
  throw new Error(`Unknown schedule rule kind: ${template.scheduleRuleKind as ScheduleRuleKind}`);
}

/**
 * Computes UTC send time for fixed value post slots (value_1, value_2, value_3) @ 11:00 MYT.
 */
export function computeValueSlotTime(slotKey: string, webinarDateYmd: string): Date {
  const offset = VALUE_SLOT_OFFSETS[slotKey];
  if (offset === undefined) {
    throw new Error(`Unknown value slot key: ${slotKey}`);
  }
  const slotDate = addMytCalendarDays(webinarDateYmd, offset);
  return mytInstant(slotDate, "11:00");
}

/**
 * Computes UTC send time for optional alternate-day value posts @ 11:00 MYT.
 */
export function computeOptionalValueTime(scheduledDateYmd: string): Date {
  return mytInstant(scheduledDateYmd, "11:00");
}

/**
 * Earliest campaign slot (Welcome at webinarDate − 4d @ 15:00 MYT) for lead-time validation.
 */
export function earliestCampaignSlotTime(webinarDateYmd: string): Date {
  const welcomeDate = addMytCalendarDays(webinarDateYmd, -4);
  return mytInstant(welcomeDate, "15:00");
}

/**
 * Formats a UTC Date as ISO string in MYT for test assertions.
 */
export function formatUtcAsMytIso(d: Date): string {
  const s = d.toLocaleString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
  const parts = s.split(" ");
  if (parts.length < 2 || parts[0] === undefined || parts[1] === undefined) {
    return "";
  }
  return `${parts[0]}T${parts[1].slice(0, 8)}`;
}
