import { describe, expect, it } from "vitest";
import {
  engagementRequestPath,
  formatEngagementBadge,
  formatEngagementReplyLine,
  parseEngagementCounts,
} from "./engagementDisplay.js";

describe("engagement display", () => {
  it("formats the Queue badge with an emoji breakdown", () => {
    const text = formatEngagementBadge({
      reactionCount: 12,
      replyCount: 3,
      reactionBreakdown: [
        { emoji: "👍", count: 8 },
        { emoji: "❤️", count: 4 },
      ],
    });
    expect(text).toBe("12 reactions (👍 8, ❤️ 4) · 3 replies");
  });

  it("keeps a zero Sent row visible without a breakdown", () => {
    const text = formatEngagementBadge({
      reactionCount: 0,
      replyCount: 0,
      reactionBreakdown: [],
    });
    expect(text).toBe("0 reactions · 0 replies");
  });

  it("uses the sender name on a reply line", () => {
    const line = formatEngagementReplyLine({
      replierName: "Aina",
      replierJid: "60123456789@s.whatsapp.net",
      bodyPreview: "See you there",
      repliedAt: "2026-10-20T08:00:00.000Z",
    });
    expect(line.startsWith("Aina — See you there — ")).toBe(true);
    expect(line.includes("60123456789@s.whatsapp.net")).toBe(false);
  });

  it("falls back to the member JID when WhatsApp sent no name", () => {
    const line = formatEngagementReplyLine({
      replierName: null,
      replierJid: "60123456789@s.whatsapp.net",
      bodyPreview: null,
      repliedAt: "2026-10-20T08:00:00.000Z",
    });
    expect(line.startsWith("60123456789@s.whatsapp.net — (no text) — ")).toBe(true);
  });

  it("collapsed rows omit includeRecent and expanded rows ask for it", () => {
    expect(engagementRequestPath("msg-1", false)).toBe("/messages/msg-1/engagement");
    expect(engagementRequestPath("msg-1", true)).toBe(
      "/messages/msg-1/engagement?includeRecent=1",
    );
  });

  it("parses a mocked engagement payload", () => {
    const parsed = parseEngagementCounts({
      messageId: "msg-1",
      reactionCount: 12,
      replyCount: 1,
      reactionBreakdown: [{ emoji: "👍", count: 12 }],
      recentReplies: [
        {
          id: "reply-1",
          replyWaMessageId: "wa-reply-1",
          replierJid: "6012@s.whatsapp.net",
          replierName: "Aina",
          bodyPreview: "See you there",
          repliedAt: "2026-10-20T08:00:00.000Z",
        },
      ],
    });
    expect(parsed).not.toBeNull();
    if (parsed === null) {
      return;
    }
    expect(formatEngagementBadge(parsed)).toBe("12 reactions (👍 12) · 1 reply");
    const reply = parsed.recentReplies?.[0];
    expect(reply).toBeDefined();
    if (reply === undefined) {
      return;
    }
    expect(formatEngagementReplyLine(reply).startsWith("Aina — See you there — ")).toBe(true);
  });
});
