/**
 * Derives SOP Custom Values from webinar date + event start (MYT).
 * Zoom fields are entered separately by the operator each campaign.
 *
 * Locale:
 * - `en` — Dr Jasmine SOP style (`Monday`, `13/7`, `8PM (GMT +8)`)
 * - `zh-CN` — Chinese community style (`星期四`, `8月6号`, `8PM`)
 */

import type { CampaignCustomValues } from "../types/models.js";

const MYT_TIME_ZONE = "Asia/Kuala_Lumpur";

export type CustomValuesLocale = "en" | "zh-CN";

const ZH_WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
] as const;

function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00+08:00`);
}

function mytParts(
  ymd: string,
): { year: number; month: number; day: number; weekday: number } {
  const d = parseYmd(ymd);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MYT_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  // getDay() in MYT via noon+08 date is reliable for calendar YMD
  const weekday = d.getUTCDay();
  return { year, month, day, weekday };
}

function formatWorkshopDay(ymd: string, locale: CustomValuesLocale): string {
  if (locale === "zh-CN") {
    const { weekday } = mytParts(ymd);
    return ZH_WEEKDAYS[weekday] ?? "星期日";
  }
  const d = parseYmd(ymd);
  return d.toLocaleDateString("en-GB", { weekday: "long", timeZone: MYT_TIME_ZONE });
}

/** `en`: `13/7`. `zh-CN`: `8月6号` (Kheli / Chinese community style). */
function formatWorkshopDate(ymd: string, locale: CustomValuesLocale): string {
  if (locale === "zh-CN") {
    const { month, day } = mytParts(ymd);
    return `${String(month)}月${String(day)}号`;
  }
  const d = parseYmd(ymd);
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    timeZone: MYT_TIME_ZONE,
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${day}/${month}`;
}

/**
 * `en`: `8PM (GMT +8)`.
 * `zh-CN`: `8PM` only — Chinese templates already include 晚上 / （GMT+8）.
 */
function formatWorkshopTime(
  eventStartTimeMyt: string,
  locale: CustomValuesLocale,
): string {
  const [hStr, mStr] = eventStartTimeMyt.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return locale === "zh-CN" ? "8PM" : "8PM (GMT +8)";
  }
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const clock =
    m === 0
      ? `${String(hour12)}${period}`
      : `${String(hour12)}:${String(m).padStart(2, "0")}${period}`;
  if (locale === "zh-CN") {
    return clock;
  }
  return `${clock} (GMT +8)`;
}

/** `en`: `July 13, 2026`. `zh-CN`: `2026年8月6日`. */
function formatSessionDate(ymd: string, locale: CustomValuesLocale): string {
  if (locale === "zh-CN") {
    const { year, month, day } = mytParts(ymd);
    return `${String(year)}年${String(month)}月${String(day)}日`;
  }
  const d = parseYmd(ymd);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: MYT_TIME_ZONE,
  });
}

/** SOP style: `8:00PM – 10:00PM (GMT+8)` — end defaults to start + 2 hours. */
function formatSessionTime(eventStartTimeMyt: string): string {
  const [hStr, mStr] = eventStartTimeMyt.split(":");
  const startH = Number(hStr);
  const startM = Number(mStr);
  if (!Number.isFinite(startH) || !Number.isFinite(startM)) {
    return "8:00PM – 10:00PM (GMT+8)";
  }

  const formatClock = (totalMinutes: number): string => {
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const mm = String(m).padStart(2, "0");
    return `${String(hour12)}:${mm}${period}`;
  };

  const startTotal = startH * 60 + startM;
  const endTotal = startTotal + 120;
  return `${formatClock(startTotal)} – ${formatClock(endTotal)} (GMT+8)`;
}

export type ZoomFields = Pick<CampaignCustomValues, "zoomLink" | "zoomId" | "zoomPasscode">;

export const ZOOM_FIELD_PLACEHOLDERS: ZoomFields = {
  zoomLink: "http://drjasminechiew.com/zoom",
  zoomId: "867 3031 7819",
  zoomPasscode: "8888",
};

/**
 * Projects with Chinese reminder copy (e.g. Lucas) get zh-CN merge values.
 */
export function customValuesLocaleForProject(projectName: string): CustomValuesLocale {
  if (/lucas/i.test(projectName)) {
    return "zh-CN";
  }
  return "en";
}

/**
 * Builds full Custom Values for template merge from anchors + zoom fields.
 */
export function deriveCustomValues(
  webinarDate: string,
  eventStartTimeMyt: string,
  zoom: ZoomFields,
  locale: CustomValuesLocale = "en",
): CampaignCustomValues {
  return {
    workshopDay: formatWorkshopDay(webinarDate, locale),
    workshopDate: formatWorkshopDate(webinarDate, locale),
    workshopTime: formatWorkshopTime(eventStartTimeMyt, locale),
    zoomLink: zoom.zoomLink.trim(),
    sessionDate: formatSessionDate(webinarDate, locale),
    sessionTime: formatSessionTime(eventStartTimeMyt),
    zoomId: zoom.zoomId.trim(),
    zoomPasscode: zoom.zoomPasscode.trim(),
  };
}

const ZOOM_STORAGE_PREFIX = "nmcas.zoomDefaults.";

export function loadZoomDefaults(projectId: string): ZoomFields {
  if (projectId.length === 0) {
    return { ...ZOOM_FIELD_PLACEHOLDERS };
  }
  try {
    const raw = sessionStorage.getItem(`${ZOOM_STORAGE_PREFIX}${projectId}`);
    if (raw === null) {
      return { ...ZOOM_FIELD_PLACEHOLDERS };
    }
    const parsed = JSON.parse(raw) as Partial<ZoomFields>;
    return {
      zoomLink:
        typeof parsed.zoomLink === "string" && parsed.zoomLink.length > 0
          ? parsed.zoomLink
          : ZOOM_FIELD_PLACEHOLDERS.zoomLink,
      zoomId:
        typeof parsed.zoomId === "string" && parsed.zoomId.length > 0
          ? parsed.zoomId
          : ZOOM_FIELD_PLACEHOLDERS.zoomId,
      zoomPasscode:
        typeof parsed.zoomPasscode === "string" && parsed.zoomPasscode.length > 0
          ? parsed.zoomPasscode
          : ZOOM_FIELD_PLACEHOLDERS.zoomPasscode,
    };
  } catch {
    return { ...ZOOM_FIELD_PLACEHOLDERS };
  }
}

export function saveZoomDefaults(projectId: string, zoom: ZoomFields): void {
  if (projectId.length === 0) {
    return;
  }
  sessionStorage.setItem(`${ZOOM_STORAGE_PREFIX}${projectId}`, JSON.stringify(zoom));
}
