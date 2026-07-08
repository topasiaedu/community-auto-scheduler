/**
 * Derives SOP Custom Values from webinar date + event start (MYT).
 * Zoom fields are entered separately by the operator each campaign.
 */

import type { CampaignCustomValues } from "../types/models.js";

const MYT_TIME_ZONE = "Asia/Kuala_Lumpur";

function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00+08:00`);
}

function formatWorkshopDay(ymd: string): string {
  const d = parseYmd(ymd);
  return d.toLocaleDateString("en-GB", { weekday: "long", timeZone: MYT_TIME_ZONE });
}

/** SOP style: `13/7` (no leading zero on month). */
function formatWorkshopDate(ymd: string): string {
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

/** SOP style: `8PM (GMT +8)`. */
function formatWorkshopTime(eventStartTimeMyt: string): string {
  const [hStr, mStr] = eventStartTimeMyt.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return "8PM (GMT +8)";
  }
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) {
    return `${String(hour12)}${period} (GMT +8)`;
  }
  const mm = String(m).padStart(2, "0");
  return `${String(hour12)}:${mm}${period} (GMT +8)`;
}

/** SOP style: `July 13, 2026`. */
function formatSessionDate(ymd: string): string {
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
 * Builds full Custom Values for template merge from anchors + zoom fields.
 */
export function deriveCustomValues(
  webinarDate: string,
  eventStartTimeMyt: string,
  zoom: ZoomFields,
): CampaignCustomValues {
  return {
    workshopDay: formatWorkshopDay(webinarDate),
    workshopDate: formatWorkshopDate(webinarDate),
    workshopTime: formatWorkshopTime(eventStartTimeMyt),
    zoomLink: zoom.zoomLink.trim(),
    sessionDate: formatSessionDate(webinarDate),
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
