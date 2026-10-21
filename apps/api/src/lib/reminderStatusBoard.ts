/**
 * Community Reminder status board.
 * One Telegram message per campaign. Older lines display as Sent; only the latest line uses the Queue result.
 */

import type { Prisma } from "@prisma/client";
import {
  editTelegramText,
  sendTelegramText,
  type TelegramFetch,
} from "./telegramNotify.js";

const MYT_TIME_ZONE = "Asia/Kuala_Lumpur";

const SENT_MARK = "🟢Sent";
const FAILED_MARK = "🔴Failed";

/**
 * How far before this process started a reminder may still be announced.
 * Older Sent or Failed rows are closed with no Telegram message.
 */
export const REMINDER_BOARD_LOOKBACK_MS = 30 * 60 * 1000;

/**
 * How far before now a missed reminder may still be announced after a restart.
 * Covers a sweep that did not run, without reopening reminders from earlier days.
 */
export const REMINDER_BOARD_RECENT_MS = 6 * 60 * 60 * 1000;

/** Board names. These stay fixed when a template is renamed in Settings. */
const BOARD_SLOT_NAMES: Record<string, string> = {
  welcome: "Welcome",
  countdown_2d: "2-Day Countdown",
  countdown_1d: "1-Day Countdown",
  starting_soon: "Starting Soon",
  countdown_1h: "1 Hour",
  live_now: "LIVE NOW",
  post_live_sticker: "Post-Live Sticker",
};

export type ReminderQueueResult = "SENT" | "FAILED";

export type ReminderScheduleRuleKind = "WEBINAR_DATE_OFFSET" | "EVENT_START_OFFSET";

export type ReminderBoardSlotInput = {
  scheduledMessageId: string;
  slotKey: string;
  sortOrder: number;
  scheduleRuleKind: ReminderScheduleRuleKind;
  dayOffset: number | null;
  scheduledAt: Date;
  queueResult: ReminderQueueResult;
};

/** One stored slot. The displayed mark is applied later, so a Failed result can still render as Sent. */
export type ReminderBoardLine = {
  scheduledMessageId: string;
  sortOrder: number;
  wording: string;
  queueResult: ReminderQueueResult;
};

export type ReminderBoardSnapshot = {
  chatId: string;
  messageId: number | null;
  lines: ReminderBoardLine[];
};

export type ReminderBatchSourceRow = {
  id: string;
  campaignId: string | null;
  operatorKind: string | null;
  status: string;
  scheduledAt: Date;
  projectName: string;
  slotKey: string | null;
  sortOrder: number | null;
  scheduleRuleKind: string | null;
  dayOffset: number | null;
};

export type CollectedReminderBoard = {
  campaignId: string;
  projectName: string;
  slots: ReminderBoardSlotInput[];
};

export type DeliverReminderBoardResult =
  | { ok: true; text: string; next: ReminderBoardSnapshot; telegramCalled: boolean }
  | { ok: false; error: string };

/**
 * True when this slot is recent enough to announce.
 * `notBeforeMs` is the process start minus {@link REMINDER_BOARD_LOOKBACK_MS}.
 */
export function shouldPublishReminderBoard(scheduledAt: Date, notBeforeMs: number): boolean {
  const at = scheduledAt.getTime();
  return Number.isFinite(at) && Number.isFinite(notBeforeMs) && at >= notBeforeMs;
}

/**
 * Earliest scheduled time that may still be announced.
 * Uses the older of the startup lookback and the recent-miss window.
 */
export function reminderAnnounceNotBeforeMs(processStartedAtMs: number, nowMs: number): number {
  const fromStart = processStartedAtMs - REMINDER_BOARD_LOOKBACK_MS;
  const fromNow = nowMs - REMINDER_BOARD_RECENT_MS;
  if (!Number.isFinite(fromStart)) {
    return fromNow;
  }
  if (!Number.isFinite(fromNow)) {
    return fromStart;
  }
  return Math.min(fromStart, fromNow);
}

/**
 * True when any slot in the batch is recent enough to announce.
 * A batch of only older slots must be closed without Telegram.
 */
export function reminderBatchIsCurrent(
  scheduledAts: readonly Date[],
  notBeforeMs: number,
): boolean {
  for (const scheduledAt of scheduledAts) {
    if (shouldPublishReminderBoard(scheduledAt, notBeforeMs)) {
      return true;
    }
  }
  return false;
}

/**
 * Turns a settled reminder batch into board slots, or null when this batch is not a campaign reminder.
 * Value posts return null here. The sweep sends those as a separate Telegram status message.
 */
export function collectReminderBoard(
  rows: readonly ReminderBatchSourceRow[],
): CollectedReminderBoard | null {
  const matches: ReminderBatchSourceRow[] = [];
  for (const row of rows) {
    if (row.operatorKind !== "REMINDER") {
      continue;
    }
    if (row.campaignId === null || row.campaignId.trim().length === 0) {
      continue;
    }
    if (row.status !== "SENT" && row.status !== "FAILED") {
      continue;
    }
    matches.push(row);
  }
  const first = matches[0];
  if (first === undefined || first.campaignId === null) {
    return null;
  }
  const campaignId = first.campaignId;
  const slots: ReminderBoardSlotInput[] = [];
  for (const row of matches) {
    if (row.campaignId !== campaignId) {
      continue;
    }
    const slot = toSlotInput(row);
    if (slot !== null) {
      slots.push(slot);
    }
  }
  if (slots.length === 0) {
    return null;
  }
  const projectName = first.projectName.trim().length > 0 ? first.projectName.trim() : "Project";
  return { campaignId, projectName, slots };
}

/**
 * Builds the stored wording for one slot. The Sent or Failed mark is not included.
 */
export function buildReminderBoardLine(slot: ReminderBoardSlotInput): ReminderBoardLine {
  const number = formatReminderSlotNumber(slot.sortOrder);
  const name = boardSlotName(slot.slotKey);
  const phrase = formatReminderWhenPhrase(slot.scheduleRuleKind, slot.dayOffset);
  const clock = formatReminderClockMyt(slot.scheduledAt);
  return {
    scheduledMessageId: slot.scheduledMessageId,
    sortOrder: Math.trunc(slot.sortOrder),
    wording: `${number} ${name} — ${phrase} · ${clock}`,
    queueResult: slot.queueResult,
  };
}

/**
 * Appends slots that are not already stored. An existing id keeps its original Queue result.
 */
export function appendReminderBoardLines(
  lines: readonly ReminderBoardLine[],
  incoming: readonly ReminderBoardLine[],
): ReminderBoardLine[] {
  const next = lines.map((line) => ({ ...line }));
  const seen = new Set(next.map((line) => line.scheduledMessageId));
  for (const line of incoming) {
    if (seen.has(line.scheduledMessageId)) {
      continue;
    }
    seen.add(line.scheduledMessageId);
    next.push({ ...line });
  }
  next.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.scheduledMessageId.localeCompare(b.scheduledMessageId);
  });
  return next;
}

/**
 * Renders the group message. Every line except the last is Sent. The last line uses its Queue result.
 */
export function formatReminderStatusBoard(
  projectName: string,
  lines: readonly ReminderBoardLine[],
): string {
  const ordered = appendReminderBoardLines(lines, []);
  const headerName = projectName.trim().length > 0 ? projectName.trim() : "Project";
  const rendered: string[] = [`Project: ${headerName}`, "👥 Community Reminder"];
  for (let index = 0; index < ordered.length; index += 1) {
    const line = ordered[index];
    if (line === undefined) {
      continue;
    }
    const latest = index === ordered.length - 1;
    const mark = latest && line.queueResult === "FAILED" ? FAILED_MARK : SENT_MARK;
    rendered.push(`${line.wording}  ${mark}`);
  }
  return rendered.join("\n");
}

/**
 * Reads stored lines. Invalid JSON entries are skipped.
 */
export function parseReminderBoardLines(value: Prisma.JsonValue): ReminderBoardLine[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const lines: ReminderBoardLine[] = [];
  for (const item of value) {
    const line = parseOneLine(item);
    if (line !== null) {
      lines.push(line);
    }
  }
  return appendReminderBoardLines(lines, []);
}

/**
 * JSON value stored on CampaignReminderBoard.lines.
 */
export function reminderBoardLinesToJson(
  lines: readonly ReminderBoardLine[],
): Prisma.InputJsonValue {
  return lines.map((line) => ({
    scheduledMessageId: line.scheduledMessageId,
    sortOrder: line.sortOrder,
    wording: line.wording,
    queueResult: line.queueResult,
  }));
}

/**
 * Sends or edits the board. When every incoming slot is already stored, Telegram is not called.
 * A deleted Telegram message is replaced with a new send that carries the full board.
 */
export async function deliverReminderBoard(input: {
  token: string;
  chatId: string;
  projectName: string;
  board: ReminderBoardSnapshot | null;
  slots: readonly ReminderBoardSlotInput[];
  fetchImpl?: TelegramFetch;
}): Promise<DeliverReminderBoardResult> {
  const token = input.token.trim();
  const chatId = input.chatId.trim();
  if (token.length === 0 || chatId.length === 0) {
    return { ok: false, error: "Telegram token or chat id is empty" };
  }
  const previous = input.board?.lines ?? [];
  const incoming = input.slots.map((slot) => buildReminderBoardLine(slot));
  const lines = appendReminderBoardLines(previous, incoming);
  if (lines.length === 0) {
    return { ok: false, error: "No reminder line to publish" };
  }
  const grew = lines.length > previous.length;
  const text = formatReminderStatusBoard(input.projectName, lines);
  const sameChat = input.board !== null && input.board.chatId === chatId;
  const messageId = sameChat ? input.board?.messageId ?? null : null;
  if (!grew && messageId !== null) {
    return {
      ok: true,
      text,
      telegramCalled: false,
      next: { chatId, messageId, lines },
    };
  }

  const fetchImpl = input.fetchImpl;
  if (messageId !== null) {
    const edited = await editTelegramText(token, chatId, messageId, text, fetchImpl);
    if (edited.ok) {
      return { ok: true, text, telegramCalled: true, next: { chatId, messageId, lines } };
    }
    if (!edited.messageMissing) {
      return { ok: false, error: edited.error };
    }
  }

  const sent = await sendTelegramText(token, chatId, text, fetchImpl);
  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }
  return {
    ok: true,
    text,
    telegramCalled: true,
    next: { chatId, messageId: sent.messageId, lines },
  };
}

/**
 * Two-digit slot number from sortOrder. Skipped slots are simply absent, so numbers can jump.
 */
export function formatReminderSlotNumber(sortOrder: number): string {
  const truncated = Math.trunc(sortOrder);
  const safe = truncated > 0 ? truncated : 0;
  return String(safe).padStart(2, "0");
}

/**
 * "4 days before", "1 day before", "Webinar day", or "2 days after".
 * Event-relative slots always say "Webinar day". The clock carries the time.
 */
export function formatReminderWhenPhrase(
  scheduleRuleKind: ReminderScheduleRuleKind,
  dayOffset: number | null,
): string {
  if (scheduleRuleKind === "EVENT_START_OFFSET") {
    return "Webinar day";
  }
  if (dayOffset === null || dayOffset === 0) {
    return "Webinar day";
  }
  const days = Math.abs(Math.trunc(dayOffset));
  const unit = days === 1 ? "day" : "days";
  if (dayOffset < 0) {
    return `${String(days)} ${unit} before`;
  }
  return `${String(days)} ${unit} after`;
}

/**
 * 12-hour clock in MYT, such as "3:00 PM". No timezone suffix.
 */
export function formatReminderClockMyt(scheduledAt: Date): string {
  if (Number.isNaN(scheduledAt.getTime())) {
    return "??:??";
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MYT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(scheduledAt);
  const hourText = partValue(parts, "hour");
  const minuteText = partValue(parts, "minute");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return "??:??";
  }
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const period = hour >= 12 ? "PM" : "AM";
  const minutes = String(minute).padStart(2, "0");
  return `${String(hour12)}:${minutes} ${period}`;
}

function boardSlotName(slotKey: string): string {
  return BOARD_SLOT_NAMES[slotKey] ?? slotKey;
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  for (const part of parts) {
    if (part.type === type) {
      return part.value;
    }
  }
  return "";
}

function toSlotInput(row: ReminderBatchSourceRow): ReminderBoardSlotInput | null {
  if (row.slotKey === null || row.slotKey.trim().length === 0) {
    return null;
  }
  if (row.sortOrder === null || !Number.isInteger(row.sortOrder)) {
    return null;
  }
  const scheduleRuleKind = toScheduleRuleKind(row.scheduleRuleKind);
  if (scheduleRuleKind === null) {
    return null;
  }
  const queueResult = toQueueResult(row.status);
  if (queueResult === null) {
    return null;
  }
  return {
    scheduledMessageId: row.id,
    slotKey: row.slotKey,
    sortOrder: row.sortOrder,
    scheduleRuleKind,
    dayOffset: row.dayOffset,
    scheduledAt: row.scheduledAt,
    queueResult,
  };
}

function toScheduleRuleKind(value: string | null): ReminderScheduleRuleKind | null {
  if (value === "WEBINAR_DATE_OFFSET" || value === "EVENT_START_OFFSET") {
    return value;
  }
  return null;
}

function toQueueResult(status: string): ReminderQueueResult | null {
  if (status === "SENT" || status === "FAILED") {
    return status;
  }
  return null;
}

function parseOneLine(value: Prisma.JsonValue): ReminderBoardLine | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const scheduledMessageId = readString(value, "scheduledMessageId");
  const wording = readString(value, "wording");
  const queueResultText = readString(value, "queueResult");
  const sortOrder = readInteger(value, "sortOrder");
  if (
    scheduledMessageId === null ||
    wording === null ||
    queueResultText === null ||
    sortOrder === null
  ) {
    return null;
  }
  const queueResult = toQueueResult(queueResultText);
  if (queueResult === null) {
    return null;
  }
  return { scheduledMessageId, sortOrder, wording, queueResult };
}

function readString(value: object, key: string): string | null {
  if (!(key in value)) {
    return null;
  }
  const record = Object.fromEntries(Object.entries(value));
  const found = record[key];
  if (typeof found !== "string" || found.trim().length === 0) {
    return null;
  }
  return found;
}

function readInteger(value: object, key: string): number | null {
  if (!(key in value)) {
    return null;
  }
  const record = Object.fromEntries(Object.entries(value));
  const found = record[key];
  if (typeof found !== "number" || !Number.isInteger(found)) {
    return null;
  }
  return found;
}
