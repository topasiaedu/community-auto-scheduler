/**
 * Classifies WhatsApp / whatsmeow errors that are safe to soft-retry
 * (reset ScheduledMessage to PENDING) because they fail before a send ACK.
 */

/**
 * True when the error is a pre-send group metadata / info-query websocket drop.
 * Explicitly excludes "before message send returned" (duplicate risk if retried).
 */
export function isTransientWaDisconnectError(message: string): boolean {
  const lower = message.toLowerCase();

  if (lower.includes("before message send returned")) {
    return false;
  }

  if (lower.includes("failed to get group members")) {
    return true;
  }

  if (lower.includes("websocket disconnected before info query")) {
    return true;
  }

  if (lower.includes("disconnected") && lower.includes("info query returned response")) {
    return true;
  }

  return false;
}
