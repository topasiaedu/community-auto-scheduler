import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWhatsAppText } from "./whatsappTextFormat.js";

describe("normalizeWhatsAppText", () => {
  it("leaves plain text unchanged", () => {
    assert.equal(normalizeWhatsAppText("Hello world"), "Hello world");
  });

  it("converts Markdown bold to WhatsApp bold", () => {
    assert.equal(normalizeWhatsAppText("See **important** now"), "See *important* now");
  });

  it("leaves existing WhatsApp bold unchanged", () => {
    assert.equal(normalizeWhatsAppText("See *important* now"), "See *important* now");
  });

  it("converts multiple Markdown bold spans", () => {
    assert.equal(
      normalizeWhatsAppText("**A** and **B**"),
      "*A* and *B*",
    );
  });

  it("does not convert across newlines", () => {
    assert.equal(normalizeWhatsAppText("**line\nbreak**"), "**line\nbreak**");
  });
});
