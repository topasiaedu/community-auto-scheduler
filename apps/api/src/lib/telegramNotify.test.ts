import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
  it("returns ok when Telegram accepts the message", async () => {
    const fetchImpl: TelegramFetch = async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const result = await sendTelegramText(TOKEN, "-1001234567890", "hello", fetchImpl);
    assert.deepEqual(result, { ok: true });
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
