import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CampaignCustomValues } from "./campaignTypes.js";
import { hasUnresolvedPlaceholders, mergeTemplate } from "./mergeTemplate.js";

const sampleValues: CampaignCustomValues = {
  workshopDay: "Monday",
  workshopDate: "29/6",
  workshopTime: "8PM (GMT +8)",
  zoomLink: "https://drjasminechiew.com/zoom",
  sessionDate: "Jun 29, 2026",
  sessionTime: "8:00PM – 10:00PM (GMT+8)",
  zoomId: "819 5208 2119",
  zoomPasscode: "8888",
};

describe("mergeTemplate", () => {
  it("substitutes all known placeholders", () => {
    const template = [
      "{{workshopDay}} {{workshopDate}} @ {{workshopTime}}",
      "Join: {{zoomLink}}",
      "{{sessionDate}} {{sessionTime}}",
      "ID {{zoomId}} pass {{zoomPasscode}}",
    ].join("\n");
    const merged = mergeTemplate(sampleValues, template);
    assert.ok(merged.includes("Monday"));
    assert.ok(merged.includes("https://drjasminechiew.com/zoom"));
    assert.ok(merged.includes("819 5208 2119"));
    assert.ok(!merged.includes("{{workshopDay}}"));
  });

  it("leaves unknown placeholders unchanged", () => {
    const merged = mergeTemplate(sampleValues, "Hello {{unknownKey}}");
    assert.equal(merged, "Hello {{unknownKey}}");
  });

  it("handles empty string values", () => {
    const values: CampaignCustomValues = { ...sampleValues, workshopDay: "" };
    const merged = mergeTemplate(values, "Day: {{workshopDay}}");
    assert.equal(merged, "Day: ");
  });

  it("replaces multiple occurrences of the same key", () => {
    const merged = mergeTemplate(sampleValues, "{{zoomLink}} and again {{zoomLink}}");
    assert.equal(
      merged,
      "https://drjasminechiew.com/zoom and again https://drjasminechiew.com/zoom",
    );
  });

  it("preserves emoji and newlines", () => {
    const template = "Hi! 🎉\n\n{{workshopDay}}";
    const merged = mergeTemplate(sampleValues, template);
    assert.equal(merged, "Hi! 🎉\n\nMonday");
  });
});

describe("hasUnresolvedPlaceholders", () => {
  it("detects unresolved placeholders", () => {
    assert.equal(hasUnresolvedPlaceholders("{{foo}}"), true);
    assert.equal(hasUnresolvedPlaceholders("done"), false);
  });
});
