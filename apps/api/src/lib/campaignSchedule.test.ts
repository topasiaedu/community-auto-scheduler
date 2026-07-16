import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMytCalendarDays,
  computeOptionalValueTime,
  computeReminderSlotTime,
  computeValueSlotTime,
  earliestCampaignSlotTime,
  formatUtcAsMytIso,
  mytInstant,
} from "./campaignSchedule.js";

const WEBINAR = "2026-06-29";
const EVENT_START = "20:00";

describe("campaignSchedule", () => {
  it("addMytCalendarDays offsets correctly", () => {
    assert.equal(addMytCalendarDays(WEBINAR, -4), "2026-06-25");
    assert.equal(addMytCalendarDays(WEBINAR, 1), "2026-06-30");
  });

  it("acceptance matrix reminder times (ux-spec §11)", () => {
    const welcome = computeReminderSlotTime(
      { scheduleRuleKind: "WEBINAR_DATE_OFFSET", dayOffset: -4, clockTimeMyt: "15:00", startOffsetMinutes: null },
      WEBINAR,
      EVENT_START,
    );
    assert.equal(formatUtcAsMytIso(welcome), "2026-06-25T15:00:00");

    const countdown2d = computeReminderSlotTime(
      { scheduleRuleKind: "WEBINAR_DATE_OFFSET", dayOffset: -2, clockTimeMyt: "15:00", startOffsetMinutes: null },
      WEBINAR,
      EVENT_START,
    );
    assert.equal(formatUtcAsMytIso(countdown2d), "2026-06-27T15:00:00");

    const countdown1d = computeReminderSlotTime(
      { scheduleRuleKind: "WEBINAR_DATE_OFFSET", dayOffset: -1, clockTimeMyt: "20:00", startOffsetMinutes: null },
      WEBINAR,
      EVENT_START,
    );
    assert.equal(formatUtcAsMytIso(countdown1d), "2026-06-28T20:00:00");

    const startingSoon = computeReminderSlotTime(
      { scheduleRuleKind: "WEBINAR_DATE_OFFSET", dayOffset: 0, clockTimeMyt: "11:00", startOffsetMinutes: null },
      WEBINAR,
      EVENT_START,
    );
    assert.equal(formatUtcAsMytIso(startingSoon), "2026-06-29T11:00:00");

    const countdown1h = computeReminderSlotTime(
      { scheduleRuleKind: "EVENT_START_OFFSET", dayOffset: null, clockTimeMyt: null, startOffsetMinutes: -60 },
      WEBINAR,
      EVENT_START,
    );
    assert.equal(formatUtcAsMytIso(countdown1h), "2026-06-29T19:00:00");

    const liveNow = computeReminderSlotTime(
      { scheduleRuleKind: "EVENT_START_OFFSET", dayOffset: null, clockTimeMyt: null, startOffsetMinutes: -2 },
      WEBINAR,
      EVENT_START,
    );
    assert.equal(formatUtcAsMytIso(liveNow), "2026-06-29T19:58:00");

    const sticker = computeReminderSlotTime(
      { scheduleRuleKind: "EVENT_START_OFFSET", dayOffset: null, clockTimeMyt: null, startOffsetMinutes: 18 },
      WEBINAR,
      EVENT_START,
    );
    assert.equal(formatUtcAsMytIso(sticker), "2026-06-29T20:18:00");
  });

  it("value post fixed slots @ 11:00 MYT", () => {
    assert.equal(formatUtcAsMytIso(computeValueSlotTime("value_1", WEBINAR)), "2026-06-26T11:00:00");
    assert.equal(formatUtcAsMytIso(computeValueSlotTime("value_2", WEBINAR)), "2026-06-28T11:00:00");
    assert.equal(formatUtcAsMytIso(computeValueSlotTime("value_3", WEBINAR)), "2026-06-30T11:00:00");
  });

  it("optional value post uses scheduled date @ 11:00", () => {
    const t = computeOptionalValueTime("2026-06-25");
    assert.equal(formatUtcAsMytIso(t), "2026-06-25T11:00:00");
  });

  it("earliest slot is Welcome −4d @ 15:00", () => {
    const t = earliestCampaignSlotTime(WEBINAR);
    assert.equal(formatUtcAsMytIso(t), "2026-06-25T15:00:00");
  });

  it("mytInstant parses HH:mm", () => {
    const d = mytInstant("2026-06-29", "20:00");
    assert.equal(formatUtcAsMytIso(d), "2026-06-29T20:00:00");
  });
});
