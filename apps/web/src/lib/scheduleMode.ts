/**
 * Persists Schedule page mode (Campaign vs Single message) in sessionStorage.
 */

export const SCHEDULE_MODE_STORAGE_KEY = "nmcas.scheduleMode";

export type SchedulePageMode = "campaign" | "single";

export function readScheduleMode(): SchedulePageMode {
  try {
    const v = window.sessionStorage.getItem(SCHEDULE_MODE_STORAGE_KEY);
    if (v === "single") {
      return "single";
    }
  } catch {
    /* ignore */
  }
  return "campaign";
}

export function writeScheduleMode(mode: SchedulePageMode): void {
  try {
    window.sessionStorage.setItem(SCHEDULE_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
