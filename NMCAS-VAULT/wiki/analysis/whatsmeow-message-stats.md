---
title: "WhatsMeow message stats: reactions, replies, polls, receipts"
type: "analysis"
updated: "2026-10-20"
sources: 6
tags: ["nmcas", "whatsapp", "whatsmeow", "engagement", "research"]
---

# WhatsMeow message stats: reactions, replies, polls, receipts

**Question:** Can WhatsMeow track stats on a message NMCAS sent — how many people emoji-reacted, whether anyone replied, and any other useful counts?

**Verdict: yes for live reactions, announcement replies, and poll votes. There is no stats endpoint.** WhatsMeow (and `@whatsmeow-node/whatsmeow-node` **0.8.0**, the pin in `apps/api`) delivers individual events. This app has to count them. Community Announcements are `@g.us` groups, so the Channel view-count API does not apply.

NMCAS already stores reactions and quoted replies (`MessageReaction`, `MessageReply`, `GET /messages/:id/engagement`, Queue badge). Announcement **replies** and **poll votes** are separate protocol messages that this tracker does not decrypt yet.

---

## What you can count

| Stat | How it arrives | What the number means | NMCAS today |
|------|----------------|------------------------|-------------|
| Emoji reactions | `message` with `reactionMessage`, or `encReactionMessage` then `decryptReaction` | One current emoji per person. Empty text is a removal. People = rows whose emoji is non-empty. | Stored. Queue shows `reactionCount`. |
| Announcement replies | `message` with `encCommentMessage`, then `decryptComment` | One comment event whose target key is the announcement stanza id. Help Center calls these Replies. | Not decrypted. Queue `replyCount` is a different match. |
| Quoted replies in a normal group | `message` whose `contextInfo.stanzaId` (proto JSON `stanzaID`) equals `waMessageId` | Someone quoted that stanza. Free-form chat that does not quote it is absent from this count. | Stored as `MessageReply`. |
| Poll votes | `message` with `pollUpdateMessage`, then `decryptPollVote` | Latest vote per sender. Options come back as SHA-256 hashes of the option text, not the labels. | Polls are sent. Votes are not stored. |
| Delivered / read | `message:receipt` | One device reported delivery or that the user opened the chat. | Any matching receipt sets the row to SENT. Type is not stored. See [[wiki/analysis/telegram-post-status-delivery-tracking]]. |

---

## Reactions

WhatsApp Help Center, [How to reply and react to announcements](https://faq.whatsapp.com/1859295147860069): members can react to announcements the same way as other messages. [How to react to messages](https://faq.whatsapp.com/424198503229937): one reaction per message; the sender can change or remove it. The same announcements page: reactions and poll votes work for up to **1,024** members of the Announcements group. Past that, nobody in that group can react or vote. The page states that limit for reactions and poll votes. It does not put replies under that sentence.

Protocol, community announcements:

- whatsmeow `DecryptReaction`: “decrypts a reaction message in a community announcement group” when `encReactionMessage` is set. It needs the original message secret (`Store.MsgSecrets`). [msgsecret.go](https://github.com/tulir/whatsmeow/blob/main/msgsecret.go).
- `SendMessage` stores that secret when `messageContextInfo.messageSecret` is present. [send.go](https://github.com/tulir/whatsmeow/blob/main/send.go).
- A normal (non-announcement) reaction is plaintext `reactionMessage`. `BuildReaction` / whatsmeow-node `sendReaction` send one. `sendReaction` documents an empty string as removal. [whatsmeow-node 0.8.0 README](https://github.com/nicastelo/whatsmeow-node/blob/v0.8.0/README.md).
- Decrypted `ReactionMessage.text` is the emoji. NMCAS treats an empty string as removal (`isReactionRemoval`) and keeps one row per `(scheduledMessageId, reactorJid)`, so a changed emoji replaces the previous one.

NMCAS sends `messageContextInfo.messageSecret` on group text, image, and sticker (`apps/api/src/wa/message-secret.ts`, `wa-send.ts`). The inbound handler in `wa-manager.ts` parses `reactionMessage` or calls `client.decryptReaction`. `GET /messages/:id/engagement` counts rows with a non-empty emoji. `?includeRecent=1` returns the latest 20 with JID, emoji, and time. The badge does not split counts by emoji; the table has the emoji, so a breakdown is a query on the same rows.

There is no whatsmeow-node method that returns “reaction count for this group message id.” The 0.8.0 method list has `decryptReaction` and `sendReaction`. Aggregate `ReactionCounts` exist only on newsletter messages (`types.NewsletterMessage`).

---

## Replies

Help Center, same announcements article: a member uses **Reply** on an announcement, and others open **Replies** to read the thread. Members cannot react to those replies. An older Help Center page still says non-admins cannot post in the Announcements chat itself ([How to reply to a group in a community](https://faq.whatsapp.com/1500671377419221)). That is the chat composer. The reply thread is the later page.

Protocol:

- whatsmeow `DecryptComment`: “decrypts a reply/comment message in a community announcement group” when `encCommentMessage` is set. The decrypted body is a normal `waE2E.Message`. The target is `targetMessageKey` (chat, participant, fromMe, **id** = the announcement stanza). [msgsecret.go](https://github.com/tulir/whatsmeow/blob/main/msgsecret.go).
- whatsmeow-node 0.8.0 exposes `decryptComment(info, message)`.
- A quote in an ordinary group is `contextInfo.stanzaId` on the reply payload. NMCAS reads that in `extractQuotedWaMessageId` (`apps/api/src/lib/waEngagement.ts`).

The engagement handler never calls `decryptComment` and never reads `encCommentMessage.targetMessageKey`. `parseQuotedReplyEvent` returns null unless `stanzaId` is set. So the Queue **Replies** number is quoted-stanza matches. It is not the Announcements **Replies** thread. This session did not capture a live `encCommentMessage`, so this is a missing code path, not a production log that the count is zero.

Both decrypts fail with “original message secret not found” if the SQLite session no longer has the secret stored at send time. The session blob in Postgres is what keeps that store across restarts.

---

## Poll votes

Help Center includes poll votes in the same 1,024-member Announcements limit as reactions.

- `sendPollCreation` builds the poll and its message secret inside whatsmeow (`BuildPollCreation`). NMCAS uses that helper (`sendGroupPoll`), so the secret is stored on send the same way as an explicit `messageSecret`.
- Votes arrive as `pollUpdateMessage`. `decryptPollVote` returns `selectedOptions` as SHA-256 hashes of the option names. Match them with `sha256(optionText)` in the same encoding the binding returns (the poll-bot guide uses base64). [whatsmeow-node poll guide](https://github.com/nicastelo/whatsmeow-node/blob/main/docs-site/docs/guides/poll-bot.md); [msgsecret.go](https://github.com/tulir/whatsmeow/blob/main/msgsecret.go) `HashPollOptions`.
- Count voters by sender, and keep that sender’s latest update. The raw `pollUpdateMessage` is ciphertext until decrypt.

NMCAS does not call `decryptPollVote`.

---

## Receipts, and what not to treat as a stat

`message:receipt` is already the SENT gate. Receipt types and the “this does not prove the group can see the post” limits are in [[wiki/analysis/telegram-post-status-delivery-tracking]]. A read receipt is “the user opened the chat and saw the message” for **that** receipt’s sender. It is not a complete audience size. Group receipts with an empty sender are split per participant inside whatsmeow before the Node event.

Channel (newsletter) messages are the place WhatsApp sends server-side totals: `ViewsCount` and `ReactionCounts` on `types.NewsletterMessage`, filled by `getNewsletterMessages` / live update parsing ([notification.go](https://github.com/tulir/whatsmeow/blob/main/notification.go)). Community Announcements are not `types.NewsletterServer`. [[wiki/analysis/telegram-post-status-delivery-tracking]]

The 0.8.0 client also forwards `history_sync` (a blob of historical messages from the phone). NMCAS does not use it for engagement. The tracker’s own comment, and the Queue badge title, say there is no historical backfill: only events handled while this session is ingesting.

Not in the 0.8.0 method list or the message events used here: link-click counts, a forward count of your post, or a single “how many people saw this” total for an Announcements message.

`getGroupInfo` can supply the current member list as a denominator. That number is group size at query time, not viewers of one message. Announcement participant display names can be obfuscated ([group participant note](https://github.com/tulir/whatsmeow/blob/main/types/group.go) via the delivery-tracking page).

---

## Practical set for an NMCAS post

1. **Reactions** — one person, current emoji, removals dropped from the count. The parser reads `key.id`. The live protobuf name is `ID` ([WACommon.proto](https://github.com/tulir/whatsmeow/blob/main/proto/waCommon/WACommon.proto); whatsmeow-node 0.8.0 uses that exact casing). Implementation plan: [[wiki/analysis/emoji-reply-tracking-plan]].
2. **Replies** — `decryptComment`, then match `targetMessageKey.ID` to `ScheduledMessage.waMessageId`. Same plan.
3. **Poll votes** — add `decryptPollVote` on the poll’s `waMessageId`, map hashes back to the option strings stored on the row, one current vote per sender.
4. **Receipts** — keep them as delivery evidence with a type. Do not relabel them as views.

All four depend on the linked device being connected often enough to receive the event, and on the message secret still being in the session store.
