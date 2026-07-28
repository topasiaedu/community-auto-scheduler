import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEngagementChatAllowlist,
  countActiveReactions,
  extractQuotedWaMessageId,
  hasEncryptedReaction,
  isEngagementChatAllowed,
  isReactionRemoval,
  parseDecryptedReactionPayload,
  parsePlainReactionMessage,
  parseQuotedReplyEvent,
  truncateBodyPreview,
  waTimestampToDate,
} from "./waEngagement.js";

describe("waEngagement helpers", () => {
  it("buildEngagementChatAllowlist merges tracked group JIDs and active communities", () => {
    const set = buildEngagementChatAllowlist(
      ["  group-a@g.us  ", "", "group-b@g.us"],
      ["community-1@g.us", "  "],
    );
    assert.equal(set.has("group-a@g.us"), true);
    assert.equal(set.has("group-b@g.us"), true);
    assert.equal(set.has("community-1@g.us"), true);
    assert.equal(set.size, 3);
  });

  it("isEngagementChatAllowed rejects chats outside the allowlist", () => {
    const allow = buildEngagementChatAllowlist(["tracked@g.us"], null);
    assert.equal(isEngagementChatAllowed("tracked@g.us", allow), true);
    assert.equal(isEngagementChatAllowed("other@g.us", allow), false);
    assert.equal(isEngagementChatAllowed("  ", allow), false);
  });

  it("parsePlainReactionMessage extracts target id and emoji", () => {
    const parsed = parsePlainReactionMessage(
      {
        reactionMessage: {
          key: { id: "wa-out-1", remoteJid: "g@g.us", fromMe: true },
          text: "👍",
        },
      },
      "reaction-stanza-9",
    );
    assert.deepEqual(parsed, {
      targetWaMessageId: "wa-out-1",
      emoji: "👍",
      waReactionId: "reaction-stanza-9",
    });
  });

  it("parsePlainReactionMessage treats missing text as removal", () => {
    const parsed = parsePlainReactionMessage(
      {
        reactionMessage: {
          key: { id: "wa-out-2" },
        },
      },
      null,
    );
    assert.notEqual(parsed, null);
    if (parsed === null) {
      return;
    }
    assert.equal(parsed.emoji, "");
    assert.equal(isReactionRemoval(parsed.emoji), true);
  });

  it("parseDecryptedReactionPayload accepts flat decrypt shapes", () => {
    const parsed = parseDecryptedReactionPayload(
      {
        key: { id: "target-99" },
        text: "🔥",
      },
      "enc-rxn-1",
    );
    assert.deepEqual(parsed, {
      targetWaMessageId: "target-99",
      emoji: "🔥",
      waReactionId: "enc-rxn-1",
    });
  });

  it("hasEncryptedReaction detects encReactionMessage", () => {
    assert.equal(hasEncryptedReaction({ encReactionMessage: { data: "x" } }), true);
    assert.equal(hasEncryptedReaction({ reactionMessage: { key: { id: "a" } } }), false);
  });

  it("extractQuotedWaMessageId reads extendedTextMessage contextInfo", () => {
    const id = extractQuotedWaMessageId({
      extendedTextMessage: {
        text: "nice post",
        contextInfo: { stanzaId: "announcement-wa-id" },
      },
    });
    assert.equal(id, "announcement-wa-id");
  });

  it("parseQuotedReplyEvent ignores free-form chatter without a quote", () => {
    assert.equal(
      parseQuotedReplyEvent({ conversation: "hello everyone" }, "reply-1"),
      null,
    );
  });

  it("parseQuotedReplyEvent captures announcement quotes only", () => {
    const parsed = parseQuotedReplyEvent(
      {
        extendedTextMessage: {
          text: "Love this!",
          contextInfo: { stanzaId: "nmcas-wa-42" },
        },
      },
      "reply-77",
    );
    assert.deepEqual(parsed, {
      quotedWaMessageId: "nmcas-wa-42",
      replyWaMessageId: "reply-77",
      bodyPreview: "Love this!",
    });
  });

  it("parseQuotedReplyEvent skips reaction payloads", () => {
    assert.equal(
      parseQuotedReplyEvent(
        {
          reactionMessage: { key: { id: "x" }, text: "👍" },
        },
        "r1",
      ),
      null,
    );
  });

  it("truncateBodyPreview caps length", () => {
    const long = "a".repeat(400);
    const out = truncateBodyPreview(long);
    assert.notEqual(out, null);
    if (out === null) {
      return;
    }
    assert.equal(out.endsWith("…"), true);
    assert.equal(out.length, 281);
  });

  it("countActiveReactions ignores removals", () => {
    assert.equal(
      countActiveReactions([{ emoji: "👍" }, { emoji: "" }, { emoji: "  " }, { emoji: "❤️" }]),
      2,
    );
  });

  it("waTimestampToDate handles seconds and milliseconds", () => {
    const sec = waTimestampToDate(1_720_000_000);
    assert.equal(sec.getTime(), 1_720_000_000_000);
    const ms = waTimestampToDate(1_720_000_000_000);
    assert.equal(ms.getTime(), 1_720_000_000_000);
  });
});
