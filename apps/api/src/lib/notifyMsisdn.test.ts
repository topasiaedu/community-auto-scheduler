import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_NOTIFY_MSISDNS,
  extractValidMsisdns,
  resolveNotifyMsisdns,
  toWhatsAppUserJid,
} from "./notifyMsisdn.js";

describe("extractValidMsisdns", () => {
  it("returns empty for missing or blank input", () => {
    assert.deepEqual(extractValidMsisdns(undefined), []);
    assert.deepEqual(extractValidMsisdns(""), []);
    assert.deepEqual(extractValidMsisdns("   "), []);
  });

  it("accepts a plus-formatted Malaysian mobile number", () => {
    assert.deepEqual(extractValidMsisdns("+6017-678-2206"), ["60176782206"]);
  });

  it("splits comma, semicolon, and whitespace lists and dedupes", () => {
    assert.deepEqual(extractValidMsisdns("60139968817, +6017-678-2206; 60139968817"), [
      "60139968817",
      "60176782206",
    ]);
  });

  it("skips tokens that are too short, too long, or concatenated", () => {
    assert.deepEqual(extractValidMsisdns("12345, 6013996881760176782206, 60176782206"), [
      "60176782206",
    ]);
  });
});

describe("resolveNotifyMsisdns", () => {
  it("always includes the default ops numbers when env is unset", () => {
    assert.deepEqual(resolveNotifyMsisdns(undefined), [...DEFAULT_NOTIFY_MSISDNS]);
    assert.deepEqual(resolveNotifyMsisdns(""), [...DEFAULT_NOTIFY_MSISDNS]);
  });

  it("keeps defaults when env still has only the original single number", () => {
    assert.deepEqual(resolveNotifyMsisdns("60139968817"), [...DEFAULT_NOTIFY_MSISDNS]);
  });

  it("appends extra valid env numbers after the defaults", () => {
    const extra = "601112223333";
    assert.deepEqual(resolveNotifyMsisdns(extra), [...DEFAULT_NOTIFY_MSISDNS, extra]);
  });
});

describe("toWhatsAppUserJid", () => {
  it("builds a user JID from digits", () => {
    assert.equal(toWhatsAppUserJid("60176782206"), "60176782206@s.whatsapp.net");
  });
});
