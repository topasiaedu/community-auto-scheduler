import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  editTelegramText,
  redactTelegramToken,
  sendTelegramText,
  type TelegramFetch,
} from "./telegramNotify.js";

const TOKEN = "7123456789:AAHxExampleToken";

describe("redactTelegramToken", () => {
  it("replaces the token wherever it appears", () => {
    const message = `boom https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const redacted = redactTelegramToken(message, TOKEN);
    assert.equal(redacted.includes(TOKEN), false);
    assert.match(redacted, /\[token\]/);
  });
});

describe("sendTelegramText", () => {
  it("returns ok and the message id when Telegram accepts the message", async () => {
    const fetchImpl: TelegramFetch = async (input) => {
      assert.equal(input.endsWith("/sendMessage"), true);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    };
    const result = await sendTelegramText(TOKEN, "-1001234567890", "hello", fetchImpl);
    assert.deepEqual(result, { ok: true, messageId: 42 });
  });

  it("returns a failure when Telegram accepts the call but omits message_id", async () => {
    const fetchImpl: TelegramFetch = async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const result = await sendTelegramText(TOKEN, "-1001234567890", "hello", fetchImpl);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "Telegram did not return a message id");
    }
  });

  it("returns a failure without the token when Telegram rejects the chat", async () => {
    const fetchImpl: TelegramFetch = async (input) => {
      assert.equal(input.includes(TOKEN), true);
      return new Response(JSON.stringify({ ok: false, description: "chat not found" }), {
        status: 400,
      });
    };
    const result = await sendTelegramText(TOKEN, "-1001234567890", "hello", fetchImpl);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "chat not found");
      assert.equal(result.error.includes(TOKEN), false);
    }
  });

  it("returns a failure without the token when the request throws", async () => {
    const fetchImpl: TelegramFetch = async () => {
      throw new Error(`network down for bot${TOKEN}`);
    };
    const result = await sendTelegramText(TOKEN, "-1", "hello", fetchImpl);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.includes(TOKEN), false);
      assert.match(result.error, /\[token\]/);
    }
  });

  it("does not call Telegram when the token is empty", async () => {
    let called = false;
    const fetchImpl: TelegramFetch = async () => {
      called = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const result = await sendTelegramText("  ", "-1", "hello", fetchImpl);
    assert.equal(called, false);
    assert.equal(result.ok, false);
  });
});

describe("editTelegramText", () => {
  it("posts editMessageText when Telegram accepts the edit", async () => {
    const fetchImpl: TelegramFetch = async (input, init) => {
      assert.equal(input.endsWith("/editMessageText"), true);
      const raw = init.body;
      assert.equal(typeof raw, "string");
      if (typeof raw !== "string") {
        throw new Error("expected a JSON body");
      }
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("expected a JSON object");
      }
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        body[key] = value;
      }
      assert.equal(body.chat_id, "-1001234567890");
      assert.equal(body.message_id, 42);
      assert.equal(body.text, "updated");
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    };
    const result = await editTelegramText(TOKEN, "-1001234567890", 42, "updated", fetchImpl);
    assert.deepEqual(result, { ok: true });
  });

  it("returns a failure without the token when Telegram rejects the edit", async () => {
    const fetchImpl: TelegramFetch = async () => {
      return new Response(
        JSON.stringify({ ok: false, description: `blocked ${TOKEN}` }),
        { status: 400 },
      );
    };
    const result = await editTelegramText(TOKEN, "-100", 9, "updated", fetchImpl);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.messageMissing, false);
      assert.equal(result.error.includes(TOKEN), false);
      assert.match(result.error, /\[token\]/);
    }
  });

  it("marks the message missing when Telegram cannot find it", async () => {
    const fetchImpl: TelegramFetch = async () => {
      return new Response(
        JSON.stringify({ ok: false, description: "Bad Request: message to edit not found" }),
        { status: 400 },
      );
    };
    const result = await editTelegramText(TOKEN, "-100", 9, "updated", fetchImpl);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.messageMissing, true);
    }
  });
});
