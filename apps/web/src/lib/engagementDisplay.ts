/**
 * Queue engagement display. Pure functions so the badge text can be checked
 * without a browser or a WhatsApp session.
 */

import type {
  MessageEngagementCounts,
  MessageEngagementReply,
} from "../types/models.js";
import { formatRelativeTime } from "./format.js";

/** How often a visible Sent row refreshes counts while the Queue page is open. */
export const ENGAGEMENT_REFRESH_MS = 60_000;

/**
 * True when value is a non-null plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Path for `GET /messages/:id/engagement`.
 * Collapsed Queue rows pass `includeRecent` false so they do not load reply text.
 */
export function engagementRequestPath(messageId: string, includeRecent: boolean): string {
  const base = `/messages/${encodeURIComponent(messageId)}/engagement`;
  if (!includeRecent) {
    return base;
  }
  return `${base}?includeRecent=1`;
}

/**
 * "12 reactions" / "1 reaction" / "0 reactions".
 */
function countLabel(count: number, singular: string, plural: string): string {
  const word = count === 1 ? singular : plural;
  return `${String(count)} ${word}`;
}

/**
 * Badge line. Breakdown order is the order the API already sorted.
 * Example: `12 reactions (👍 8, ❤️ 4) · 3 replies`.
 */
export function formatEngagementBadge(counts: {
  reactionCount: number;
  replyCount: number;
  reactionBreakdown: ReadonlyArray<{ emoji: string; count: number }>;
}): string {
  const reactions = countLabel(counts.reactionCount, "reaction", "reactions");
  const replies = countLabel(counts.replyCount, "reply", "replies");
  if (counts.reactionBreakdown.length === 0) {
    return `${reactions} · ${replies}`;
  }
  const parts = counts.reactionBreakdown.map(
    (entry) => `${entry.emoji} ${String(entry.count)}`,
  );
  return `${reactions} (${parts.join(", ")}) · ${replies}`;
}

/**
 * One expanded reply line: display name when present, otherwise the member JID.
 */
export function formatEngagementReplyLine(reply: {
  replierName: string | null;
  replierJid: string;
  bodyPreview: string | null;
  repliedAt: string;
}): string {
  const named = reply.replierName?.trim() ?? "";
  const who = named.length > 0 ? named : reply.replierJid;
  const preview = reply.bodyPreview?.trim() ?? "";
  const body = preview.length > 0 ? preview : "(no text)";
  const when = formatRelativeTime(reply.repliedAt);
  return `${who} — ${body} — ${when}`;
}

/**
 * Reads a count payload. Returns null when the body is not the engagement shape.
 * `reactionBreakdown` may be omitted; it is then treated as empty.
 */
export function parseEngagementCounts(value: unknown): MessageEngagementCounts | null {
  if (!isRecord(value)) {
    return null;
  }
  const messageId = value.messageId;
  const reactionCount = value.reactionCount;
  const replyCount = value.replyCount;
  if (typeof messageId !== "string" || messageId.length === 0) {
    return null;
  }
  if (typeof reactionCount !== "number" || !Number.isFinite(reactionCount)) {
    return null;
  }
  if (typeof replyCount !== "number" || !Number.isFinite(replyCount)) {
    return null;
  }
  const reactionBreakdown: MessageEngagementCounts["reactionBreakdown"] = [];
  if (Array.isArray(value.reactionBreakdown)) {
    for (const entry of value.reactionBreakdown) {
      if (!isRecord(entry)) {
        continue;
      }
      if (typeof entry.emoji !== "string" || typeof entry.count !== "number") {
        continue;
      }
      if (entry.emoji.trim().length === 0 || !Number.isFinite(entry.count)) {
        continue;
      }
      reactionBreakdown.push({ emoji: entry.emoji, count: entry.count });
    }
  }
  const parsed: MessageEngagementCounts = {
    messageId,
    reactionCount,
    replyCount,
    reactionBreakdown,
  };
  if (Array.isArray(value.recentReplies)) {
    parsed.recentReplies = parseRecentReplies(value.recentReplies);
  }
  return parsed;
}

/**
 * Reads recent reply rows. Skips rows that lack an id or a replier JID.
 */
function parseRecentReplies(value: unknown[]): MessageEngagementReply[] {
  const replies: MessageEngagementReply[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    if (typeof entry.id !== "string" || typeof entry.replierJid !== "string") {
      continue;
    }
    if (typeof entry.repliedAt !== "string") {
      continue;
    }
    const replyWaMessageId =
      typeof entry.replyWaMessageId === "string" ? entry.replyWaMessageId : "";
    const replierName = typeof entry.replierName === "string" ? entry.replierName : null;
    const bodyPreview = typeof entry.bodyPreview === "string" ? entry.bodyPreview : null;
    replies.push({
      id: entry.id,
      replyWaMessageId,
      replierJid: entry.replierJid,
      replierName,
      bodyPreview,
      repliedAt: entry.repliedAt,
    });
  }
  return replies;
}
