/**
 * Pure helpers for the engagement tracker foundation (Agent 4).
 *
 * Ingests reactions and quoted replies that target NMCAS outbound stanza ids
 * (`ScheduledMessage.waMessageId`). Does **not** store general group chatter.
 *
 * ## Known limitations
 * - No historical backfill — only events received while the session is connected.
 * - Events during disconnect / reconnect gaps are missed permanently.
 * - Reply scope is **quotes on the announcement message** only (stanzaId match);
 *   free-form discussion-group chatter is ignored unless it quotes our message.
 * - Encrypted reactions require a live client `decryptReaction` call; plaintext
 *   `reactionMessage` is preferred when present.
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
 * Extracts `contextInfo` from common WhatsApp message wrappers.
 */
export function extractContextInfo(
  message: Record<string, unknown>,
): Record<string, unknown> | null {
  if (isPlainObject(message.contextInfo)) {
    return message.contextInfo;
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
    const nested = message[key];
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
  const conversation = trimNonEmpty(message.conversation);
  if (conversation !== null) {
    return conversation;
  }
  const extended = message.extendedTextMessage;
  if (isPlainObject(extended)) {
    const text = trimNonEmpty(extended.text);
    if (text !== null) {
      return text;
    }
  }
  const image = message.imageMessage;
  if (isPlainObject(image)) {
    const caption = trimNonEmpty(image.caption);
    if (caption !== null) {
      return caption;
    }
  }
  const video = message.videoMessage;
  if (isPlainObject(video)) {
    const caption = trimNonEmpty(video.caption);
    if (caption !== null) {
      return caption;
    }
  }
  const document = message.documentMessage;
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
  const reaction = message.reactionMessage;
  if (!isPlainObject(reaction)) {
    return null;
  }
  const key = reaction.key;
  const targetId = isPlainObject(key)
    ? trimNonEmpty(key.id)
    : trimNonEmpty(reaction.messageID) ?? trimNonEmpty(reaction.messageId);
  if (targetId === null) {
    return null;
  }
  const emojiRaw = reaction.text;
  const emoji = typeof emojiRaw === "string" ? emojiRaw : "";
  return {
    targetWaMessageId: targetId,
    emoji,
    waReactionId: reactionWaMessageId,
  };
}

/**
 * Parses a decrypted reaction payload (from `decryptReaction`) into a normalized event.
 * Accepts both `{ reactionMessage: … }` wrappers and flat `{ key, text }` shapes.
 */
export function parseDecryptedReactionPayload(
  decrypted: Record<string, unknown>,
  reactionWaMessageId: string | null,
): ParsedReactionEvent | null {
  const fromWrapper = parsePlainReactionMessage(decrypted, reactionWaMessageId);
  if (fromWrapper !== null) {
    return fromWrapper;
  }
  const key = decrypted.key;
  const targetId = isPlainObject(key)
    ? trimNonEmpty(key.id)
    : trimNonEmpty(decrypted.messageID) ?? trimNonEmpty(decrypted.messageId);
  if (targetId === null) {
    return null;
  }
  const emojiRaw = decrypted.text ?? decrypted.reaction;
  const emoji = typeof emojiRaw === "string" ? emojiRaw : "";
  return {
    targetWaMessageId: targetId,
    emoji,
    waReactionId: reactionWaMessageId,
  };
}

/**
 * True when the inbound payload looks like an encrypted reaction needing decrypt.
 */
export function hasEncryptedReaction(message: Record<string, unknown>): boolean {
  return isPlainObject(message.encReactionMessage);
}

/**
 * Parses a quoted reply targeting another stanza id.
 * Returns null when there is no quote (free-form chatter is ignored by design).
 */
export function parseQuotedReplyEvent(
  message: Record<string, unknown>,
  replyWaMessageId: string,
): ParsedReplyEvent | null {
  const replyId = trimNonEmpty(replyWaMessageId);
  if (replyId === null) {
    return null;
  }
  // Skip pure reaction payloads — handled by the reaction path.
  if (isPlainObject(message.reactionMessage) || hasEncryptedReaction(message)) {
    return null;
  }
  const quotedWaMessageId = extractQuotedWaMessageId(message);
  if (quotedWaMessageId === null) {
    return null;
  }
  return {
    quotedWaMessageId,
    replyWaMessageId: replyId,
    bodyPreview: truncateBodyPreview(extractMessageBodyText(message)),
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
