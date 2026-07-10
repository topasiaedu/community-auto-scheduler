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
  operatorKind?: OperatorKind | null;
  valueFormat?: ValueFormat | null;
  reminderFormat?: ReminderFormat | null;
  campaignId?: string | null;
  campaignWebinarDate?: string | null;
  reminderTemplateSlotKey?: string | null;
  reminderTemplateName?: string | null;
  copyText: string | null;
  imageUrl: string | null;
  stickerUrl?: string | null;
  pollQuestion: string | null;
  pollOptions: string[];
  pollMultiSelect: boolean;
  scheduledAt: string;
  status: string;
  sentAt: string | null;
  error: string | null;
  createdByUserId?: string | null;
};

export type OperatorKind = "VALUE" | "REMINDER";

export type ValueFormat = "IMAGE_CAPTION" | "TEXT_ONLY" | "POLL";

export type SingleMessageKind = OperatorKind;

/** @deprecated Legacy compose types — use OperatorKind / ValueFormat for new UI */
export type MessageKind = "POST" | "POLL";

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  sopUrl: string | null;
  campaignNote: string | null;
  /** null or [] = all eligible communities for Value fan-out. */
  activeCommunityJids: string[] | null;
};

/** Eight merge fields from campaign setup (P7 UX spec §4 Step 1). */
export type CampaignCustomValues = {
  workshopDay: string;
  workshopDate: string;
  workshopTime: string;
  zoomLink: string;
  sessionDate: string;
  sessionTime: string;
  zoomId: string;
  zoomPasscode: string;
};

export type ReminderFormat = "IMAGE" | "TEXT" | "STICKER";

export type ScheduleRuleKind = "WEBINAR_DATE_OFFSET" | "EVENT_START_OFFSET";

export type ReminderTemplateRow = {
  id: string;
  slotKey: string;
  name: string;
  reminderFormat: ReminderFormat;
  mediaUrl: string | null;
  stickerUrl: string | null;
  bodyTemplate: string | null;
  scheduleRuleKind: ScheduleRuleKind;
  dayOffset: number | null;
  clockTimeMyt: string | null;
  startOffsetMinutes: number | null;
  sortOrder: number;
};

