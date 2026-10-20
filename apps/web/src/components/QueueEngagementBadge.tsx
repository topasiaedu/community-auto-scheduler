/**
 * Queue engagement badge and the expanded reply list.
 * Fetches `GET /messages/:id/engagement`. Does not send WhatsApp messages.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { MessageEngagementCounts } from "../types/models.js";
import {
  ENGAGEMENT_REFRESH_MS,
  engagementRequestPath,
  formatEngagementBadge,
  formatEngagementReplyLine,
  parseEngagementCounts,
} from "../lib/engagementDisplay.js";

type EngagementFetchProps = {
  messageId: string;
  status: string;
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

/**
 * Loads engagement JSON. Overlapping calls are skipped. A failed refresh keeps
 * the last successful payload so the badge does not flash off every minute.
 */
function useEngagementCounts(
  messageId: string,
  status: string,
  includeRecent: boolean,
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
): MessageEngagementCounts | null {
  const [counts, setCounts] = useState<MessageEngagementCounts | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    try {
      const res = await authorizedFetch(engagementRequestPath(messageId, includeRecent));
      if (!res.ok) {
        return;
      }
      const body: unknown = await res.json();
      const parsed = parseEngagementCounts(body);
      if (parsed !== null) {
        setCounts(parsed);
      }
    } catch {
      // Leave the last successful counts on screen.
    } finally {
      inFlightRef.current = false;
    }
  }, [authorizedFetch, includeRecent, messageId]);

  useEffect(() => {
    if (status !== "SENT") {
      setCounts(null);
      return;
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, ENGAGEMENT_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [load, status]);

  return counts;
}

/**
 * Shows reaction and reply counts for a SENT scheduled message.
 * Hidden while the first request is in flight or when that request fails.
 * Does not request reply text (`includeRecent` stays off).
 */
export function QueueEngagementBadge({
  messageId,
  status,
  authorizedFetch,
}: EngagementFetchProps): ReactElement | null {
  const counts = useEngagementCounts(messageId, status, false, authorizedFetch);

  if (status !== "SENT" || counts === null) {
    return null;
  }

  return (
    <p
      className="mt-1 text-xs text-muted-foreground"
      title="Counts from events received after this post was sent. A disconnect can miss some."
    >
      {formatEngagementBadge(counts)}
    </p>
  );
}

/**
 * Latest replies for an expanded SENT row. Mount only while the card is expanded
 * so collapsed rows do not call `includeRecent=1`.
 */
export function QueueEngagementReplies({
  messageId,
  status,
  authorizedFetch,
}: EngagementFetchProps): ReactElement | null {
  const counts = useEngagementCounts(messageId, status, true, authorizedFetch);

  if (status !== "SENT" || counts === null) {
    return null;
  }

  const replies = counts.recentReplies ?? [];

  return (
    <div className="mt-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground/80">Replies</p>
      {replies.length === 0 ? (
        <p className="mt-1">No replies yet.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {replies.map((reply) => (
            <li key={reply.id}>{formatEngagementReplyLine(reply)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
