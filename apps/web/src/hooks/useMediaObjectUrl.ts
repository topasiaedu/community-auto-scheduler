/**
 * Loads a private media object URL from the API for template / campaign previews.
 */

import { useEffect, useState } from "react";

export function useMediaObjectUrl(
  fetchFn: (path: string) => Promise<Response>,
  storagePath: string | null,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (storagePath === null || storagePath.length === 0) {
      setUrl((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await fetchFn(`/uploads/media?path=${encodeURIComponent(storagePath)}`);
      if (!res.ok || cancelled) {
        return;
      }
      const blob = await res.blob();
      if (cancelled) {
        return;
      }
      const next = URL.createObjectURL(blob);
      setUrl((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev);
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchFn, storagePath]);

  useEffect(() => {
    return () => {
      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    };
  }, [url]);

  return url;
}
