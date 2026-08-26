import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatClockMyt,
  formatDailyDigestText,
  formatDigestDateLabel,
  hourToHhmm,
  msUntilNextDigest,
  mytDayUtcRange,
  type DailyDigestSnapshot,
} from "./dailyDigest.js";
import { mytInstant } from "./campaignSchedule.js";

describe("mytDayUtcRange", () => {
  it("returns a half-open UTC range covering one MYT calendar day", () => {
    const { startUtc, endUtc } = mytDayUtcRange("2026-08-25");
    assert.equal(startUtc.toISOString(), "2026-08-24T16:00:00.000Z");
    assert.equal(endUtc.toISOString(), "2026-08-25T16:00:00.000Z");
  });
});

describe("hourToHhmm", () => {
  it("pads single-digit hours", () => {
    assert.equal(hourToHhmm(8), "08:00");
  });

  it("clamps out-of-range hours", () => {
    assert.equal(hourToHhmm(-1), "00:00");
    assert.equal(hourToHhmm(99), "23:00");
  });
});

describe("msUntilNextDigest", () => {
  it("schedules later the same day when before the hour", () => {
    const now = mytInstant("2026-08-25", "07:00");
    const delay = msUntilNextDigest(now, 8);
    assert.equal(delay, 60 * 60_000);
  });

  it("schedules tomorrow when the hour has passed", () => {
    const now = mytInstant("2026-08-25", "08:00");
    const delay = msUntilNextDigest(now, 8);
    assert.equal(delay, 24 * 60 * 60_000);
  });
});

describe("formatClockMyt / formatDigestDateLabel", () => {
  it("formats MYT clock from a UTC instant", () => {
    const d = mytInstant("2026-08-25", "15:30");
    assert.equal(formatClockMyt(d), "15:30");
  });

  it("formats a readable date label", () => {
    const label = formatDigestDateLabel("2026-08-25");
    assert.match(label, /25/);
    assert.match(label, /2026/);
  });
});

describe("formatDailyDigestText", () => {
  it("includes platform, WA, and message sections; empty day still lists none", () => {
    const snapshot: DailyDigestSnapshot = {
      dateYmd: "2026-08-25",
      memoryLine: "Memory: rss 100MB, heap 40/80MB, WA warm: 1",
      overduePending: 2,
      stuckSending: 1,
      failedLast24h: 3,
      waRows: [
        { projectName: "Default", state: "connected", sendReady: true },
        { projectName: "Other", state: "cold", sendReady: false },
      ],
      messages: [],
    };
    const text = formatDailyDigestText(snapshot);
    assert.match(text, /\[NMCAS\] Daily digest/);
    assert.match(text, /\*Platform\*/);
    assert.match(text, /Stuck\/overdue: PENDING 2, SENDING 1/);
    assert.match(text, /Failed \(last 24h\): 3/);
    assert.match(text, /\*WhatsApp\*/);
    assert.match(text, /Default: connected, send-ready/);
    assert.match(text, /Other: cold, not send-ready/);
    assert.match(text, /\*Today's messages\* \(0\)/);
    assert.match(text, /\(none scheduled\)/);
  });

  it("lists scheduled rows with clock, status, project, and slot", () => {
    const snapshot: DailyDigestSnapshot = {
      dateYmd: "2026-08-25",
      memoryLine: "Memory: rss 100MB, heap 40/80MB, WA warm: 1",
      overduePending: 0,
      stuckSending: 0,
      failedLast24h: 0,
      waRows: [{ projectName: "Default", state: "connected", sendReady: true }],
      messages: [
        {
          scheduledAt: mytInstant("2026-08-25", "11:00"),
          status: "PENDING",
          groupName: "Announcements",
          projectName: "Default",
          slotOrKind: "value_1",
        },
        {
          scheduledAt: mytInstant("2026-08-25", "15:00"),
          status: "CANCELLED",
          groupName: "Reminders",
          projectName: "Default",
          slotOrKind: "welcome",
        },
      ],
    };
    const text = formatDailyDigestText(snapshot);
    assert.match(text, /\*Today's messages\* \(2\)/);
    assert.match(text, /11:00 PENDING \| Default \| Announcements \| value_1/);
    assert.match(text, /15:00 CANCELLED \| Default \| Reminders \| welcome/);
  });
});
