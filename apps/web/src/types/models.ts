/**
 * Shared domain types for the NMCAS web app.
 */

export const MIN_LEAD_SECONDS = 15;

export type HealthResponse = {
  ok: boolean;
  queue: string;
  /** whatsmeow-node deploy */
  whatsappStoreExample?: string;
  /** legacy Baileys deploy */
  sessionPathExample?: string;
};

export type WaStatusResponse = {
  state: "disconnected" | "connecting" | "connected";
  hasQr: boolean;
};

export type WaGroup = {
  jid: string;
  /** Raw WhatsApp group title. */
  name: string;
  /**
   * Display line for lists (from API), usually `"Community › Announcements"` when linked.
   */
  label?: string;
  /** Community display name when this chat is a community subgroup. */
  communityName?: string;
  /** Channel / subgroup name within the community (e.g. `Announcements`). */
  channelName?: string;
  /** True when WhatsApp marks the group as announcement-only. */
  isAnnounce?: boolean;
  /** Parent community shell JID when known. */
  communityJid?: string;
};

export type ScheduledMessage = {
  id: string;
  groupJid: string;
  groupName: string;
  type: string;
  copyText: string | null;
  imageUrl: string | null;
  pollQuestion: string | null;
  pollOptions: string[];
  pollMultiSelect: boolean;
  scheduledAt: string;
  status: string;
  sentAt: string | null;
  error: string | null;
  createdByUserId?: string | null;
};

export type MessageKind = "POST" | "POLL";

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
};

