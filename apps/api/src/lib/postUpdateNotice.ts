/**
 * Formats the ops WhatsApp DM sent once when a scheduled post finishes.
 * Sent/Failed match Queue. The footer tells the reader to open the community.
 */

/** Approved Value preview length, before the trailing ellipsis. */
const PREVIEW_MAX_CHARS = "If you're ready to learn, reset, and take back control".length;

/** Same budget as the daily digest. */
const MAX_NOTICE_CHARS = 3500;

/** Same cap as the old failure-DM error snippet. */
const MAX_NOTIFY_ERROR_IN_BODY = 800;

/** Extra wait after scheduledAt + receipt timeout before a still-open batch can be reported. */
export const POST_UPDATE_SETTLE_BUFFER_MS = 30_000;

const FOOTER =
  "Sent means WhatsApp acknowledged the send. Open the community to confirm the post is on screen.";

export type PostUpdateRowStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "DRAFT"
  | "CANCELLED";

/** One community row inside a fan-out batch. */
export type PostUpdateNoticeRow = {
  groupName: string;
  status: PostUpdateRowStatus;
  error: string | null;
  copyText: string | null;
  operatorKind: "VALUE" | "REMINDER" | null;
  valueFormat: "IMAGE_CAPTION" | "TEXT_ONLY" | "POLL" | null;
  reminderFormat: "IMAGE" | "TEXT" | "STICKER" | null;
  slotName: string | null;
  scheduledAt: Date;
  projectName: string;
  legacyType: "POST" | "POLL" | null;
};

/**
 * True when every row has left PENDING/SENDING, so the DM can list a Queue result.
 * Cancelled and draft rows do not hold the batch open.
 */
export function isPostUpdateBatchReady(
  rows: readonly { status: string; scheduledAt: Date }[],
  nowMs: number,
  receiptTimeoutMs: number,
): boolean {
  if (rows.length === 0) {
    return false;
  }
  const open = rows.some((row) => row.status === "PENDING" || row.status === "SENDING");
  if (!open) {
    return true;
  }
  let latestMs = 0;
  for (const row of rows) {
    const at = row.scheduledAt.getTime();
    if (Number.isFinite(at) && at > latestMs) {
      latestMs = at;
    }
  }
  const timeout =
    Number.isFinite(receiptTimeoutMs) && receiptTimeoutMs > 0 ? receiptTimeoutMs : 90_000;
  return nowMs >= latestMs + timeout + POST_UPDATE_SETTLE_BUFFER_MS;
}

/**
 * Community label operators already read: the text before " › " when the stored name repeats it.
 */
export function communityLabel(groupName: string): string {
  const marker = " › ";
  const idx = groupName.indexOf(marker);
  if (idx === -1) {
    return groupName.trim();
  }
  const head = groupName.slice(0, idx).trim();
  return head.length > 0 ? head : groupName.trim();
}

/**
 * Builds the DM text, or null when every row is cancelled or draft (send nothing).
 */
export function formatPostUpdateNotice(rows: readonly PostUpdateNoticeRow[]): string | null {
  const reportable = rows.filter(
    (row) =>
      row.status === "SENT" ||
      row.status === "FAILED" ||
      row.status === "PENDING" ||
      row.status === "SENDING",
  );
  const sample = reportable[0];
  if (sample === undefined) {
    return null;
  }

  const header = buildHeader(sample);
  const communityLines = reportable.map((row) => toCommunityLine(row));
  let omittedSent = 0;
  let kept: { kind: "sent" | "failed" | "open"; text: string }[] = communityLines;
  while (assemble(header, kept, reportable.length).length > MAX_NOTICE_CHARS && omittedSent < countSent(reportable)) {
    const next = dropLastSentLine(reportable, kept);
    if (next === null) {
      break;
    }
    kept = next.lines;
    omittedSent = next.omittedSent;
  }

  let text = assemble(header, kept, reportable.length);
  if (text.length > MAX_NOTICE_CHARS) {
    text = `${text.slice(0, MAX_NOTICE_CHARS - 1)}…`;
  }
  return text;
}

/**
 * Shortens an error the same way the old failure DM did.
 */
export function truncateNotifyError(message: string): string {
  if (message.length <= MAX_NOTIFY_ERROR_IN_BODY) {
    return message;
  }
  return `${message.slice(0, MAX_NOTIFY_ERROR_IN_BODY)}…`;
}

function buildHeader(sample: PostUpdateNoticeRow): string[] {
  const lines = [
    `[NMCAS] Post update — ${formatWhenMyt(sample.scheduledAt)}`,
    `Project: ${sample.projectName}`,
    `Post: ${postTitle(sample)}`,
  ];
  const preview = previewText(sample);
  if (preview !== null) {
    lines.push(`Preview: ${preview}`);
  }
  return lines;
}

function postTitle(row: PostUpdateNoticeRow): string {
  if (row.operatorKind === "REMINDER") {
    const name = row.slotName?.trim() ?? "";
    return name.length > 0 ? name : "Reminder";
  }
  if (row.operatorKind === "VALUE") {
    if (row.valueFormat === "IMAGE_CAPTION") {
      return "Value · image + caption";
    }
    if (row.valueFormat === "TEXT_ONLY") {
      return "Value · text";
    }
    if (row.valueFormat === "POLL") {
      return "Value · poll";
    }
    return "Value";
  }
  if (row.legacyType === "POLL") {
    return "Poll";
  }
  return "Post";
}

function previewText(row: PostUpdateNoticeRow): string | null {
  if (row.reminderFormat === "STICKER") {
    return null;
  }
  if (row.copyText === null) {
    return null;
  }
  const firstLine = row.copyText.split(/\r?\n/u)[0]?.trim() ?? "";
  if (firstLine.length === 0) {
    return null;
  }
  const clipped =
    firstLine.length <= PREVIEW_MAX_CHARS ? firstLine : firstLine.slice(0, PREVIEW_MAX_CHARS);
  return `${clipped}…`;
}

function toCommunityLine(row: PostUpdateNoticeRow): { kind: "sent" | "failed" | "open"; text: string } {
  const label = communityLabel(row.groupName);
  if (row.status === "FAILED") {
    const detail = row.error === null ? "" : row.error.trim();
    if (detail.length === 0) {
      return { kind: "failed", text: `• ${label} — Failed` };
    }
    return { kind: "failed", text: `• ${label} — Failed — ${truncateNotifyError(detail)}` };
  }
  if (row.status === "PENDING" || row.status === "SENDING") {
    return { kind: "open", text: `• ${label} — Sending` };
  }
  return { kind: "sent", text: `• ${label} — Sent` };
}

function countSent(rows: readonly PostUpdateNoticeRow[]): number {
  return rows.filter((row) => row.status === "SENT").length;
}

function dropLastSentLine(
  reportable: readonly PostUpdateNoticeRow[],
  lines: readonly { kind: "sent" | "failed" | "open"; text: string }[],
): { lines: { kind: "sent" | "failed" | "open"; text: string }[]; omittedSent: number } | null {
  let lastSent = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line !== undefined && line.kind === "sent") {
      lastSent = i;
      break;
    }
  }
  if (lastSent === -1) {
    return null;
  }
  const next = lines.filter((_, index) => index !== lastSent);
  const omittedSent = countSent(reportable) - next.filter((line) => line.kind === "sent").length;
  return { lines: next, omittedSent };
}

function assemble(
  header: readonly string[],
  lines: readonly { kind: "sent" | "failed" | "open"; text: string }[],
  communityCount: number,
): string {
  const omittedSent = communityCount - lines.length;
  const body = [
    ...header,
    "",
    `Communities (${String(communityCount)}):`,
    ...lines.map((line) => line.text),
  ];
  if (omittedSent > 0) {
    body.push(`… +${String(omittedSent)} Sent`);
  }
  body.push("", FOOTER);
  return body.join("\n");
}

/**
 * Clock label for the DM header, in Asia/Kuala_Lumpur.
 */
export function formatWhenMyt(scheduledAt: Date): string {
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(scheduledAt);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(scheduledAt);
  const day = partValue(dateParts, "day");
  const month = partValue(dateParts, "month");
  const year = partValue(dateParts, "year");
  const hour = partValue(timeParts, "hour");
  const minute = partValue(timeParts, "minute");
  return `${day} ${month} ${year}, ${hour}:${minute} MYT`;
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  for (const part of parts) {
    if (part.type === type) {
      return part.value;
    }
  }
  return "";
}
