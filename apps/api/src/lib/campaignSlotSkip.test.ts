import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPAIGN_MIN_LEAD_MS,
  classifyReminderSlot,
  shouldScheduleReminderSlot,
  stickerHasAsset,
} from "./campaignSlotSkip.js";

const NOW_MS = Date.parse("2026-06-28T12:00:00.000Z");

const imageTemplate = {
  slotKey: "welcome",
  reminderFormat: "IMAGE" as const,
  stickerUrl: null,
};

const stickerTemplate = {
  slotKey: "post_live_sticker",
  reminderFormat: "STICKER" as const,
  stickerUrl: null,
};

const stickerWithAsset = {
  ...stickerTemplate,
  stickerUrl: "stickers/test.webp",
};

describe("campaignSlotSkip", () => {
  it("stickerHasAsset is false without stickerUrl", () => {
    assert.equal(stickerHasAsset(stickerTemplate), false);
    assert.equal(stickerHasAsset(stickerWithAsset), true);
    assert.equal(stickerHasAsset(imageTemplate), true);
  });

  it("schedules future non-skipped slots", () => {
    const futureAt = new Date(NOW_MS + CAMPAIGN_MIN_LEAD_MS + 60_000);
    const decision = classifyReminderSlot({
      template: imageTemplate,
      scheduledAt: futureAt,
      nowMs: NOW_MS,
      skipSlotKeys: new Set(),
    });
    assert.equal(decision.schedule, true);
    assert.equal(shouldScheduleReminderSlot({
      template: imageTemplate,
      scheduledAt: futureAt,
      nowMs: NOW_MS,
      skipSlotKeys: new Set(),
    }), true);
  });

  it("skips past slots with reason past", () => {
    const pastAt = new Date(NOW_MS - 60_000);
    const decision = classifyReminderSlot({
      template: imageTemplate,
      scheduledAt: pastAt,
      nowMs: NOW_MS,
      skipSlotKeys: new Set(),
    });
    assert.deepEqual(decision, { schedule: false, reason: "past" });
  });

  it("skips explicit skipSlotKeys with reason skipped (over past)", () => {
    const pastAt = new Date(NOW_MS - 60_000);
    const decision = classifyReminderSlot({
      template: imageTemplate,
      scheduledAt: pastAt,
      nowMs: NOW_MS,
      skipSlotKeys: new Set(["welcome"]),
    });
    assert.deepEqual(decision, { schedule: false, reason: "skipped" });
  });

  it("skips sticker without asset with reason no_asset", () => {
    const futureAt = new Date(NOW_MS + CAMPAIGN_MIN_LEAD_MS + 60_000);
    const decision = classifyReminderSlot({
      template: stickerTemplate,
      scheduledAt: futureAt,
      nowMs: NOW_MS,
      skipSlotKeys: new Set(),
    });
    assert.deepEqual(decision, { schedule: false, reason: "no_asset" });
  });

  it("skips past sticker even when asset exists", () => {
    const pastAt = new Date(NOW_MS - 60_000);
    const decision = classifyReminderSlot({
      template: stickerWithAsset,
      scheduledAt: pastAt,
      nowMs: NOW_MS,
      skipSlotKeys: new Set(),
    });
    assert.deepEqual(decision, { schedule: false, reason: "past" });
  });
});
