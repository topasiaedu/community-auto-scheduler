/**
 * Outbound Telegram Bot API. NMCAS only sends text. It does not open a webhook.
 * The bot token is a secret: it may appear in the request URL, and nowhere else.
 */

/** How long one sendMessage call may take before it is treated as a failure. */
const TELEGRAM_SEND_TIMEOUT_MS = 15_000;

/** Caller-supplied fetch so tests can avoid the network. */
export type TelegramFetch = (input: string, init: RequestInit) => Promise<Response>;

export type TelegramSendResult = { ok: true } | { ok: false; error: string };

/**
 * True for a plain JSON object. Used to read Telegram's `{ ok, description }` body.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads Telegram's JSON body. `ok` is true only when the payload says so.
 * `detail` is the human-readable description, or a short slice of a non-JSON body.
 */
function readTelegramBody(body: string): { ok: boolean; detail: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) {
      return { ok: false, detail: body.slice(0, 200) };
    }
    const description = typeof parsed.description === "string" ? parsed.description : "";
    return { ok: parsed.ok === true, detail: description };
  } catch {
    return { ok: false, detail: body.slice(0, 200) };
  }
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
 */
export async function sendTelegramText(
  token: string,
  chatId: string,
  text: string,
  fetchImpl: TelegramFetch = fetch,
): Promise<TelegramSendResult> {
  const trimmedToken = token.trim();
  const trimmedChatId = chatId.trim();
  const trimmedText = text.trim();
  if (trimmedToken.length === 0 || trimmedChatId.length === 0) {
    return { ok: false, error: "Telegram token or chat id is empty" };
  }
  if (trimmedText.length === 0) {
    return { ok: false, error: "Telegram text is empty" };
  }

  const url = `https://api.telegram.org/bot${trimmedToken}/sendMessage`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: trimmedChatId,
        text: trimmedText,
      }),
      signal: AbortSignal.timeout(TELEGRAM_SEND_TIMEOUT_MS),
    });
    const body = await response.text();
    const parsed = readTelegramBody(body);
    if (response.ok && parsed.ok) {
      return { ok: true };
    }
    const detail = parsed.detail.length > 0 ? parsed.detail : `HTTP ${String(response.status)}`;
    return { ok: false, error: redactTelegramToken(detail, trimmedToken) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Telegram request failed";
    return { ok: false, error: redactTelegramToken(message, trimmedToken) };
  }
}
