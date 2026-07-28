/**
 * Pure helpers for receipt-gated SENT (WhatsApp message id matching + timeout copy).
 *
 * Status model: keep `SENDING` after IPC accept (with `waMessageId` stored) until
 * `message:receipt` matches → `SENT`. No new enum value.
 *
 * Timeouts (do not confuse):
 * - IPC send timeout (120s in worker): Promise never resolves → FAILED
 *   "may already have been delivered"
 * - Receipt timeout (default 90s, starts only after IPC OK + id stored): no
 *   `message:receipt` → FAILED "No WhatsApp server receipt for message id …"
 */

/** Default wait after IPC accept before marking FAILED for missing server receipt. */
export const DEFAULT_WA_RECEIPT_TIMEOUT_MS = 90_000;

/**
 * Builds the operator-facing error when IPC accepted a send but no server receipt arrived.
 */
export function buildNoReceiptErrorMessage(waMessageId: string): string {
  const id = waMessageId.trim();
  return [
    `No WhatsApp server receipt for message id ${id}.`,
    "The message may not be visible in the group — check WhatsApp and use Re-queue if needed.",
  ].join(" ");
}

/**
 * Filters receipt id lists to non-empty trimmed strings (ignore blanks / unknown noise).
 */
export function normalizeReceiptIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== "string") {
      continue;
    }
    const id = raw.trim();
    if (id.length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Prisma `where` fragment for marking rows SENT from a receipt event.
 * Only pre-SENT rows (`SENDING`) with a matching stored `waMessageId` are updated.
 */
export function receiptSentUpdateWhere(waMessageIds: readonly string[]): {
  waMessageId: { in: string[] };
  status: "SENDING";
} | null {
  const ids = normalizeReceiptIds(waMessageIds);
  if (ids.length === 0) {
    return null;
  }
  return {
    waMessageId: { in: ids },
    status: "SENDING",
  };
}

/**
 * Prisma `where` for failing a single row when its receipt timeout fires.
 * Idempotent: no-op if already SENT / FAILED / cancelled.
 */
export function noReceiptTimeoutUpdateWhere(
  scheduledMessageId: string,
  waMessageId: string,
): {
  id: string;
  waMessageId: string;
  status: "SENDING";
} {
  return {
    id: scheduledMessageId,
    waMessageId,
    status: "SENDING",
  };
}

/**
 * True when a stale-sweep candidate is past the receipt deadline.
 */
export function isPastReceiptDeadline(
  waAcceptedAt: Date,
  nowMs: number,
  timeoutMs: number,
): boolean {
  const acceptedMs = waAcceptedAt.getTime();
  if (!Number.isFinite(acceptedMs)) {
    return false;
  }
  const safeTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_WA_RECEIPT_TIMEOUT_MS;
  return acceptedMs + safeTimeout <= nowMs;
}
