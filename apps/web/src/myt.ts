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
