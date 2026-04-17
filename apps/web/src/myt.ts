/**
 * Interprets `datetime-local` input as Malaysia time (UTC+8, no DST) and returns UTC ISO-8601 for the API.
 */
export function mytLocalToUtcIso(datetimeLocal: string): string {
  const trimmed = datetimeLocal.trim();
  if (trimmed.length === 0) {
    throw new Error("Scheduled time is required");
  }
  let base = trimmed;
  if (base.length === 16) {
    base = `${base}:00`;
  }
  const withOffset = `${base}+08:00`;
  const d = new Date(withOffset);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid scheduled time");
  }
  return d.toISOString();
}

/**
 * Returns true if the UTC instant is at least `minSeconds` after now.
 */
export function isUtcIsoAtLeastSecondsAhead(isoUtc: string, minSeconds: number): boolean {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return false;
  }
  return d.getTime() >= Date.now() + minSeconds * 1000;
}

/**
 * Converts a UTC ISO string to `datetime-local` value interpreted as MYT (same convention as {@link mytLocalToUtcIso}).
 */
export function utcIsoToDatetimeLocalMyt(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const s = d.toLocaleString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
  const parts = s.split(" ");
  if (parts.length < 2 || parts[0] === undefined || parts[1] === undefined) {
    return "";
  }
  const date = parts[0];
  const hm = parts[1].slice(0, 5);
  return `${date}T${hm}`;
}
