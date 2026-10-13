import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mytInstant } from "./campaignSchedule.js";
import {
  appendReminderBoardLines,
  buildReminderBoardLine,
  collectReminderBoard,
  deliverReminderBoard,
  formatReminderStatusBoard,
  reminderAnnounceNotBeforeMs,
  reminderBatchIsCurrent,
  type ReminderBatchSourceRow,
  type ReminderBoardSlotInput,
} from "./reminderStatusBoard.js";
import type { TelegramFetch } from "./telegramNotify.js";

const TOKEN = "7123456789:AAHxExampleToken";
const CHAT = "-100123";

function slot(overrides: Partial<ReminderBoardSlotInput> & Pick<ReminderBoardSlotInput, "scheduledMessageId" | "slotKey" | "sortOrder" | "queueResult">): ReminderBoardSlotInput {
  return {
    scheduleRuleKind: "WEBINAR_DATE_OFFSET",
    dayOffset: -4,
    scheduledAt: mytInstant("2026-10-08", "15:00"),
    ...overrides,
  };
}

function source(overrides: Partial<ReminderBatchSourceRow> & Pick<ReminderBatchSourceRow, "id" | "status">): ReminderBatchSourceRow {
  return {
    campaignId: "camp-1",
    operatorKind: "REMINDER",
    scheduledAt: mytInstant("2026-10-08", "15:00"),
    projectName: "Dr Jasmine",
    slotKey: "welcome",
    sortOrder: 1,
    scheduleRuleKind: "WEBINAR_DATE_OFFSET",
    dayOffset: -4,
    ...overrides,
  };
}

describe("formatReminderStatusBoard", () => {
  it("renders Welcome at 3:00 PM as Sent", () => {
    const line = buildReminderBoardLine(
      slot({
        scheduledMessageId: "welcome-1",
        slotKey: "welcome",
        sortOrder: 1,
        queueResult: "SENT",
        dayOffset: -4,
        scheduledAt: mytInstant("2026-10-08", "15:00"),
      }),
    );
    const text = formatReminderStatusBoard("Dr Jasmine", [line]);
    assert.equal(
      text,
      [
        "Project: Dr Jasmine",
        "👥 Community Reminder",
        "01 Welcome — 4 days before · 3:00 PM  🟢Sent",
      ].join("\n"),
    );
    assert.equal(text.includes("Preview"), false);
    assert.equal(text.includes("No WhatsApp"), false);
  });

  it("marks an earlier Failed line as Sent when the next slot is added", () => {
    const welcome = buildReminderBoardLine(
      slot({
        scheduledMessageId: "welcome-1",
        slotKey: "welcome",
        sortOrder: 1,
        queueResult: "FAILED",
        dayOffset: -4,
        scheduledAt: mytInstant("2026-10-08", "15:00"),
      }),
    );
    const countdown = buildReminderBoardLine(
      slot({
        scheduledMessageId: "count-2",
        slotKey: "countdown_2d",
        sortOrder: 2,
        queueResult: "SENT",
        dayOffset: -2,
        scheduledAt: mytInstant("2026-10-10", "11:00"),
      }),
    );
    const text = formatReminderStatusBoard("Dr Jasmine", [welcome, countdown]);
    assert.equal(
      text,
      [
        "Project: Dr Jasmine",
        "👥 Community Reminder",
        "01 Welcome — 4 days before · 3:00 PM  🟢Sent",
        "02 2-Day Countdown — 2 days before · 11:00 AM  🟢Sent",
      ].join("\n"),
    );
    assert.equal(welcome.queueResult, "FAILED");
  });

  it("keeps Failed only on the newest line", () => {
    const welcome = buildReminderBoardLine(
      slot({
        scheduledMessageId: "welcome-1",
        slotKey: "welcome",
        sortOrder: 1,
        queueResult: "FAILED",
      }),
    );
    const countdown = buildReminderBoardLine(
      slot({
        scheduledMessageId: "count-2",
        slotKey: "countdown_2d",
        sortOrder: 2,
        queueResult: "FAILED",
        dayOffset: -2,
        scheduledAt: mytInstant("2026-10-10", "11:00"),
      }),
    );
    const text = formatReminderStatusBoard("Dr Jasmine", [welcome, countdown]);
    assert.equal(text.endsWith("02 2-Day Countdown — 2 days before · 11:00 AM  🔴Failed"), true);
    assert.equal(text.includes("01 Welcome — 4 days before · 3:00 PM  🟢Sent"), true);
    assert.equal(text.includes("receipt"), false);
  });

  it("leaves a gap when sort order 4 is omitted", () => {
    const oneDay = buildReminderBoardLine(
      slot({
        scheduledMessageId: "day-1",
        slotKey: "countdown_1d",
        sortOrder: 3,
        queueResult: "SENT",
        dayOffset: -1,
        scheduledAt: mytInstant("2026-10-11", "20:00"),
      }),
    );
    const oneHour = buildReminderBoardLine(
      slot({
        scheduledMessageId: "hour-1",
        slotKey: "countdown_1h",
        sortOrder: 5,
        queueResult: "SENT",
        scheduleRuleKind: "EVENT_START_OFFSET",
        dayOffset: null,
        scheduledAt: mytInstant("2026-10-12", "19:00"),
      }),
    );
    const text = formatReminderStatusBoard("Dr Jasmine", [oneHour, oneDay]);
    assert.equal(text.includes("03 1-Day Countdown — 1 day before · 8:00 PM  🟢Sent"), true);
    assert.equal(text.includes("05 1 Hour — Webinar day · 7:00 PM  🟢Sent"), true);
    assert.equal(text.includes("\n04 "), false);
    assert.equal(text.includes("Preview"), false);
  });

  it("renders a sticker slot with no preview line", () => {
    const sticker = buildReminderBoardLine(
      slot({
        scheduledMessageId: "sticker-1",
        slotKey: "post_live_sticker",
        sortOrder: 7,
        queueResult: "SENT",
        scheduleRuleKind: "EVENT_START_OFFSET",
        dayOffset: null,
        scheduledAt: mytInstant("2026-10-12", "20:16"),
      }),
    );
    const text = formatReminderStatusBoard("Dr Jasmine", [sticker]);
    assert.equal(text.includes("07 Post-Live Sticker — Webinar day · 8:16 PM  🟢Sent"), true);
    assert.equal(text.includes("Preview"), false);
  });
});

describe("appendReminderBoardLines", () => {
  it("does not rewrite a stored Failed result when the same slot is appended again", () => {
    const failed = buildReminderBoardLine(
      slot({
        scheduledMessageId: "welcome-1",
        slotKey: "welcome",
        sortOrder: 1,
        queueResult: "FAILED",
      }),
    );
    const resent = buildReminderBoardLine(
      slot({
        scheduledMessageId: "welcome-1",
        slotKey: "welcome",
        sortOrder: 1,
        queueResult: "SENT",
      }),
    );
    const next = appendReminderBoardLines([failed], [resent]);
    assert.equal(next.length, 1);
    const kept = next[0];
    assert.notEqual(kept, undefined);
    if (kept !== undefined) {
      assert.equal(kept.queueResult, "FAILED");
    }
  });
});

describe("reminderBatchIsCurrent", () => {
  it("skips a reminder that finished before this process started", () => {
    const startedAt = mytInstant("2026-10-12", "19:00").getTime();
    const notBefore = startedAt - 30 * 60 * 1000;
    const oldSlot = mytInstant("2026-10-08", "15:00");
    assert.equal(reminderBatchIsCurrent([oldSlot], notBefore), false);
  });

  it("announces a reminder scheduled after startup", () => {
    const startedAt = mytInstant("2026-10-12", "19:00").getTime();
    const notBefore = startedAt - 30 * 60 * 1000;
    const liveSlot = mytInstant("2026-10-12", "19:10");
    assert.equal(reminderBatchIsCurrent([liveSlot], notBefore), true);
  });
});

describe("reminderAnnounceNotBeforeMs", () => {
  it("keeps a reminder the sweep missed earlier the same day", () => {
    const startedAt = mytInstant("2026-10-13", "16:30").getTime();
    const nowMs = mytInstant("2026-10-13", "16:35").getTime();
    const notBefore = reminderAnnounceNotBeforeMs(startedAt, nowMs);
    const missed = mytInstant("2026-10-13", "15:23");
    assert.equal(reminderBatchIsCurrent([missed], notBefore), true);
  });

  it("still skips a reminder from a previous day after restart", () => {
    const startedAt = mytInstant("2026-10-13", "16:30").getTime();
    const nowMs = mytInstant("2026-10-13", "16:35").getTime();
    const notBefore = reminderAnnounceNotBeforeMs(startedAt, nowMs);
    const oldSlot = mytInstant("2026-10-05", "20:00");
    assert.equal(reminderBatchIsCurrent([oldSlot], notBefore), false);
  });
});

describe("collectReminderBoard", () => {
  it("returns null for a Value batch so no Telegram board is built", () => {
    const collected = collectReminderBoard([
      source({
        id: "value-1",
        status: "SENT",
        operatorKind: "VALUE",
        campaignId: null,
        slotKey: null,
        sortOrder: null,
        scheduleRuleKind: null,
        dayOffset: null,
      }),
    ]);
    assert.equal(collected, null);
  });

  it("collects a settled reminder slot", () => {
    const collected = collectReminderBoard([
      source({ id: "welcome-1", status: "FAILED" }),
    ]);
    assert.notEqual(collected, null);
    if (collected !== null) {
      assert.equal(collected.campaignId, "camp-1");
      assert.equal(collected.slots.length, 1);
      const first = collected.slots[0];
      if (first !== undefined) {
        assert.equal(first.queueResult, "FAILED");
      }
    }
  });
});

describe("deliverReminderBoard", () => {
  it("sends the first line and returns the message id", async () => {
    const calls: string[] = [];
    const fetchImpl: TelegramFetch = async (input) => {
      calls.push(input);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 15 } }), { status: 200 });
    };
    const result = await deliverReminderBoard({
      token: TOKEN,
      chatId: CHAT,
      projectName: "Dr Jasmine",
      board: null,
      slots: [
        slot({
          scheduledMessageId: "welcome-1",
          slotKey: "welcome",
          sortOrder: 1,
          queueResult: "FAILED",
        }),
      ],
      fetchImpl,
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.endsWith("/sendMessage"), true);
    if (result.ok) {
      assert.equal(result.telegramCalled, true);
      assert.equal(result.next.messageId, 15);
      assert.equal(result.text.endsWith("🔴Failed"), true);
    }
  });

  it("edits the same message and shows the previous line as Sent", async () => {
    const bodies: string[] = [];
    const fetchImpl: TelegramFetch = async (input, init) => {
      assert.equal(input.endsWith("/editMessageText"), true);
      const raw = init.body;
      if (typeof raw !== "string") {
        throw new Error("expected a JSON body");
      }
      bodies.push(raw);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 15 } }), { status: 200 });
    };
    const welcome = buildReminderBoardLine(
      slot({
        scheduledMessageId: "welcome-1",
        slotKey: "welcome",
        sortOrder: 1,
        queueResult: "FAILED",
      }),
    );
    const result = await deliverReminderBoard({
      token: TOKEN,
      chatId: CHAT,
      projectName: "Dr Jasmine",
      board: { chatId: CHAT, messageId: 15, lines: [welcome] },
      slots: [
        slot({
          scheduledMessageId: "count-2",
          slotKey: "countdown_2d",
          sortOrder: 2,
          queueResult: "SENT",
          dayOffset: -2,
          scheduledAt: mytInstant("2026-10-10", "11:00"),
        }),
      ],
      fetchImpl,
    });
    assert.equal(result.ok, true);
    assert.equal(bodies.length, 1);
    const rawBody = bodies[0];
    assert.equal(typeof rawBody, "string");
    if (typeof rawBody === "string") {
      assert.equal(rawBody.includes("01 Welcome — 4 days before · 3:00 PM  🟢Sent"), true);
      assert.equal(rawBody.includes("02 2-Day Countdown — 2 days before · 11:00 AM  🟢Sent"), true);
      assert.equal(rawBody.includes("🔴Failed"), false);
    }
    if (result.ok) {
      const storedWelcome = result.next.lines[0];
      if (storedWelcome !== undefined) {
        assert.equal(storedWelcome.queueResult, "FAILED");
      }
    }
  });

  it("sends a new message when the old one cannot be edited", async () => {
    const methods: string[] = [];
    const fetchImpl: TelegramFetch = async (input) => {
      methods.push(input.endsWith("/editMessageText") ? "edit" : "send");
      if (input.endsWith("/editMessageText")) {
        return new Response(
          JSON.stringify({ ok: false, description: "Bad Request: message to edit not found" }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 88 } }), { status: 200 });
    };
    const welcome = buildReminderBoardLine(
      slot({
        scheduledMessageId: "welcome-1",
        slotKey: "welcome",
        sortOrder: 1,
        queueResult: "SENT",
      }),
    );
    const result = await deliverReminderBoard({
      token: TOKEN,
      chatId: CHAT,
      projectName: "Dr Jasmine",
      board: { chatId: CHAT, messageId: 15, lines: [welcome] },
      slots: [
        slot({
          scheduledMessageId: "count-2",
          slotKey: "countdown_2d",
          sortOrder: 2,
          queueResult: "SENT",
          dayOffset: -2,
          scheduledAt: mytInstant("2026-10-10", "11:00"),
        }),
      ],
      fetchImpl,
    });
    assert.deepEqual(methods, ["edit", "send"]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.next.messageId, 88);
    }
  });

  it("does not call Telegram when the slot is already stored", async () => {
    let called = false;
    const fetchImpl: TelegramFetch = async () => {
      called = true;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 15 } }), { status: 200 });
    };
    const welcome = buildReminderBoardLine(
      slot({
        scheduledMessageId: "welcome-1",
        slotKey: "welcome",
        sortOrder: 1,
        queueResult: "FAILED",
      }),
    );
    const result = await deliverReminderBoard({
      token: TOKEN,
      chatId: CHAT,
      projectName: "Dr Jasmine",
      board: { chatId: CHAT, messageId: 15, lines: [welcome] },
      slots: [
        slot({
          scheduledMessageId: "welcome-1",
          slotKey: "welcome",
          sortOrder: 1,
          queueResult: "SENT",
        }),
      ],
      fetchImpl,
    });
    assert.equal(called, false);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.telegramCalled, false);
      assert.equal(result.text.endsWith("🔴Failed"), true);
    }
  });

  it("does not call Telegram when the token is empty", async () => {
    let called = false;
    const fetchImpl: TelegramFetch = async () => {
      called = true;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    };
    const result = await deliverReminderBoard({
      token: " ",
      chatId: CHAT,
      projectName: "Dr Jasmine",
      board: null,
      slots: [
        slot({
          scheduledMessageId: "welcome-1",
          slotKey: "welcome",
          sortOrder: 1,
          queueResult: "SENT",
        }),
      ],
      fetchImpl,
    });
    assert.equal(called, false);
    assert.equal(result.ok, false);
  });
});
