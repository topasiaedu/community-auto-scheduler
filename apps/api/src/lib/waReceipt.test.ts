import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_WA_RECEIPT_TIMEOUT_MS,
  buildNoReceiptErrorMessage,
  isPastReceiptDeadline,
  noReceiptTimeoutUpdateWhere,
  normalizeReceiptIds,
  receiptSentUpdateWhere,
} from "./waReceipt.js";

describe("waReceipt helpers", () => {
  it("normalizeReceiptIds trims, drops empties, and dedupes", () => {
    assert.deepEqual(normalizeReceiptIds(["  abc  ", "", "abc", "def", "  "]), ["abc", "def"]);
  });

  it("receiptSentUpdateWhere returns null for empty id lists", () => {
    assert.equal(receiptSentUpdateWhere([]), null);
    assert.equal(receiptSentUpdateWhere(["", "  "]), null);
  });

  it("receiptSentUpdateWhere scopes to SENDING + waMessageId in list", () => {
    assert.deepEqual(receiptSentUpdateWhere(["id-1", "id-2"]), {
      waMessageId: { in: ["id-1", "id-2"] },
      status: "SENDING",
    });
  });

  it("buildNoReceiptErrorMessage includes the message id and is not green-SENT copy", () => {
    const msg = buildNoReceiptErrorMessage("ABC123");
    assert.match(msg, /No WhatsApp server receipt for message id ABC123/);
    assert.match(msg, /Re-queue/i);
    assert.equal(msg.toLowerCase().includes("sent successfully"), false);
  });

  it("noReceiptTimeoutUpdateWhere requires id + waMessageId + SENDING", () => {
    assert.deepEqual(noReceiptTimeoutUpdateWhere("row-1", "wa-9"), {
      id: "row-1",
      waMessageId: "wa-9",
      status: "SENDING",
    });
  });

  it("isPastReceiptDeadline uses timeout from acceptedAt", () => {
    const accepted = new Date("2026-07-27T10:00:00.000Z");
    const timeout = DEFAULT_WA_RECEIPT_TIMEOUT_MS;
    const justBefore = accepted.getTime() + timeout - 1;
    const exactlyAt = accepted.getTime() + timeout;
    assert.equal(isPastReceiptDeadline(accepted, justBefore, timeout), false);
    assert.equal(isPastReceiptDeadline(accepted, exactlyAt, timeout), true);
  });
});
