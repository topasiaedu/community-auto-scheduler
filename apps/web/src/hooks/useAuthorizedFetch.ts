/**
 * Authenticated API fetch with project scope header (Settings and other pages).
 */

import { useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiPath } from "../lib/api.js";

export function useAuthorizedFetch(
  session: Session | null,
  selectedProjectId: string,
): (path: string, init?: RequestInit & { skipProjectHeader?: boolean }) => Promise<Response> {
  return useCallback(
    async (path: string, init?: RequestInit & { skipProjectHeader?: boolean }) => {
      const headers = new Headers(init?.headers);
      const token = session?.access_token;
      if (typeof token === "string" && token.length > 0) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      if (init?.skipProjectHeader !== true && selectedProjectId.length > 0) {
        headers.set("X-Project-Id", selectedProjectId);
      }
      return fetch(apiPath(path), { ...init, headers });
    },
    [session, selectedProjectId],
  );
}
