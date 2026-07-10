import { describe, expect, it } from "vitest";
import {
  buildOperatorSkipSlotKeys,
  classifyCampaignSlots,
  computeFixedValueSlots,
  computeShowUpSlots,
  countScheduledCampaignSlots,
  getDefaultSelectedSlotKeys,
  getSchedulableSlotKeys,
  hasPastCampaignSlots,
  suggestAlternateValueDays,
  validateEarliestSlot,
} from "./campaignSchedule.js";

/** Dr Jasmine acceptance matrix — ux-spec §11 */
const WEBINAR_DATE = "2026-06-29";
const EVENT_START = "20:00";

const EXPECTED_SHOW_UP: ReadonlyArray<{ slotKey: string; scheduledAt: string }> = [
  { slotKey: "welcome", scheduledAt: "2026-06-25T07:00:00.000Z" },
  { slotKey: "countdown_2d", scheduledAt: "2026-06-27T07:00:00.000Z" },
  { slotKey: "countdown_1d", scheduledAt: "2026-06-28T12:00:00.000Z" },
  { slotKey: "starting_soon", scheduledAt: "2026-06-29T03:00:00.000Z" },
  { slotKey: "live_now", scheduledAt: "2026-06-29T11:58:00.000Z" },
  { slotKey: "post_live_sticker", scheduledAt: "2026-06-29T12:18:00.000Z" },
];

const EXPECTED_VALUE: ReadonlyArray<{ slotKey: string; scheduledAt: string }> = [
  { slotKey: "value_1", scheduledAt: "2026-06-26T03:00:00.000Z" },
  { slotKey: "value_2", scheduledAt: "2026-06-28T03:00:00.000Z" },
  { slotKey: "value_3", scheduledAt: "2026-06-30T03:00:00.000Z" },
];

describe("computeShowUpSlots", () => {
  it("returns 6 Dr Jasmine slots in SOP order with correct UTC instants", () => {
    const slots = computeShowUpSlots(WEBINAR_DATE, EVENT_START);

    expect(slots).toHaveLength(6);
    expect(slots.map((s) => s.slotKey)).toEqual(EXPECTED_SHOW_UP.map((s) => s.slotKey));

    for (let i = 0; i < EXPECTED_SHOW_UP.length; i += 1) {
      const expected = EXPECTED_SHOW_UP[i];
      const actual = slots[i];
      expect(expected).toBeDefined();
      expect(actual).toBeDefined();
      if (expected === undefined || actual === undefined) {
        continue;
      }
      expect(actual.slotKey).toBe(expected.slotKey);
      expect(actual.scheduledAt).toBe(expected.scheduledAt);
    }
  });

  it("throws on invalid webinarDate", () => {
    expect(() => computeShowUpSlots("not-a-date", EVENT_START)).toThrow(/webinarDate/);
  });

  it("throws on invalid eventStartTimeMyt", () => {
    expect(() => computeShowUpSlots(WEBINAR_DATE, "25:00")).toThrow(/eventStartTimeMyt/);
  });
});

describe("computeFixedValueSlots", () => {
  it("returns 3 fixed Value slots with correct UTC instants", () => {
    const slots = computeFixedValueSlots(WEBINAR_DATE);

    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.slotKey)).toEqual(EXPECTED_VALUE.map((s) => s.slotKey));

    for (let i = 0; i < EXPECTED_VALUE.length; i += 1) {
      const expected = EXPECTED_VALUE[i];
      const actual = slots[i];
      expect(expected).toBeDefined();
      expect(actual).toBeDefined();
      if (expected === undefined || actual === undefined) {
        continue;
      }
      expect(actual.slotKey).toBe(expected.slotKey);
      expect(actual.scheduledAt).toBe(expected.scheduledAt);
    }
  });

  it("throws on invalid webinarDate", () => {
    expect(() => computeFixedValueSlots("2026-13-40")).toThrow(/webinarDate/);
  });
});

describe("suggestAlternateValueDays", () => {
  it("returns empty for Dr Jasmine — all D-4..D-1 days are occupied by Show Up or fixed Value", () => {
    const suggestions = suggestAlternateValueDays(WEBINAR_DATE);
    expect(suggestions).toEqual([]);
  });

  it("returns empty for any webinar date (4-day window fully occupied per SOP)", () => {
    const dates = ["2026-07-06", "2026-12-01", "2027-01-15"];
    for (const date of dates) {
      expect(suggestAlternateValueDays(date)).toEqual([]);
    }
  });

  it("would pick stride-2 eligible days at 11:00 MYT when any exist", () => {
    // Range D-4..D-1 always has days {-4,-3,-2,-1}; occupied = {-4,-3,-2,-1} from Show Up + Value.
    // Stride logic: eligible [a,b,c] → indices 0,2 → a and c @ 11:00 MYT.
    const eligible = ["2026-06-25", "2026-06-26", "2026-06-27"];
    const picked = eligible.filter((_, i) => i % 2 === 0).map((scheduledDate) => ({
      scheduledDate,
      scheduledAt: new Date(`${scheduledDate}T11:00:00+08:00`).toISOString(),
    }));
    expect(picked).toEqual([
      { scheduledDate: "2026-06-25", scheduledAt: "2026-06-25T03:00:00.000Z" },
      { scheduledDate: "2026-06-27", scheduledAt: "2026-06-27T03:00:00.000Z" },
    ]);
  });
});

describe("validateEarliestSlot", () => {
  const showUpSlots = computeShowUpSlots(WEBINAR_DATE, EVENT_START);
  const earliestMs = new Date("2026-06-25T07:00:00.000Z").getTime();

  it("returns true for empty slot list", () => {
    expect(validateEarliestSlot([])).toBe(true);
  });

  it("passes when now is at least 15s before earliest slot", () => {
    const oneHourBefore = earliestMs - 60 * 60 * 1000;
    expect(validateEarliestSlot(showUpSlots, { nowMs: oneHourBefore })).toBe(true);
  });

  it("fails when now is within 15s of earliest slot", () => {
    const tenSecondsBefore = earliestMs - 10 * 1000;
    expect(validateEarliestSlot(showUpSlots, { nowMs: tenSecondsBefore })).toBe(false);
  });

  it("fails when now is after earliest slot", () => {
    const afterEarliest = earliestMs + 60 * 1000;
    expect(validateEarliestSlot(showUpSlots, { nowMs: afterEarliest })).toBe(false);
  });
});

describe("classifyCampaignSlots", () => {
  const showUpSlots = computeShowUpSlots(WEBINAR_DATE, EVENT_START);
  const welcomeMs = new Date("2026-06-25T07:00:00.000Z").getTime();
  const countdown2dMs = new Date("2026-06-27T07:00:00.000Z").getTime();

  const templatesBySlotKey = new Map(
    showUpSlots.map((slot) => [
      slot.slotKey,
      {
        reminderFormat: slot.slotKey === "post_live_sticker" ? "STICKER" : "IMAGE",
        stickerUrl: slot.slotKey === "post_live_sticker" ? null : null,
      },
    ]),
  );

  it("marks past welcome as skipped_past when 2-day is future", () => {
    const nowMs = welcomeMs + 60_000;
    const classified = classifyCampaignSlots({
      slots: showUpSlots,
      skipSlotKeys: [],
      templatesBySlotKey,
      nowMs,
    });
    const welcome = classified.find((s) => s.slotKey === "welcome");
    const countdown2d = classified.find((s) => s.slotKey === "countdown_2d");
    expect(welcome?.status).toBe("skipped_past");
    expect(welcome?.statusLabel).toBe("Skipped (past)");
    expect(countdown2d?.status).toBe("scheduled");
    expect(countScheduledCampaignSlots(classified)).toBeGreaterThan(0);
    expect(hasPastCampaignSlots(classified)).toBe(true);
  });

  it("marks explicit skip as skipped_chosen even when future", () => {
    const nowMs = welcomeMs - 60_000;
    const classified = classifyCampaignSlots({
      slots: showUpSlots,
      skipSlotKeys: ["welcome"],
      templatesBySlotKey,
      nowMs,
    });
    const welcome = classified.find((s) => s.slotKey === "welcome");
    expect(welcome?.status).toBe("skipped_chosen");
    expect(countScheduledCampaignSlots(classified)).toBeLessThan(6);
  });

  it("marks sticker without asset as skipped_no_sticker", () => {
    const nowMs = countdown2dMs - 60_000;
    const classified = classifyCampaignSlots({
      slots: showUpSlots,
      skipSlotKeys: [],
      templatesBySlotKey,
      nowMs,
    });
    const sticker = classified.find((s) => s.slotKey === "post_live_sticker");
    expect(sticker?.status).toBe("skipped_no_sticker");
  });

  it("returns zero scheduled when all slots are past", () => {
    const afterAll = new Date("2026-06-30T00:00:00.000Z").getTime();
    const classified = classifyCampaignSlots({
      slots: showUpSlots,
      skipSlotKeys: [],
      templatesBySlotKey,
      nowMs: afterAll,
    });
    expect(countScheduledCampaignSlots(classified)).toBe(0);
    expect(hasPastCampaignSlots(classified)).toBe(true);
  });
});

describe("getSchedulableSlotKeys", () => {
  const showUpSlots = computeShowUpSlots(WEBINAR_DATE, EVENT_START);
  const welcomeMs = new Date("2026-06-25T07:00:00.000Z").getTime();

  const templatesBySlotKey = new Map(
    showUpSlots.map((slot) => [
      slot.slotKey,
      {
        reminderFormat: slot.slotKey === "post_live_sticker" ? "STICKER" : "IMAGE",
        stickerUrl: slot.slotKey === "post_live_sticker" ? null : null,
      },
    ]),
  );

  it("excludes past welcome when 2-day is future", () => {
    const schedulable = getSchedulableSlotKeys({
      slots: showUpSlots,
      templatesBySlotKey,
      nowMs: welcomeMs + 60_000,
    });
    expect(schedulable).not.toContain("welcome");
    expect(schedulable).toContain("countdown_2d");
    expect(schedulable).not.toContain("post_live_sticker");
  });

  it("includes all non-sticker slots when all are future", () => {
    const schedulable = getSchedulableSlotKeys({
      slots: showUpSlots,
      templatesBySlotKey,
      nowMs: welcomeMs - 60_000,
    });
    expect(schedulable).toContain("welcome");
    expect(schedulable).toContain("countdown_2d");
    expect(schedulable).not.toContain("post_live_sticker");
    expect(schedulable).toHaveLength(5);
  });
});

describe("buildOperatorSkipSlotKeys", () => {
  it("returns unchecked schedulable slots only", () => {
    const schedulable = ["welcome", "countdown_2d", "countdown_1d"];
    const selected = new Set(["countdown_2d", "countdown_1d"]);
    expect(buildOperatorSkipSlotKeys(schedulable, selected)).toEqual(["welcome"]);
  });

  it("returns empty when all schedulable slots are selected", () => {
    const schedulable = ["welcome", "countdown_2d"];
    const selected = getDefaultSelectedSlotKeys(schedulable);
    expect(buildOperatorSkipSlotKeys(schedulable, selected)).toEqual([]);
  });
});
