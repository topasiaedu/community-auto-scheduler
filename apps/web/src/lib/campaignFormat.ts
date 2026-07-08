/**
 * Display formatting for campaign schedule times and slot labels.
 */

import { formatRelativeTime } from "./format.js";

const MYT_TIME_ZONE = "Asia/Kuala_Lumpur";

/** Human-readable slot names for tables and badges. */
export const REMINDER_SLOT_LABELS: Record<string, string> = {
  welcome: "Welcome",
  countdown_2d: "2-Day",
  countdown_1d: "1-Day",
  starting_soon: "Starting Soon",
  live_now: "LIVE NOW",
  post_live_sticker: "Sticker",
};

export const VALUE_SLOT_LABELS: Record<string, string> = {
  value_1: "Value Post 1",
  value_2: "Value Post 2",
  value_3: "Value Post 3",
};

/**
 * Formats a UTC ISO instant as a MYT date + time string for campaign tables.
 */
export function formatUtcIsoMyt(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) {
    return utcIso;
  }
  const datePart = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: MYT_TIME_ZONE,
  });
  const timePart = d.toLocaleTimeString("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MYT_TIME_ZONE,
  });
  return `${datePart}, ${timePart} MYT`;
}

/**
 * Formats a YYYY-MM-DD calendar day for optional Value post rows.
 */
/**
 * Formats a campaign webinar date for Queue group headers (e.g. "29 Jun 2026").
 */
export function formatCampaignWebinarDate(isoOrYmd: string): string {
  const normalized =
    isoOrYmd.length === 10 ? `${isoOrYmd}T12:00:00+08:00` : isoOrYmd;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    return isoOrYmd;
  }
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: MYT_TIME_ZONE,
  });
}

export function formatYmdMyt(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) {
    return ymd;
  }
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: MYT_TIME_ZONE,
  });
}

export { formatRelativeTime };
