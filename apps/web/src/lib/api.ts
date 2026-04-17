/**
 * API path helpers — Vite proxy `/api` in dev, or absolute `VITE_API_URL` in production.
 */

export const ACTIVE_PROJECT_STORAGE_KEY = "nmcas-active-project-id";

export function readStoredProjectId(): string | null {
  try {
    const v = window.sessionStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    if (typeof v === "string" && v.length > 0) {
      return v;
    }
  } catch {
    /* ignore private mode / blocked storage */
  }
  return null;
}

export function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "";
}

export function apiPath(path: string): string {
  const base = apiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base.length > 0) {
    return `${base}${p}`;
  }
  return `/api${p}`;
}
