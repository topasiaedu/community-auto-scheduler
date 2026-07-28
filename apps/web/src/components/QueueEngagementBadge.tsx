/**
 * Minimal Queue engagement badge — reaction / reply counts for SENT rows.
 * Fetches `GET /messages/:id/engagement` (no analytics dashboard).
 */

import { useEffect, useState, type ReactElement } from "react";
import type { MessageEngagementCounts } from "../types/models.js";

type QueueEngagementBadgeProps = {
  messageId: string;
  status: string;
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

/**
 * Shows reaction and reply counts for a SENT scheduled message.
 * Hidden for non-SENT rows and while loading / on fetch errors.
 */
export function QueueEngagementBadge({
  messageId,
  status,
  authorizedFetch,
}: QueueEngagementBadgeProps): ReactElement | null {
  const [counts, setCounts] = useState<MessageEngagementCounts | null>(null);

  useEffect(() => {
    if (status !== "SENT") {
      setCounts(null);
      return;
    }
    let cancelled = false;
    void authorizedFetch(`/messages/${messageId}/engagement`)
      .then(async (res) => {
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as MessageEngagementCounts;
      })
      .then((data) => {
        if (!cancelled && data !== null) {
          setCounts(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCounts(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, messageId, status]);

  if (status !== "SENT" || counts === null) {
    return null;
  }

  return (
    <p
      className="mt-1 text-xs text-muted-foreground"
      title="Live counts since send (no historical backfill; gaps during disconnect)"
    >
      Reactions {String(counts.reactionCount)} · Replies {String(counts.replyCount)}
    </p>
  );
}
