---
title: "Emoji and reply tracking — implementation plan"
type: "analysis"
updated: "2026-10-20"
sources: 4
tags: ["nmcas", "whatsapp", "whatsmeow", "engagement", "implementation"]
---

# Emoji and reply tracking — implementation plan

**Status:** Implemented on `feature/emoji-reply-tracking` (2026-10-20). Not merged to `main`. Phase 4 (a live post) was not run: the linked WhatsApp session is Dr Jasmine’s, and no message was sent or scheduled.  
**Research:** [[wiki/analysis/whatsmeow-message-stats]]  
**Already in the repo:** Agent 4 foundation — `MessageReaction`, `MessageReply`, ingest in `WaManager.handleInboundEngagement`, `GET /messages/:id/engagement`, Queue line `Reactions N · Replies N`.

The foundation does not yet show Announcements reactions and replies. Two protocol facts explain that. Fix those, then keep the same Queue line.

---

## What operators will see

On each Sent Queue row, after this work:

`12 reactions (👍 8, ❤️ 4) · 3 replies`

Expanded row: the same totals, plus the latest replies (name if WhatsApp sent one, otherwise the member JID, a short text preview, time).

The number of reactions is **people with a current emoji**, not taps. One person, one emoji. A change replaces the previous emoji. Removing the emoji drops that person from the count.

The number of replies is **comments on that announcement** plus any normal group message that quotes that post. A deleted comment is removed from the count.

Counts apply to events received after the droplet is running this build. There is no backfill of older posts.

---

## Why the current badge stays at zero

The tables and the badge are already wired. A checked campaign on 8 Sep 2026 had **zero** `MessageReaction` and `MessageReply` rows (`raw/sources/2026-09-09-starting-soon-false-sent-rdw6.md`). That campaign also had a post WhatsApp acked and did not show, so zero rows there are not by themselves a parser bug. The parser bug below would still drop a real reaction.

### Reactions

WhatsApp `MessageKey` is:

```protobuf
optional string remoteJID = 1;
optional bool fromMe = 2;
optional string ID = 3;
optional string participant = 4;
```

Source: [WACommon.proto](https://github.com/tulir/whatsmeow/blob/main/proto/waCommon/WACommon.proto). whatsmeow-node 0.8.0 JSON uses that exact casing (`stanzaID`, `URL`, `ID`). [v0.8.0 README](https://github.com/nicastelo/whatsmeow-node/blob/v0.8.0/README.md).

`parsePlainReactionMessage` and `parseDecryptedReactionPayload` read `key.id` only (`apps/api/src/lib/waEngagement.ts`). The unit tests build fixtures with `id`, so they pass. A live reaction key is `ID`. The target id is then null, the event is dropped, and the badge stays 0.

Announcement reactions are encrypted. `decryptReaction` returns the same `ReactionMessage`, so the decrypted map has `key.ID` too. `wa-manager.ts` already calls `decryptReaction`. The call can succeed and the parser can still drop it.

Empty `text` means the person removed the reaction. `sendReaction` documents an empty string as removal. Keep storing `emoji: ""` and exclude those rows from the count, which `GET /messages/:id/engagement` already does.

### Replies

Help Center: a member uses **Reply** on an announcement, and others open **Replies**. [How to reply and react to announcements](https://faq.whatsapp.com/1859295147860069).

whatsmeow names that an encrypted comment. `DecryptComment` decrypts `encCommentMessage` with the same message secret NMCAS already attaches on send. The wrapper carries `targetMessageKey`. The decrypted value is the comment body (`conversation`, `extendedTextMessage`, image caption, and so on). [msgsecret.go](https://github.com/tulir/whatsmeow/blob/main/msgsecret.go). whatsmeow-node 0.8.0 returns that body from `decryptComment` via `protoToMap`.

`handleInboundEngagement` never reads `encCommentMessage` and never calls `decryptComment`. `parseQuotedReplyEvent` only matches `contextInfo.stanzaID` / `stanzaId`. That is a quote inside a normal group. It is not the Announcements reply thread.

There is also an unencrypted `commentMessage { message, targetMessageKey }` in the same proto file. Handle that shape without decrypt.

### Match rule

Today the upsert requires `projectId` + `waMessageId` + `groupJid === event.info.chat`. Fan-out already gives each community its own `waMessageId`, so the count stays on that community’s Queue row.

If the event chat JID and the stored `groupJid` differ (LID vs phone addressing), that extra equality drops a valid hit. New rule: if exactly one row in the project has that `waMessageId`, use it. If several rows share it, keep the chat-JID filter. Log when the chat differs.

### Limits that stay

- The linked WhatsApp session has to be connected to receive the event. A gap is not replayed by this app. `history_sync` is not used.
- Decrypt needs the message secret still in the session SQLite (persisted in `WhatsAppSessionBlob`). A missing secret logs and skips that event.
- Announcements groups stop **reactions** (and poll votes) after 1,024 members. The Help Center page does not put replies under that sentence.
- One WhatsApp account can show up as two JIDs (phone and LID). This pass does not merge them. The same person can count twice in that case.
- Poll votes, read-receipt audience, link clicks, and channel view counts are out of this plan.

---

## Phase 1 — Parse the live key and the comment

Files: `apps/api/src/lib/waEngagement.ts`, `apps/api/src/lib/waEngagement.test.ts`.

1. One helper reads a message-key id from `ID`, then `id`. Use it for reaction keys and for `targetMessageKey`.
2. `parsePlainReactionMessage` / `parseDecryptedReactionPayload` use that helper. Empty or missing `text` stays a removal.
3. `parseCommentTargetId(message)` returns the id from `encCommentMessage.targetMessageKey` or `commentMessage.targetMessageKey`.
4. `hasEncryptedComment(message)` is true when `encCommentMessage` is an object.
5. Tests must use `key.ID` and `targetMessageKey.ID` as the live fixtures. Keep one `id` fixture so the alias still works. A fixture with only `key.id` must not be the only reaction test.

No database change in this phase.

**Done when:** `npm test` in `apps/api` passes, and a fixture shaped like `{ reactionMessage: { key: { ID: "wa-out-1" }, text: "👍" } }` parses.

---

## Phase 2 — Ingest comments and revoked comments

File: `apps/api/src/wa/wa-manager.ts`.

On `message`, for an allowlisted group, in this order:

1. Plaintext reaction, else `encReactionMessage` → `decryptReaction` → existing reaction upsert.
2. `encCommentMessage`: read `targetMessageKey.ID` first. Call `client.decryptComment(info, message)`. On success, body preview from the decrypted map with the existing `extractMessageBodyText`. Upsert `MessageReply` with `replyWaMessageId = event.info.id`, `replierJid = event.info.sender`.
3. Plain `commentMessage`: same upsert, body from the inner `message`.
4. Existing quoted-reply path for a normal group quote.
5. `protocolMessage` whose `type` is the string `"REVOKE"`: delete `MessageReply` rows in this project whose `replyWaMessageId` is that key’s id. Ignore a missing type. Do not treat a numeric `0` as revoke. Do not delete reactions here; reaction removal is an empty emoji.

Decrypt errors log the project id, the target id, and `err.message`. Do not log payloads or secrets.

Store `event.info.pushName` when it is non-empty.

Schema (`packages/db/prisma/schema.prisma` plus a new migration):

- `MessageReaction.reactorName String?`
- `MessageReply.replierName String?`

Upsert updates the name when the new event has one.

**Done when:** helper tests cover comment target id, encrypted-comment detection, and “REVOKE as a string deletes, missing type does not”. The handler calls `decryptComment` only when `encCommentMessage` is present.

---

## Phase 3 — Queue shows the real numbers

Files: `apps/api/src/routes/messages.ts`, `apps/web/src/types/models.ts`, `apps/web/src/components/QueueEngagementBadge.tsx`, `apps/web/src/components/QueueCard.tsx`.

`GET /messages/:id/engagement` adds:

```ts
reactionBreakdown: Array<{ emoji: string; count: number }>;
```

Group the non-empty emoji rows. Sort by count descending, then emoji. `reactionCount` stays the people total (sum of that breakdown).

The badge, for a `SENT` row, renders:

`12 reactions (👍 8, ❤️ 4) · 3 replies`

Zero stays visible as `0 reactions · 0 replies`, so a Sent post does not look like the feature is missing. Hide the badge only while the request is in flight or has failed.

While the Queue page is open, refetch each visible Sent badge every 60 seconds. Keep the in-flight flag so a slow response cannot overlap.

Expanded card calls `?includeRecent=1` and lists up to 20 replies: `replierName` or `replierJid`, preview, time. Same 60-second refresh while that card is expanded.

**Done when:** a mocked engagement payload renders the breakdown and a reply line. Collapsed cards do not request `includeRecent`.

---

## Phase 4 — One live post

After `update-server` on the droplet:

1. Send one Value text post to one community that is under 1,024 members.
2. From a member phone, react with an emoji, change it, then remove it.
3. From a member phone, reply on that announcement, then delete the reply if the phone allows it.
4. Expect the badge to follow: people count, emoji change, removal back to 0, reply count up, delete back down.
5. If the API log says the original message secret was not found, stop. That is session storage, not the Queue UI. Do not add poll votes or a dashboard in that fix.

---

## Out of scope

- Poll vote counts
- Read-receipt “seen by” totals
- Backfill of posts sent before this build
- Merging LID and phone JIDs into one person
- A separate analytics page, CSV, or member directory

---

## Files

| Area | Path |
|------|------|
| Parsers | `apps/api/src/lib/waEngagement.ts`, `waEngagement.test.ts` |
| Ingest | `apps/api/src/wa/wa-manager.ts` |
| Read API | `apps/api/src/routes/messages.ts` |
| Tables | `packages/db/prisma/schema.prisma`, new migration |
| Queue | `apps/web/src/components/QueueEngagementBadge.tsx`, `QueueCard.tsx`, `apps/web/src/types/models.ts` |
