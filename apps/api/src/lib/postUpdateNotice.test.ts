import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mytInstant } from "./campaignSchedule.js";
import {
  communityLabel,
  formatValuePostTelegram,
  isPostUpdateBatchReady,
  isValuePostBatch,
  formatPostUpdateNotice,
  type PostUpdateNoticeRow,
} from "./postUpdateNotice.js";

const VALUE_PREVIEW = "If you're ready to learn, reset, and take back control";

function row(overrides: Partial<PostUpdateNoticeRow> & Pick<PostUpdateNoticeRow, "groupName" | "status">): PostUpdateNoticeRow {
  return {
    error: null,
    copyText: null,
    operatorKind: "VALUE",
    valueFormat: "IMAGE_CAPTION",
    reminderFormat: null,
    slotName: null,
    scheduledAt: mytInstant("2026-10-09", "11:00"),
    projectName: "Dr Jasmine",
    legacyType: "POST",
    ...overrides,
  };
}

describe("formatPostUpdateNotice", () => {
  it("matches the approved Value fan-out message", () => {
    const text = formatPostUpdateNotice([
      row({
        groupName: "RDW 6.0",
        status: "SENT",
        copyText: `${VALUE_PREVIEW} — join us tomorrow.`,
      }),
      row({ groupName: "RDW 5.0", status: "SENT", copyText: VALUE_PREVIEW }),
      row({
        groupName: "RDW 4.0",
        status: "FAILED",
        error: "No WhatsApp server receipt for message id 3EB0…",
        copyText: VALUE_PREVIEW,
      }),
      row({ groupName: "RDW 3.0", status: "SENT", copyText: VALUE_PREVIEW }),
      row({
        groupName: "RDW 2.0",
        status: "FAILED",
        error: "WhatsApp engine exited",
        copyText: VALUE_PREVIEW,
      }),
      row({ groupName: "RDW", status: "SENT", copyText: VALUE_PREVIEW }),
    ]);
    assert.equal(
      text,
      [
        "[NMCAS] Post update — 9 Oct 2026, 11:00 MYT",
        "Project: Dr Jasmine",
        "Post: Value · image + caption",
        `Preview: ${VALUE_PREVIEW}…`,
        "",
        "Communities (6):",
        "• RDW 6.0 — Sent",
        "• RDW 5.0 — Sent",
        "• RDW 4.0 — Failed — No WhatsApp server receipt for message id 3EB0…",
        "• RDW 3.0 — Sent",
        "• RDW 2.0 — Failed — WhatsApp engine exited",
        "• RDW — Sent",
        "",
        "Sent means WhatsApp acknowledged the send. Open the community to confirm the post is on screen.",
      ].join("\n"),
    );
  });

  it("matches the approved single-community Starting Soon message", () => {
    const text = formatPostUpdateNotice([
      row({
        groupName: "RDW 6.0",
        status: "SENT",
        operatorKind: "REMINDER",
        valueFormat: null,
        reminderFormat: "IMAGE",
        slotName: "Starting Soon",
        copyText: "We're starting soon",
        scheduledAt: mytInstant("2026-10-08", "11:00"),
      }),
    ]);
    assert.equal(
      text,
      [
        "[NMCAS] Post update — 8 Oct 2026, 11:00 MYT",
        "Project: Dr Jasmine",
        "Post: Starting Soon",
        "Preview: We're starting soon…",
        "",
        "Communities (1):",
        "• RDW 6.0 — Sent",
        "",
        "Sent means WhatsApp acknowledged the send. Open the community to confirm the post is on screen.",
      ].join("\n"),
    );
  });

  it("omits the preview line for a sticker", () => {
    const text = formatPostUpdateNotice([
      row({
        groupName: "RDW 6.0",
        status: "SENT",
        operatorKind: "REMINDER",
        valueFormat: null,
        reminderFormat: "STICKER",
        slotName: "Post-Live Sticker",
        copyText: "should not appear",
        scheduledAt: mytInstant("2026-10-08", "20:18"),
      }),
    ]);
    assert.equal(text?.includes("Preview:"), false);
    assert.equal(text?.includes("Post: Post-Live Sticker"), true);
    assert.equal(text?.includes("• RDW 6.0 — Sent"), true);
  });

  it("returns null when every row is cancelled or draft", () => {
    const text = formatPostUpdateNotice([
      row({ groupName: "RDW 6.0", status: "CANCELLED" }),
      row({ groupName: "RDW 5.0", status: "DRAFT" }),
    ]);
    assert.equal(text, null);
  });

  it("keeps every Failed line and summarizes extra Sent lines when the body is too long", () => {
    const longName = "Community name ".repeat(12).trim();
    const rows: PostUpdateNoticeRow[] = [
      row({
        groupName: "RDW 4.0",
        status: "FAILED",
        error: "No WhatsApp server receipt for message id 3EB0…",
        copyText: VALUE_PREVIEW,
      }),
    ];
    for (let i = 0; i < 80; i += 1) {
      rows.push(row({ groupName: `${longName} ${String(i)}`, status: "SENT", copyText: VALUE_PREVIEW }));
    }
    const text = formatPostUpdateNotice(rows);
    assert.ok(text !== null);
    assert.equal(text.includes("• RDW 4.0 — Failed — No WhatsApp server receipt for message id 3EB0…"), true);
    assert.match(text, /… \+\d+ Sent/);
    assert.ok(text.length <= 3500);
  });

  it("uses the name before the community separator", () => {
    assert.equal(communityLabel("RDW 6.0 › RDW 6.0"), "RDW 6.0");
    assert.equal(communityLabel("RDW"), "RDW");
  });
});

describe("formatValuePostTelegram", () => {
  it("lists each community as Sent or Failed for the Telegram group", () => {
    const text = formatValuePostTelegram([
      row({
        groupName: "RDW 6.0 › RDW 6.0",
        status: "SENT",
        copyText: `${VALUE_PREVIEW} — join us tomorrow.`,
      }),
      row({
        groupName: "RDW 4.0",
        status: "FAILED",
        error: "WhatsApp engine exited",
        copyText: VALUE_PREVIEW,
      }),
    ]);
    assert.equal(
      text,
      [
        "Project: Dr Jasmine",
        "📢 Community Value",
        "9 Oct 2026, 11:00 MYT",
        "Post: Value · image + caption",
        `Preview: ${VALUE_PREVIEW}…`,
        "• RDW 6.0  🟢Sent",
        "• RDW 4.0  🔴Failed — WhatsApp engine exited",
        "",
        "Sent means WhatsApp acknowledged the send. Open the community to confirm the post is on screen.",
      ].join("\n"),
    );
  });

  it("returns null for a reminder batch", () => {
    const text = formatValuePostTelegram([
      row({
        groupName: "RDW 6.0",
        status: "SENT",
        operatorKind: "REMINDER",
        valueFormat: null,
        slotName: "Starting Soon",
      }),
    ]);
    assert.equal(text, null);
    assert.equal(isValuePostBatch([{ operatorKind: "REMINDER" }]), false);
    assert.equal(isValuePostBatch([{ operatorKind: "VALUE" }]), true);
  });

  it("returns null when every value row is cancelled or draft", () => {
    const text = formatValuePostTelegram([
      row({ groupName: "RDW 6.0", status: "CANCELLED" }),
      row({ groupName: "RDW 5.0", status: "DRAFT" }),
    ]);
    assert.equal(text, null);
  });

  it("keeps every Failed line when the body is too long", () => {
    const longName = "Community name ".repeat(12).trim();
    const rows: PostUpdateNoticeRow[] = [
      row({
        groupName: "RDW 4.0",
        status: "FAILED",
        error: "No WhatsApp server receipt",
        copyText: VALUE_PREVIEW,
      }),
    ];
    for (let i = 0; i < 80; i += 1) {
      rows.push(row({ groupName: `${longName} ${String(i)}`, status: "SENT", copyText: VALUE_PREVIEW }));
    }
    const text = formatValuePostTelegram(rows);
    assert.ok(text !== null);
    assert.equal(text.includes("• RDW 4.0  🔴Failed — No WhatsApp server receipt"), true);
    assert.match(text, /… \+\d+ Sent/);
    assert.ok(text.length <= 3500);
  });
});

describe("isPostUpdateBatchReady", () => {
  it("waits while a row is still sending and the settle deadline has not passed", () => {
    const scheduledAt = mytInstant("2026-10-09", "11:00");
    const ready = isPostUpdateBatchReady(
      [
        { status: "SENT", scheduledAt },
        { status: "SENDING", scheduledAt },
      ],
      scheduledAt.getTime() + 10_000,
      90_000,
    );
    assert.equal(ready, false);
  });

  it("is ready when every row is Sent or Failed", () => {
    const scheduledAt = mytInstant("2026-10-09", "11:00");
    const ready = isPostUpdateBatchReady(
      [
        { status: "SENT", scheduledAt },
        { status: "FAILED", scheduledAt },
        { status: "CANCELLED", scheduledAt },
      ],
      scheduledAt.getTime() - 60_000,
      90_000,
    );
    assert.equal(ready, true);
  });

  it("reports a still-open batch after the receipt timeout and buffer", () => {
    const scheduledAt = mytInstant("2026-10-09", "11:00");
    const ready = isPostUpdateBatchReady(
      [{ status: "SENDING", scheduledAt }],
      scheduledAt.getTime() + 90_000 + 30_000,
      90_000,
    );
    assert.equal(ready, true);
  });
});
