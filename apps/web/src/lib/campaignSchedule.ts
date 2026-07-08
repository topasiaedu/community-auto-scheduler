/**
 * Pure campaign timing math for P7 SOP slots (MYT calendar + fixed clock times).
 * See NMCAS-VAULT/wiki/analysis/p7-ux-spec.md §4 and §11.
 */

import { isUtcIsoAtLeastSecondsAhead } from "../myt.js";
import { MIN_LEAD_SECONDS } from "../types/models.js";

/** MYT timezone identifier (UTC+8, no DST). */
const MYT_TIME_ZONE = "Asia/Kuala_Lumpur";

/**
 * Returns today's calendar date in MYT as YYYY-MM-DD.
 */
export function todayMytYmd(): string {
  const s = new Date().toLocaleString("sv-SE", { timeZone: MYT_TIME_ZONE });
  const datePart = s.split(" ")[0];
  if (datePart === undefined || datePart.length === 0) {
    throw new Error("Failed to compute today in MYT");
  }
  return datePart;
}

/**
 * True when webinarDate is today or in the future (MYT calendar day).
 */
export function isWebinarDateValid(webinarDateYmd: string): boolean {
  return webinarDateYmd >= todayMytYmd();
}

/** Fixed clock time for Value posts and alternate-day suggestions. */
const VALUE_CLOCK_TIME_MYT = "11:00";

export type CampaignScheduledSlot = {
  slotKey: string;
  scheduledAt: string;
};

export type AlternateValueDaySuggestion = {
  scheduledDate: string;
  scheduledAt: string;
};

export type ValidateEarliestSlotOptions = {
  /** Injectable reference time for unit tests (defaults to Date.now()). */
  nowMs?: number;
};

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Validates and returns a YYYY-MM-DD calendar day string.
 */
function parseYmd(webinarDate: string): string {
  const trimmed = webinarDate.trim();
  if (!YMD_PATTERN.test(trimmed)) {
    throw new Error("webinarDate must be YYYY-MM-DD");
  }
  const d = new Date(`${trimmed}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("webinarDate must be a valid calendar date");
  }
  return trimmed;
}

/**
 * Validates and returns an HH:mm clock time string.
 */
function parseHhMm(time: string): string {
  const trimmed = time.trim();
  if (!HH_MM_PATTERN.test(trimmed)) {
    throw new Error("eventStartTimeMyt must be HH:mm");
  }
  return trimmed;
}

/**
 * Adds calendar days to a MYT date anchor (noon MYT avoids midnight edge cases).
 */
function addCalendarDays(ymd: string, offset: number): string {
  const anchor = new Date(`${ymd}T12:00:00+08:00`);
  const shifted = new Date(anchor.getTime() + offset * 24 * 60 * 60 * 1000);
  return shifted.toLocaleDateString("sv-SE", { timeZone: MYT_TIME_ZONE });
}

/**
 * Converts a MYT calendar day + clock time to UTC ISO-8601.
 */
function mytDateTimeToUtcIso(ymd: string, hhMm: string): string {
  const date = parseYmd(ymd);
  const time = parseHhMm(hhMm);
  const d = new Date(`${date}T${time}:00+08:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid MYT datetime");
  }
  return d.toISOString();
}

/**
 * Returns UTC ISO for event start on webinar day, offset by minutes from start.
 */
function eventStartOffsetUtcIso(
  webinarDate: string,
  eventStartTimeMyt: string,
  offsetMinutes: number,
): string {
  const date = parseYmd(webinarDate);
  const time = parseHhMm(eventStartTimeMyt);
  const startMs = new Date(`${date}T${time}:00+08:00`).getTime();
  if (Number.isNaN(startMs)) {
    throw new Error("Invalid event start time");
  }
  return new Date(startMs + offsetMinutes * 60 * 1000).toISOString();
}

/**
 * Calendar days occupied by Show Up reminders (for alternate-day exclusion).
 */
function showUpOccupiedDays(webinarDate: string): string[] {
  const date = parseYmd(webinarDate);
  return [
    addCalendarDays(date, -4),
    addCalendarDays(date, -2),
    addCalendarDays(date, -1),
    date,
  ];
}

/**
 * Calendar days occupied by fixed Value posts (for alternate-day exclusion).
 */
function fixedValueOccupiedDays(webinarDate: string): string[] {
  const date = parseYmd(webinarDate);
  return [addCalendarDays(date, -3), addCalendarDays(date, -1)];
}

/**
 * Computes the six Show Up reminder slots with UTC scheduledAt instants.
 */
export function computeShowUpSlots(
  webinarDate: string,
  eventStartTimeMyt: string,
): CampaignScheduledSlot[] {
  const date = parseYmd(webinarDate);
  parseHhMm(eventStartTimeMyt);

  return [
    {
      slotKey: "welcome",
      scheduledAt: mytDateTimeToUtcIso(addCalendarDays(date, -4), "15:00"),
    },
    {
      slotKey: "countdown_2d",
      scheduledAt: mytDateTimeToUtcIso(addCalendarDays(date, -2), "15:00"),
    },
    {
      slotKey: "countdown_1d",
      scheduledAt: mytDateTimeToUtcIso(addCalendarDays(date, -1), "20:00"),
    },
    {
      slotKey: "starting_soon",
      scheduledAt: mytDateTimeToUtcIso(date, "11:00"),
    },
    {
      slotKey: "live_now",
      scheduledAt: eventStartOffsetUtcIso(date, eventStartTimeMyt, -2),
    },
    {
      slotKey: "post_live_sticker",
      scheduledAt: eventStartOffsetUtcIso(date, eventStartTimeMyt, 18),
    },
  ];
}

/**
 * Computes the three fixed Value post slots with UTC scheduledAt instants.
 */
export function computeFixedValueSlots(webinarDate: string): CampaignScheduledSlot[] {
  const date = parseYmd(webinarDate);

  return [
    {
      slotKey: "value_1",
      scheduledAt: mytDateTimeToUtcIso(addCalendarDays(date, -3), VALUE_CLOCK_TIME_MYT),
    },
    {
      slotKey: "value_2",
      scheduledAt: mytDateTimeToUtcIso(addCalendarDays(date, -1), VALUE_CLOCK_TIME_MYT),
    },
    {
      slotKey: "value_3",
      scheduledAt: mytDateTimeToUtcIso(addCalendarDays(date, 1), VALUE_CLOCK_TIME_MYT),
    },
  ];
}

/**
 * Suggests optional alternate-day Value posts @ 11:00 MYT per ux-spec §4 step 4.
 */
export function suggestAlternateValueDays(webinarDate: string): AlternateValueDaySuggestion[] {
  const date = parseYmd(webinarDate);

  const rangeDays: string[] = [];
  for (let offset = -4; offset <= -1; offset += 1) {
    rangeDays.push(addCalendarDays(date, offset));
  }

  const occupied = new Set([
    ...showUpOccupiedDays(date),
    ...fixedValueOccupiedDays(date),
  ]);

  const eligible = rangeDays.filter((day) => !occupied.has(day));
  const suggestions: AlternateValueDaySuggestion[] = [];

  for (let i = 0; i < eligible.length; i += 2) {
    const scheduledDate = eligible[i];
    if (scheduledDate === undefined) {
      continue;
    }
    suggestions.push({
      scheduledDate,
      scheduledAt: mytDateTimeToUtcIso(scheduledDate, VALUE_CLOCK_TIME_MYT),
    });
  }

  return suggestions;
}

/**
 * Returns true when the earliest slot is at least MIN_LEAD_SECONDS after now.
 */
export function validateEarliestSlot(
  slots: readonly CampaignScheduledSlot[],
  options?: ValidateEarliestSlotOptions,
): boolean {
  if (slots.length === 0) {
    return true;
  }

  let earliestMs = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    const ms = new Date(slot.scheduledAt).getTime();
    if (!Number.isNaN(ms) && ms < earliestMs) {
      earliestMs = ms;
    }
  }

  if (!Number.isFinite(earliestMs)) {
    return false;
  }

  const earliestIso = new Date(earliestMs).toISOString();
  const nowMs = options?.nowMs ?? Date.now();

  if (options?.nowMs !== undefined) {
    return earliestMs >= nowMs + MIN_LEAD_SECONDS * 1000;
  }

  return isUtcIsoAtLeastSecondsAhead(earliestIso, MIN_LEAD_SECONDS);
}
