import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEngagementChatAllowlist,
  buildReactionBreakdown,
  countActiveReactions,
  extractQuotedWaMessageId,
  hasEncryptedComment,
  hasEncryptedReaction,
  isEngagementChatAllowed,
  isReactionRemoval,
  parseCommentTargetId,
  parseDecryptedCommentEvent,
  parseDecryptedReactionPayload,
  extractDeviceSentDestinationChat,
  parseEncryptedReactionTargetId,
  parseEngagementTargetChat,
  parsePlainCommentEvent,
  parsePlainReactionMessage,
  parseQuotedReplyEvent,
  parseReplyRevokeId,
  resolveEngagementChat,
  selectTrackedMessage,
  truncateBodyPreview,
  unwrapMessagePayload,
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

  it("parsePlainReactionMessage reads the live key.ID spelling", () => {
    const parsed = parsePlainReactionMessage(
      {
        reactionMessage: {
          key: { ID: "wa-out-1", remoteJID: "g@g.us", fromMe: true },
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

  it("parsePlainReactionMessage still accepts the lowercase id alias", () => {
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

  it("parsePlainReactionMessage treats blank text as removal", () => {
    const parsed = parsePlainReactionMessage(
      {
        reactionMessage: {
          key: { ID: "wa-out-3" },
          text: "   ",
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

  it("parseDecryptedReactionPayload reads key.ID from decryptReaction", () => {
    const parsed = parseDecryptedReactionPayload(
      {
        key: { ID: "target-99" },
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

  it("parseDecryptedReactionPayload uses the wrapper target when the body has no key", () => {
    const message = {
      encReactionMessage: { targetMessageKey: { ID: "announcement-7" } },
    };
    assert.equal(parseEncryptedReactionTargetId(message), "announcement-7");
    const parsed = parseDecryptedReactionPayload(
      { senderTimestampMS: "1761000000000", text: "👍" },
      "3EB0178947CFDCF9E1A6D3",
      parseEncryptedReactionTargetId(message),
    );
    assert.deepEqual(parsed, {
      targetWaMessageId: "announcement-7",
      emoji: "👍",
      waReactionId: "3EB0178947CFDCF9E1A6D3",
    });
  });

  it("unwraps ephemeral and deviceSent wrappers around an encrypted reaction", () => {
    const nested = {
      ephemeralMessage: {
        message: {
          deviceSentMessage: {
            destinationJID: "120363427934897913@g.us",
            message: {
              encReactionMessage: {
                targetMessageKey: {
                  ID: "3EB06C82FA30663F585EA6",
                  remoteJID: "120363427934897913@g.us",
                },
              },
            },
          },
        },
      },
    };
    assert.equal(
      extractDeviceSentDestinationChat(nested),
      "120363427934897913@g.us",
    );
    assert.equal(parseEncryptedReactionTargetId(nested), "3EB06C82FA30663F585EA6");
    assert.equal(parseEngagementTargetChat(nested), "120363427934897913@g.us");
    assert.equal(
      resolveEngagementChat(nested, "wrong-chat@g.us"),
      "120363427934897913@g.us",
    );
    assert.equal(hasEncryptedReaction(nested), true);
    assert.equal(
      unwrapMessagePayload(nested).encReactionMessage !== undefined,
      true,
    );
  });

  it("hasEncryptedComment detects encCommentMessage", () => {
    assert.equal(hasEncryptedComment({ encCommentMessage: { encPayload: "x" } }), true);
    assert.equal(hasEncryptedComment({ commentMessage: { targetMessageKey: { ID: "a" } } }), false);
  });

  it("parseCommentTargetId reads targetMessageKey.ID", () => {
    assert.equal(
      parseCommentTargetId({
        encCommentMessage: { targetMessageKey: { ID: "announcement-1" } },
      }),
      "announcement-1",
    );
    assert.equal(
      parseCommentTargetId({
        commentMessage: { targetMessageKey: { ID: "announcement-2" } },
      }),
      "announcement-2",
    );
  });

  it("parsePlainCommentEvent uses the inner message body", () => {
    const parsed = parsePlainCommentEvent(
      {
        commentMessage: {
          targetMessageKey: { ID: "announcement-9" },
          message: { conversation: "On my way" },
        },
      },
      "comment-stanza-1",
    );
    assert.deepEqual(parsed, {
      quotedWaMessageId: "announcement-9",
      replyWaMessageId: "comment-stanza-1",
      bodyPreview: "On my way",
    });
  });

  it("parseDecryptedCommentEvent keeps the wrapper target id", () => {
    const parsed = parseDecryptedCommentEvent(
      { conversation: "See you there" },
      "announcement-9",
      "comment-stanza-2",
    );
    assert.deepEqual(parsed, {
      quotedWaMessageId: "announcement-9",
      replyWaMessageId: "comment-stanza-2",
      bodyPreview: "See you there",
    });
  });

  it("parseReplyRevokeId accepts only the string REVOKE", () => {
    assert.equal(
      parseReplyRevokeId({
        protocolMessage: { type: "REVOKE", key: { ID: "comment-stanza-2" } },
      }),
      "comment-stanza-2",
    );
    assert.equal(
      parseReplyRevokeId({
        protocolMessage: { key: { ID: "comment-stanza-2" } },
      }),
      null,
    );
    assert.equal(
      parseReplyRevokeId({
        protocolMessage: { type: 0, key: { ID: "comment-stanza-2" } },
      }),
      null,
    );
  });

  it("selectTrackedMessage uses the only row when the chat JID differs", () => {
    const match = selectTrackedMessage(
      [{ id: "row-1", groupJid: "announcement@g.us" }],
      "other-address@g.us",
    );
    assert.deepEqual(match, { id: "row-1", chatDiffers: true });
  });

  it("selectTrackedMessage requires a chat match when several rows share the id", () => {
    const rows = [
      { id: "row-a", groupJid: "a@g.us" },
      { id: "row-b", groupJid: "b@g.us" },
    ];
    assert.deepEqual(selectTrackedMessage(rows, "b@g.us"), { id: "row-b", chatDiffers: false });
    assert.equal(selectTrackedMessage(rows, "c@g.us"), null);
  });

  it("buildReactionBreakdown drops removals and sorts by count then emoji", () => {
    const built = buildReactionBreakdown([
      { emoji: "❤️", count: 4 },
      { emoji: "", count: 2 },
      { emoji: "   ", count: 1 },
      { emoji: "👍", count: 8 },
      { emoji: "🔥", count: 4 },
    ]);
    assert.equal(built.reactionCount, 16);
    assert.deepEqual(built.reactionBreakdown, [
      { emoji: "👍", count: 8 },
      { emoji: "❤️", count: 4 },
      { emoji: "🔥", count: 4 },
    ]);
  });

  it("parseQuotedReplyEvent skips announcement comment wrappers", () => {
    assert.equal(
      parseQuotedReplyEvent(
        {
          reactionMessage: { key: { ID: "x" }, text: "👍" },
        },
        "r1",
      ),
      null,
    );
    assert.equal(
      parseQuotedReplyEvent(
        {
          encCommentMessage: { targetMessageKey: { ID: "announcement-1" } },
        },
        "c1",
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
