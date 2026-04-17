/**
 * Display helpers for scheduled messages, status chips, and timestamps.
 */

import type { WaGroup } from "../types/models.js";

/**
 * Returns a datetime-local string pre-populated to tomorrow at 9:00 AM MYT.
 * Used as the default value for the schedule datetime field.
 */
export function defaultScheduleTime(): string {
  const utcNow = new Date();
  const mytOffsetMs = 8 * 60 * 60 * 1000;
  const mytNow = new Date(utcNow.getTime() + mytOffsetMs);
  const mytTomorrow = new Date(mytNow.getTime() + 24 * 60 * 60 * 1000);
  const y = mytTomorrow.getUTCFullYear();
  const m = String(mytTomorrow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(mytTomorrow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T09:00`;
}

/**
 * Converts a UTC ISO string to a human-readable time relative to today in MYT.
 * - "Today at 3:00 PM"
 * - "Tomorrow at 9:00 AM"
 * - "Fri 18 Apr at 3:00 PM"
 */
export function formatRelativeTime(utcIso: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return utcIso;
  }

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const nowDateStr = dateFormatter.format(new Date());
  const msgDateStr = dateFormatter.format(date);
  const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tomorrowDateStr = dateFormatter.format(tomorrowDate);

  const timeStr = date.toLocaleTimeString("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kuala_Lumpur",
  });

  if (msgDateStr === nowDateStr) {
    return `Today at ${timeStr}`;
  }
  if (msgDateStr === tomorrowDateStr) {
    return `Tomorrow at ${timeStr}`;
  }

  const dateParts = date
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kuala_Lumpur",
    })
    .replace(",", "");

  return `${dateParts} at ${timeStr}`;
}

/**
 * Maps a database-enum status string to a human-readable mixed-case label.
 */
export function formatStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "SENDING":
      return "Sending";
    case "SENT":
      return "Sent";
    case "FAILED":
      return "Failed";
    case "DRAFT":
      return "Draft";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

/**
 * Returns "You" when userId matches the current session user, otherwise a
 * truncated user reference. Returns "" when no userId is present.
 */
export function formatAttributedBy(
  userId: string | null | undefined,
  currentUserId: string | null | undefined,
): string {
  if (userId === null || userId === undefined || userId.length === 0) {
    return "";
  }
  if (currentUserId !== null && currentUserId !== undefined && userId === currentUserId) {
    return "You";
  }
  return `User ${userId.slice(0, 6)}…`;
}

/**
 * CSS class for status chip background/text color.
 */
export function chipClassForStatus(status: string): string {
  switch (status) {
    case "SENT":
      return "chip--sent";
    case "FAILED":
      return "chip--failed";
    case "PENDING":
    case "SENDING":
      return "chip--pending";
    case "DRAFT":
      return "chip--draft";
    case "CANCELLED":
      return "chip--cancelled";
    default:
      return "chip--pending";
  }
}

/**
 * CSS modifier for queue card left accent stripe.
 */
export function queueCardModifier(status: string): string {
  switch (status) {
    case "PENDING":
    case "SENDING":
      return "queue-card--pending";
    case "SENT":
      return "queue-card--sent";
    case "FAILED":
      return "queue-card--failed";
    case "DRAFT":
      return "queue-card--draft";
    case "CANCELLED":
      return "queue-card--cancelled";
    default:
      return "queue-card--pending";
  }
}

/**
 * Ensures `label` is set for each row (API may omit on older servers).
 */
export function normalizeWaGroupRow(g: WaGroup): WaGroup {
  const name = typeof g.name === "string" ? g.name.trim() : "";
  const label =
    typeof g.label === "string" && g.label.trim().length > 0 ? g.label.trim() : name;
  return { jid: g.jid, name, label };
}

/**
 * Removes duplicate rows with the same JID (defensive; API should already be unique).
 */
export function dedupeWaGroupsByJid(groups: readonly WaGroup[]): WaGroup[] {
  const seen = new Set<string>();
  const out: WaGroup[] = [];
  for (const g of groups) {
    if (seen.has(g.jid)) {
      continue;
    }
    seen.add(g.jid);
    out.push(g);
  }
  return out;
}

/**
 * List keys (prefer `label`, else `name`) that appear more than once.
 * Used to append a stable JID hint when two rows still collide.
 */
export function waGroupDuplicateListKeySet(
  groups: readonly { name: string; label?: string }[],
): Set<string> {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const key =
      g.label !== undefined && g.label.trim().length > 0 ? g.label.trim() : g.name.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicate = new Set<string>();
  for (const [k, c] of counts) {
    if (c > 1) {
      duplicate.add(k);
    }
  }
  return duplicate;
}

/**
 * Legacy rows were labeled `[Community] …` for WhatsApp community shells.
 * Those targets are no longer selectable; strip the prefix for clearer queue/history display.
 */
export function stripCommunityShellPrefix(name: string): string {
  const trimmed = name.trim();
  const prefix = "[community]";
  if (trimmed.toLowerCase().startsWith(prefix)) {
    const rest = trimmed.slice(trimmed.indexOf("]") + 1).trim();
    return rest.length > 0 ? rest : trimmed;
  }
  return trimmed;
}

/**
 * Last segment of the group id before @g.us, shortened for display.
 * Example: 120363402848966123@g.us → …48966123
 */
export function formatWaGroupJidHint(jid: string): string {
  const user = jid.split("@")[0] ?? jid;
  if (user.length === 0) {
    return jid;
  }
  if (user.length <= 12) {
    return user;
  }
  return `…${user.slice(-8)}`;
}

/**
 * Label for the group picker: server `label` (community › group) when set,
 * plus JID hint when the same display line still appears twice.
 */
export function formatWaGroupPickerLabel(
  group: { jid: string; name: string; label?: string },
  duplicateListKeys: Set<string>,
): string {
  const base =
    group.label !== undefined && group.label.trim().length > 0
      ? group.label.trim()
      : group.name.trim().length > 0
        ? group.name.trim()
        : "(unnamed group)";
  if (duplicateListKeys.has(base)) {
    return `${base} · ${formatWaGroupJidHint(group.jid)}`;
  }
  return base;
}

/**
 * @deprecated Use formatAttributedBy instead.
 */
export function formatScheduledBy(userId: string | null | undefined): string {
  if (userId === null || userId === undefined || userId.length === 0) {
    return "";
  }
  return `Scheduled by ${userId.slice(0, 8)}…`;
}
