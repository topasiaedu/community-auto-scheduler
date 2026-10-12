/**
 * Outbound Telegram Bot API. NMCAS sends text and can edit a text message it already sent.
 * It does not open a webhook. The bot token is a secret: it may appear in the request URL, and nowhere else.
 */

/** How long one sendMessage call may take before it is treated as a failure. */
const TELEGRAM_SEND_TIMEOUT_MS = 15_000;

/** Caller-supplied fetch so tests can avoid the network. */
export type TelegramFetch = (input: string, init: RequestInit) => Promise<Response>;

export type TelegramSendResult =
  | { ok: true; messageId: number }
  | { ok: false; error: string };

export type TelegramEditResult =
  | { ok: true }
  | { ok: false; error: string; messageMissing: boolean };

type TelegramPayload = Record<string, string | number>;

/**
 * True for a plain JSON object. Used to read Telegram's `{ ok, description }` body.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type TelegramBody = {
  ok: boolean;
  detail: string;
  messageId: number | null;
};

/**
 * Reads Telegram's JSON body. `ok` is true only when the payload says so.
 * `detail` is the human-readable description, or a short slice of a non-JSON body.
 * `messageId` is `result.message_id` when Telegram returned a positive integer.
 */
function readTelegramBody(body: string): TelegramBody {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) {
      return { ok: false, detail: body.slice(0, 200), messageId: null };
    }
    const description = typeof parsed.description === "string" ? parsed.description : "";
    return { ok: parsed.ok === true, detail: description, messageId: readMessageId(parsed) };
  } catch {
    return { ok: false, detail: body.slice(0, 200), messageId: null };
  }
}

/**
 * Reads `result.message_id` when it is a positive integer.
 */
function readMessageId(parsed: Record<string, unknown>): number | null {
  const result = parsed.result;
  if (!isRecord(result)) {
    return null;
  }
  const id = result.message_id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

/**
 * True when an edit failed because that message is gone or cannot be edited.
 * The caller should send a new message instead of retrying the same id.
 */
export function telegramEditTargetMissing(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("message to edit not found") ||
    lower.includes("message to be edited not found") ||
    lower.includes("message_id_invalid") ||
    lower.includes("message can't be edited")
  );
}

/**
 * Removes the bot token if a URL or error message echoed it.
 */
export function redactTelegramToken(message: string, token: string): string {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return message;
  }
  return message.split(trimmed).join("[token]");
}

/**
 * Posts one text message to a Telegram chat.
 * Network errors and Telegram's `{ ok: false }` both return `{ ok: false }` so the caller can retry.
 * This function does not throw for those failures.
 * Success includes `message_id` so a later edit can target the same message.
 */
export async function sendTelegramText(
  token: string,
  chatId: string,
  text: string,
  fetchImpl: TelegramFetch = fetch,
): Promise<TelegramSendResult> {
  const posted = await postTelegramMethod(
    token,
    "sendMessage",
    { chat_id: chatId.trim(), text: text.trim() },
    fetchImpl,
  );
  if (!posted.ok) {
    return posted;
  }
  if (posted.messageId === null) {
    return { ok: false, error: "Telegram did not return a message id" };
  }
  return { ok: true, messageId: posted.messageId };
}

/**
 * Replaces the text of a message this bot already sent.
 * `messageMissing` is true when Telegram no longer has that message, so the caller can send a new one.
 * This function does not throw for network or Telegram failures.
 */
export async function editTelegramText(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
  fetchImpl: TelegramFetch = fetch,
): Promise<TelegramEditResult> {
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return { ok: false, error: "Telegram message id is invalid", messageMissing: true };
  }
  const posted = await postTelegramMethod(
    token,
    "editMessageText",
    { chat_id: chatId.trim(), message_id: messageId, text: text.trim() },
    fetchImpl,
  );
  if (!posted.ok) {
    return {
      ok: false,
      error: posted.error,
      messageMissing: telegramEditTargetMissing(posted.error),
    };
  }
  return { ok: true };
}

type PostTelegramResult =
  | { ok: true; messageId: number | null }
  | { ok: false; error: string };

/**
 * Posts one Bot API method. Shared by send and edit so timeout and token redaction stay the same.
 */
async function postTelegramMethod(
  token: string,
  method: "sendMessage" | "editMessageText",
  payload: TelegramPayload,
  fetchImpl: TelegramFetch,
): Promise<PostTelegramResult> {
  const trimmedToken = token.trim();
  const chatId = payload.chat_id;
  const text = payload.text;
  if (trimmedToken.length === 0 || typeof chatId !== "string" || chatId.trim().length === 0) {
    return { ok: false, error: "Telegram token or chat id is empty" };
  }
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "Telegram text is empty" };
  }

  const url = `https://api.telegram.org/bot${trimmedToken}/${method}`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEGRAM_SEND_TIMEOUT_MS),
    });
    const body = await response.text();
    const parsed = readTelegramBody(body);
    if (response.ok && parsed.ok) {
      return { ok: true, messageId: parsed.messageId };
    }
    const detail = parsed.detail.length > 0 ? parsed.detail : `HTTP ${String(response.status)}`;
    return { ok: false, error: redactTelegramToken(detail, trimmedToken) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Telegram request failed";
    return { ok: false, error: redactTelegramToken(message, trimmedToken) };
  }
}
