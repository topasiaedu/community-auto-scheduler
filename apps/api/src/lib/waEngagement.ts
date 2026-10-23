/**
 * Pure helpers for the engagement tracker foundation (Agent 4).
 *
 * Ingests reactions, announcement comments, and quoted replies that target NMCAS
 * outbound stanza ids (`ScheduledMessage.waMessageId`). Does **not** store general
 * group chatter.
 *
 * ## Known limitations
 * - No historical backfill — only events received while the session is connected.
 * - Events during disconnect / reconnect gaps are missed permanently.
 * - Announcement replies are `encCommentMessage` / `commentMessage` (parent id on
 *   `targetMessageKey`). A normal group reply is a quote (`contextInfo.stanzaID`).
 * - Encrypted reactions and comments need a live client decrypt call. The message
 *   secret stored at send time must still be in the session.
 * - Phone and LID JIDs for the same person are not merged.
 */

/** Max characters stored for reply body previews. */
export const ENGAGEMENT_BODY_PREVIEW_MAX = 280;

/** Recent list cap for the engagement read API. */
export const ENGAGEMENT_RECENT_LIST_DEFAULT = 20;

/**
 * Normalized reaction extracted from an inbound WhatsApp message payload.
 */
export type ParsedReactionEvent = {
  /** Stanza id of the message being reacted to (`waMessageId` match key). */
  targetWaMessageId: string;
  /** Emoji text; empty string means the reactor removed their reaction. */
  emoji: string;
  /** Stanza id of the reaction message itself when known. */
  waReactionId: string | null;
};

/**
 * Normalized quoted-reply extracted from an inbound WhatsApp message payload.
 */
export type ParsedReplyEvent = {
  /** Stanza id quoted (`waMessageId` match key). */
  quotedWaMessageId: string;
  /** Stanza id of this reply message. */
  replyWaMessageId: string;
  /** Truncated text preview (may be null for media-only replies). */
  bodyPreview: string | null;
};

/**
 * Trims and returns a non-empty string, or null.
 */
export function trimNonEmpty(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Truncates reply body text for storage / UI preview.
 */
export function truncateBodyPreview(text: string | null): string | null {
  if (text === null) {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length <= ENGAGEMENT_BODY_PREVIEW_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, ENGAGEMENT_BODY_PREVIEW_MAX)}…`;
}

/**
 * Builds the chat allowlist for engagement ingest.
 *
 * Includes:
 * - `groupJid` values from tracked NMCAS rows (messages that have a `waMessageId`)
 * - optional project `activeCommunityJids` (community shells; rarely the chat of the event)
 *
 * Events whose `info.chat` is outside this set are ignored.
 */
export function buildEngagementChatAllowlist(
  trackedGroupJids: readonly string[],
  activeCommunityJids: readonly string[] | null,
): Set<string> {
  const out = new Set<string>();
  for (const raw of trackedGroupJids) {
    const jid = trimNonEmpty(raw);
    if (jid !== null) {
      out.add(jid);
    }
  }
  if (activeCommunityJids !== null) {
    for (const raw of activeCommunityJids) {
      const jid = trimNonEmpty(raw);
      if (jid !== null) {
        out.add(jid);
      }
    }
  }
  return out;
}

/**
 * True when the inbound chat JID is allowlisted for engagement ingest.
 */
export function isEngagementChatAllowed(
  chatJid: string,
  allowlist: ReadonlySet<string>,
): boolean {
  const chat = trimNonEmpty(chatJid);
  if (chat === null) {
    return false;
  }
  return allowlist.has(chat);
}

/**
 * True when value is a non-null plain object (not an array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * One Queue row that might own an inbound reaction or reply.
 */
export type TrackedMessageCandidate = {
  id: string;
  groupJid: string;
};

/**
 * Chosen Queue row for an inbound event.
 */
export type TrackedMessageMatch = {
  id: string;
  /** True when the event chat JID is not the row's stored `groupJid`. */
  chatDiffers: boolean;
};

/**
 * Emoji total for the Queue badge. Removals are already excluded.
 */
export type ReactionBreakdownEntry = {
  emoji: string;
  count: number;
};

/**
 * Reads a WhatsApp message-key id.
 * Live protojson uses `ID` (`WACommon.MessageKey`). `id` is accepted as an alias.
 */
export function readMessageKeyId(key: unknown): string | null {
  if (!isPlainObject(key)) {
    return null;
  }
  return (
    trimNonEmpty(key.ID) ??
    trimNonEmpty(key.id) ??
    trimNonEmpty(key.stanzaID) ??
    trimNonEmpty(key.stanzaId)
  );
}

/**
 * Unwraps structural envelope wrappers WhatsApp uses around message payloads
 * (e.g. disappearing/ephemeral messages, view-once, device-sent companion sync).
 */
export function unwrapMessagePayload(
  message: Record<string, unknown>,
): Record<string, unknown> {
  let current: Record<string, unknown> = message;
  const wrapperKeys = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "deviceSentMessage",
  ] as const;

  let unwrapped = true;
  let depth = 0;
  while (unwrapped && depth < 5) {
    unwrapped = false;
    depth += 1;
    for (const key of wrapperKeys) {
      const nested = current[key];
      if (isPlainObject(nested) && isPlainObject(nested.message)) {
        current = nested.message as Record<string, unknown>;
        unwrapped = true;
        break;
      }
    }
  }
  return current;
}

/**
 * Destination group JID from a `deviceSentMessage` wrapper, when present.
 * Companion-device sync often puts the real group here while `info.chat` is wrong.
 */
export function extractDeviceSentDestinationChat(
  message: Record<string, unknown>,
): string | null {
  let current: Record<string, unknown> = message;
  for (let depth = 0; depth < 5; depth += 1) {
    if (isPlainObject(current.deviceSentMessage)) {
      const dsm = current.deviceSentMessage;
      const dest =
        trimNonEmpty(dsm.destinationJID) ?? trimNonEmpty(dsm.destinationJid);
      if (dest !== null) {
        return dest;
      }
    }
    let next: Record<string, unknown> | null = null;
    for (const key of [
      "ephemeralMessage",
      "viewOnceMessage",
      "viewOnceMessageV2",
      "viewOnceMessageV2Extension",
      "documentWithCaptionMessage",
      "deviceSentMessage",
    ] as const) {
      const nested = current[key];
      if (isPlainObject(nested) && isPlainObject(nested.message)) {
        next = nested.message;
        break;
      }
    }
    if (next === null) {
      break;
    }
    current = next;
  }
  return null;
}

/**
 * Group JID from an encrypted reaction or comment `targetMessageKey.remoteJID`.
 * Used when `info.chat` is not the announcement group.
 */
export function parseEngagementTargetChat(
  message: Record<string, unknown>,
): string | null {
  const unwrapped = unwrapMessagePayload(message);
  for (const wrapper of [unwrapped.encReactionMessage, unwrapped.encCommentMessage, unwrapped.commentMessage]) {
    if (!isPlainObject(wrapper)) {
      continue;
    }
    const key = wrapper.targetMessageKey;
    if (!isPlainObject(key)) {
      continue;
    }
    const chat =
      trimNonEmpty(key.remoteJID) ??
      trimNonEmpty(key.remoteJid) ??
      trimNonEmpty(key.RemoteJID);
    if (chat !== null) {
      return chat;
    }
  }
  return null;
}

/**
 * Chat JID to use for allowlist checks. Prefers companion destination, then the
 * encrypted target's remote JID, then the event chat.
 */
export function resolveEngagementChat(
  message: Record<string, unknown>,
  eventChat: string,
): string {
  return (
    extractDeviceSentDestinationChat(message) ??
    parseEngagementTargetChat(message) ??
    eventChat.trim()
  );
}

/**
 * Emoji text from a reaction field. Missing or blank text is a removal.
 */
function readReactionEmoji(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/**
 * Picks the Queue row for a `waMessageId`.
 * One row wins even when the chat JID differs. Several rows require a chat match.
 */
export function selectTrackedMessage(
  rows: readonly TrackedMessageCandidate[],
  chatJid: string,
): TrackedMessageMatch | null {
  if (rows.length === 1) {
    const only = rows[0];
    if (only === undefined) {
      return null;
    }
    return {
      id: only.id,
      chatDiffers: only.groupJid !== chatJid,
    };
  }
  if (rows.length === 0) {
    return null;
  }
  const chat = chatJid.trim();
  const matched = rows.filter((row) => row.groupJid === chat);
  if (matched.length !== 1) {
    return null;
  }
  const hit = matched[0];
  if (hit === undefined) {
    return null;
  }
  return { id: hit.id, chatDiffers: false };
}

/**
 * Groups reaction rows for the badge. Blank emoji (removal) is omitted.
 * Sort is count descending, then emoji ascending.
 */
export function buildReactionBreakdown(
  rows: ReadonlyArray<{ emoji: string; count: number }>,
): { reactionCount: number; reactionBreakdown: ReactionBreakdownEntry[] } {
  const byEmoji = new Map<string, number>();
  for (const row of rows) {
    const emoji = row.emoji.trim();
    if (emoji.length === 0 || !Number.isInteger(row.count) || row.count <= 0) {
      continue;
    }
    const prev = byEmoji.get(emoji) ?? 0;
    byEmoji.set(emoji, prev + row.count);
  }
  const reactionBreakdown: ReactionBreakdownEntry[] = [];
  for (const [emoji, count] of byEmoji) {
    reactionBreakdown.push({ emoji, count });
  }
  reactionBreakdown.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    if (a.emoji < b.emoji) {
      return -1;
    }
    if (a.emoji > b.emoji) {
      return 1;
    }
    return 0;
  });
  let reactionCount = 0;
  for (const entry of reactionBreakdown) {
    reactionCount += entry.count;
  }
  return { reactionCount, reactionBreakdown };
}

/**
 * Extracts `contextInfo` from common WhatsApp message wrappers.
 */
export function extractContextInfo(
  message: Record<string, unknown>,
): Record<string, unknown> | null {
  const unwrapped = unwrapMessagePayload(message);
  if (isPlainObject(unwrapped.contextInfo)) {
    return unwrapped.contextInfo;
  }

  const wrappers = [
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "documentMessage",
    "audioMessage",
    "stickerMessage",
    "buttonsMessage",
    "templateMessage",
    "listMessage",
    "contactMessage",
    "locationMessage",
  ] as const;

  for (const key of wrappers) {
    const nested = unwrapped[key];
    if (!isPlainObject(nested)) {
      continue;
    }
    if (isPlainObject(nested.contextInfo)) {
      return nested.contextInfo;
    }
  }
  return null;
}

/**
 * Extracts quoted stanza id from a message payload (reply → announcement match key).
 */
export function extractQuotedWaMessageId(
  message: Record<string, unknown>,
): string | null {
  const ctx = extractContextInfo(message);
  if (ctx === null) {
    return null;
  }
  return trimNonEmpty(ctx.stanzaId) ?? trimNonEmpty(ctx.stanzaID);
}

/**
 * Best-effort text body from common message shapes (for reply previews).
 */
export function extractMessageBodyText(
  message: Record<string, unknown>,
): string | null {
  const unwrapped = unwrapMessagePayload(message);
  const conversation = trimNonEmpty(unwrapped.conversation);
  if (conversation !== null) {
    return conversation;
  }
  const extended = unwrapped.extendedTextMessage;
  if (isPlainObject(extended)) {
    const text = trimNonEmpty(extended.text);
    if (text !== null) {
      return text;
    }
  }
  const image = unwrapped.imageMessage;
  if (isPlainObject(image)) {
    const caption = trimNonEmpty(image.caption);
    if (caption !== null) {
      return caption;
    }
  }
  const video = unwrapped.videoMessage;
  if (isPlainObject(video)) {
    const caption = trimNonEmpty(video.caption);
    if (caption !== null) {
      return caption;
    }
  }
  const document = unwrapped.documentMessage;
  if (isPlainObject(document)) {
    const caption = trimNonEmpty(document.caption);
    if (caption !== null) {
      return caption;
    }
  }
  return null;
}

/**
 * Parses a plaintext `reactionMessage` payload into a normalized reaction event.
 * Returns null when the payload is not a reaction or lacks a target id.
 */
export function parsePlainReactionMessage(
  message: Record<string, unknown>,
  reactionWaMessageId: string | null,
): ParsedReactionEvent | null {
  const unwrapped = unwrapMessagePayload(message);
  const reaction = unwrapped.reactionMessage;
  if (!isPlainObject(reaction)) {
    return null;
  }
  const targetId =
    readMessageKeyId(reaction.key) ??
    trimNonEmpty(reaction.messageID) ??
    trimNonEmpty(reaction.messageId);
  if (targetId === null) {
    return null;
  }
  const emoji = readReactionEmoji(reaction.text);
  return {
    targetWaMessageId: targetId,
    emoji,
    waReactionId: reactionWaMessageId,
  };
}

/**
 * Parses a decrypted reaction payload (from `decryptReaction`) into a normalized event.
 * Accepts `{ reactionMessage: … }`, flat `{ key, text }`, and a body that only has `text`.
 * Announcement reactions strip `key` before encryption. Pass the wrapper target id for those.
 */
export function parseDecryptedReactionPayload(
  decrypted: Record<string, unknown>,
  reactionWaMessageId: string | null,
  wrapperTargetWaMessageId: string | null = null,
): ParsedReactionEvent | null {
  const unwrapped = unwrapMessagePayload(decrypted);
  const fromWrapper = parsePlainReactionMessage(unwrapped, reactionWaMessageId);
  if (fromWrapper !== null) {
    return fromWrapper;
  }
  const targetId =
    readMessageKeyId(unwrapped.key) ??
    trimNonEmpty(unwrapped.messageID) ??
    trimNonEmpty(unwrapped.messageId) ??
    trimNonEmpty(wrapperTargetWaMessageId);
  if (targetId === null) {
    return null;
  }
  const emoji = readReactionEmoji(unwrapped.text ?? unwrapped.reaction);
  return {
    targetWaMessageId: targetId,
    emoji,
    waReactionId: reactionWaMessageId,
  };
}

/**
 * Announcement stanza id carried on `encReactionMessage.targetMessageKey`.
 * Decrypt leaves this off the inner reaction, which only has `text` and `senderTimestampMS`.
 */
export function parseEncryptedReactionTargetId(
  message: Record<string, unknown>,
): string | null {
  const unwrapped = unwrapMessagePayload(message);
  const encrypted = unwrapped.encReactionMessage;
  if (!isPlainObject(encrypted)) {
    return null;
  }
  return readMessageKeyId(encrypted.targetMessageKey);
}

/**
 * True when the inbound payload looks like an encrypted reaction needing decrypt.
 */
export function hasEncryptedReaction(message: Record<string, unknown>): boolean {
  const unwrapped = unwrapMessagePayload(message);
  return isPlainObject(unwrapped.encReactionMessage);
}

/**
 * True when the inbound payload is an encrypted announcement comment.
 */
export function hasEncryptedComment(message: Record<string, unknown>): boolean {
  const unwrapped = unwrapMessagePayload(message);
  return isPlainObject(unwrapped.encCommentMessage);
}

/**
 * Parent stanza id for an announcement comment (`targetMessageKey.ID`).
 * Checks the encrypted wrapper first, then a plaintext `commentMessage`.
 */
export function parseCommentTargetId(message: Record<string, unknown>): string | null {
  const unwrapped = unwrapMessagePayload(message);
  const encrypted = unwrapped.encCommentMessage;
  if (isPlainObject(encrypted)) {
    const fromEncrypted = readMessageKeyId(encrypted.targetMessageKey);
    if (fromEncrypted !== null) {
      return fromEncrypted;
    }
  }
  const plain = unwrapped.commentMessage;
  if (isPlainObject(plain)) {
    return readMessageKeyId(plain.targetMessageKey);
  }
  return null;
}

/**
 * Builds a reply event from a body payload aimed at `targetWaMessageId`.
 */
function buildTrackedReply(
  targetWaMessageId: string,
  replyWaMessageId: string,
  bodySource: Record<string, unknown>,
): ParsedReplyEvent | null {
  const targetId = trimNonEmpty(targetWaMessageId);
  const replyId = trimNonEmpty(replyWaMessageId);
  if (targetId === null || replyId === null) {
    return null;
  }
  return {
    quotedWaMessageId: targetId,
    replyWaMessageId: replyId,
    bodyPreview: truncateBodyPreview(extractMessageBodyText(bodySource)),
  };
}

/**
 * Parses a plaintext `commentMessage` (announcement reply that is not encrypted).
 */
export function parsePlainCommentEvent(
  message: Record<string, unknown>,
  replyWaMessageId: string,
): ParsedReplyEvent | null {
  const unwrapped = unwrapMessagePayload(message);
  const comment = unwrapped.commentMessage;
  if (!isPlainObject(comment)) {
    return null;
  }
  const targetId = readMessageKeyId(comment.targetMessageKey);
  if (targetId === null) {
    return null;
  }
  const inner = isPlainObject(comment.message) ? comment.message : comment;
  return buildTrackedReply(targetId, replyWaMessageId, inner);
}

/**
 * Parses a body returned by `decryptComment`. The parent id comes from the wrapper.
 */
export function parseDecryptedCommentEvent(
  decrypted: Record<string, unknown>,
  targetWaMessageId: string,
  replyWaMessageId: string,
): ParsedReplyEvent | null {
  return buildTrackedReply(targetWaMessageId, replyWaMessageId, decrypted);
}

/**
 * Stanza id of a reply that was deleted for everyone.
 * Only the string `"REVOKE"` counts. A missing type, or numeric `0`, does not.
 */
export function parseReplyRevokeId(message: Record<string, unknown>): string | null {
  const unwrapped = unwrapMessagePayload(message);
  const protocol = unwrapped.protocolMessage;
  if (!isPlainObject(protocol)) {
    return null;
  }
  if (protocol.type !== "REVOKE") {
    return null;
  }
  return readMessageKeyId(protocol.key);
}

/**
 * Parses a quoted reply targeting another stanza id.
 * Returns null when there is no quote (free-form chatter is ignored by design).
 */
export function parseQuotedReplyEvent(
  message: Record<string, unknown>,
  replyWaMessageId: string,
): ParsedReplyEvent | null {
  const unwrapped = unwrapMessagePayload(message);
  const replyId = trimNonEmpty(replyWaMessageId);
  if (replyId === null) {
    return null;
  }
  // Reactions and announcement comments are handled by their own parsers.
  if (
    isPlainObject(unwrapped.reactionMessage) ||
    hasEncryptedReaction(unwrapped) ||
    hasEncryptedComment(unwrapped) ||
    isPlainObject(unwrapped.commentMessage)
  ) {
    return null;
  }
  const quotedWaMessageId = extractQuotedWaMessageId(unwrapped);
  if (quotedWaMessageId === null) {
    return null;
  }
  return {
    quotedWaMessageId,
    replyWaMessageId: replyId,
    bodyPreview: truncateBodyPreview(extractMessageBodyText(unwrapped)),
  };
}

/**
 * Converts a WhatsApp unix-seconds (or ms) timestamp into a Date.
 */
export function waTimestampToDate(timestamp: number, fallbackMs: number = Date.now()): Date {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return new Date(fallbackMs);
  }
  // Heuristic: values below year ~2001 in ms are almost certainly seconds.
  const ms = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return new Date(fallbackMs);
  }
  return d;
}

/**
 * True when a reaction emoji is a removal (empty string after trim).
 */
export function isReactionRemoval(emoji: string): boolean {
  return emoji.trim().length === 0;
}

/**
 * Counts only non-removed reactions for operator-facing totals.
 */
export function countActiveReactions(
  reactions: ReadonlyArray<{ emoji: string }>,
): number {
  let n = 0;
  for (const r of reactions) {
    if (!isReactionRemoval(r.emoji)) {
      n += 1;
    }
  }
  return n;
}
