---
title: "Can a linked device prove a group message became visible?"
type: "analysis"
updated: "2026-10-08"
sources: 8
tags: ["nmcas", "whatsapp", "telegram", "delivery", "research"]
---

# Can a linked device prove a group message became visible?

**Question:** Can a WhatsApp multi-device client (whatsmeow / whatsmeow-node) reliably detect that a message it sent to a group, or to a Community Announcements channel, actually became visible in that chat?

**Verdict: partial.** There is no source-defined signal for “visible in the group.”

- **Server accepted** is exact: `Client.SendMessage` returns a `SendResponse`, which is also what whatsmeow-node’s IPC promise resolves to.
- **A device sent a receipt** is exact only when `message:receipt` / `events.Receipt` has this message id, `chat` is that group, and `type` is `""` (delivered), `"inactive"`, `"sender"`, or `"read"`.
- **Arrived / visible in the community chat** is not a signal these sources define. Do not use that word for any of the above. The 8 Sep 2026 RDW 6.0 case already paired a fast receipt with an empty Announcements chat, and the receipt `type` was not stored.

There is no public WhatsApp multi-device protocol spec in these sources. Claims below are limited to whatsmeow, Baileys, the WhatsApp Help Center, and — labeled separately — the WhatsApp Business Platform, which is a different API from this linked-device stack.

---

## Layer table

| Signal | What it proves | What it does not prove | Source |
|--------|----------------|------------------------|--------|
| whatsmeow-node IPC `{ok:true, data:{id, timestamp}}` | The Go process finished `client.SendMessage` and wrote that result. In this wrapper that is the server ack, not a local “command accepted” that returns early. | That the stanza is in the group, that any member device has it, or that the image bytes render. If the Go process dies after the server ack but before stdout, the Node side sees failure even though the server already answered (the inverse of a false arrival). | [INTERNALS.md](https://github.com/nicastelo/whatsmeow-node/blob/main/INTERNALS.md): stdin command, Go “call whatsmeow / write result”, `sendMessage` response `{id, timestamp}`. Send path returns only after `client.SendMessage` ([v0.2.3…v0.3.0](https://github.com/nicastelo/whatsmeow-node/compare/v0.2.3...v0.3.0)). |
| `SendResponse` (server `<ack>`) | “This method will wait for the server to acknowledge the message before returning. The return value is the timestamp of the message from the server.” Timestamp is the ack attribute `t`. A nonzero ack `error` attribute fails the call. | Storage in the group, fan-out, or visibility. A participant-hash mismatch still returns success and only logs: “Some devices may not have received the message.” | [send.go](https://github.com/tulir/whatsmeow/blob/main/send.go) `SendMessage`, `SendResponse.Timestamp`, ack `error` check, `phash` warning. |
| `ReceiptTypeDelivered` (`""`) | “the message was delivered to the device (but the user might not have noticed).” | That the user opened the chat, that every member got it, or that media downloaded. | [types/presence.go](https://github.com/tulir/whatsmeow/blob/main/types/presence.go) |
| `ReceiptTypeSender` (`"sender"`) | “sent by your other devices when a message you sent is delivered to them.” The receiving device sends this when the stanza is from itself. | That other members received it, or that the official UI shows two ticks. Baileys maps this same stanza type to status `SERVER_ACK`, which is not the XML ack `SendMessage` waits for. | [types/presence.go](https://github.com/tulir/whatsmeow/blob/main/types/presence.go); [receipt.go](https://github.com/tulir/whatsmeow/blob/main/receipt.go) `sendMessageReceipt`; [Baileys generics.ts](https://github.com/WhiskeySockets/Baileys/blob/master/src/Utils/generics.ts) |
| `ReceiptTypeRead` (`"read"`) | “the user opened the chat and saw the message.” | That every member read it, or that an image payload downloaded. | [types/presence.go](https://github.com/tulir/whatsmeow/blob/main/types/presence.go) |
| `ReceiptTypeReadSelf` (`"read-self"`) | “the current user read a message from a different device, and has read receipts disabled in privacy settings.” | A member read. | Same file. `MarkRead` also rewrites `read` to `read-self` for newsletters, or when this client’s privacy setting is none ([receipt.go](https://github.com/tulir/whatsmeow/blob/main/receipt.go)). |
| `ReceiptTypeRetry` (`"retry"`) | “the message was delivered to the device, but decrypting the message failed.” | Visible plaintext or a rendered image. | [types/presence.go](https://github.com/tulir/whatsmeow/blob/main/types/presence.go) |
| `ReceiptTypeInactive` (`"inactive"`) | A delivery receipt from a client that is not marked online. “transmitted to the sender, but not rendered in the official WhatsApp apps.” | Two gray ticks in the official UI. | [receipt.go](https://github.com/tulir/whatsmeow/blob/main/receipt.go) `SetForceActiveDeliveryReceipts` |
| `ReceiptTypePlayed` / `PlayedSelf` | View-once media was opened. Played-self “probably” means another of your devices opened it with read receipts off. | A normal image or text post is in the chat. | [types/presence.go](https://github.com/tulir/whatsmeow/blob/main/types/presence.go) |
| `peer_msg`, `hist_sync`, `server-error` | Named constants. `peer_msg` is what this client sends for a from-me `peer_msg` stanza. `hist_sync` is the receipt this client sends for a history-sync notification. | Group visibility. `server-error` has no definition comment next to the constant. | [types/presence.go](https://github.com/tulir/whatsmeow/blob/main/types/presence.go); [receipt.go](https://github.com/tulir/whatsmeow/blob/main/receipt.go); [message.go](https://github.com/tulir/whatsmeow/blob/main/message.go) `SendProtocolMessageReceipt` |
| Grouped receipt (`<participants>`) | One `events.Receipt` per `<user>` inside a group receipt whose sender is empty. Baileys, when `participant` is set, emits `message-receipt.update` per id instead of a single chat status. | The WhatsApp UI’s “everyone received it” check mark. One user row is one device. | [receipt.go](https://github.com/tulir/whatsmeow/blob/main/receipt.go) `parseReceipt` / `handleGroupedReceipt`; [Baileys messages-recv.ts](https://github.com/WhiskeySockets/Baileys/blob/master/src/Socket/messages-recv.ts) `handleReceipt` |
| `events.Message` with `IsFromMe`, Baileys `messages.upsert` | A message stanza arrived and was parsed. `IsFromMe` is true when the group participant user matches this account. `messages.upsert` is “add/update the given messages”; online arrivals use type `notify`. | That the sending socket is echoed its own send. `SendMessage` does not emit `events.Message`. The sender skips its own device when encrypting (`jid == ownJID \|\| jid == ownLID { continue }`). Sources do not say the server sends that stanza back to the device that just sent it. | [events.go](https://github.com/tulir/whatsmeow/blob/main/types/events/events.go) `Message`, `Receipt`; [message.go](https://github.com/tulir/whatsmeow/blob/main/message.go) `parseMessageSource`; [send.go](https://github.com/tulir/whatsmeow/blob/main/send.go) `encryptMessageForDevices`; [Baileys Events.ts](https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Events.ts) |
| History sync | “emitted when the phone has sent a blob of historical messages.” | A live send confirmation. | [events.go](https://github.com/tulir/whatsmeow/blob/main/types/events/events.go) `HistorySync` |
| Business Platform status `sent` / `delivered` / `read` / `failed` | Different product. `sent` = “successfully sent from our servers” (one check). `delivered` = device (two checks). `read` = “displayed in an open chat thread” (two blue checks). Group webhooks include `recipient_type: group` and `recipient_participant_id`. A read can arrive without a delivered webhook “because it’s implied that the message was delivered.” | A signal this linked-device client receives. NMCAS does not get these webhooks. The docs do not say a `sent` status means the message was later removed from the chat. | [Status messages webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status); [Group messaging](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/groups-messaging) |

Help Center, consumer app (not the Business Platform): check marks mean sent, delivered to the recipient’s phone or linked devices, and read. “In a group chat, the second check mark appears when everyone has received your message. Two blue check marks appear when everyone has read your message.” Turning read receipts off “won’t disable the read receipts for group chats.” There is no way to turn those off. [How to check read receipts](https://faq.whatsapp.com/665923838265756); [How to stay safe on WhatsApp](https://faq.whatsapp.com/1313491802751163).

whatsmeow’s own `Receipt` comment is: “emitted when an outgoing message is delivered to or read by another user, or when another device reads an incoming message.” It does not say a receipt proves the group transcript shows the message. [events.go](https://github.com/tulir/whatsmeow/blob/main/types/events/events.go)

---

## Which receipt fires for a group send?

Sources do not name one receipt that always fires when a group send succeeds.

What they do say:

- The wait inside `SendMessage` is an ack node, not an `events.Receipt`.
- Group chats use the same receipt types as other chats. A group receipt with an empty sender and a `participants` child is split into one event per user.
- A member device that is online sends `""` (delivered) or `"read"`. A backgrounded linked client sends `"inactive"` instead of a tick-rendering delivery receipt.
- The sender’s other devices, on receiving the from-me stanza, send `"sender"` (`sendMessageReceipt` sets that type when `IsFromMe`).
- `"retry"` means that device could not decrypt.
- Help Center double-check / blue-check is the aggregate (“everyone”), not one stanza. whatsmeow does not document a single receipt that means “everyone.”

A delivered or read receipt is evidence that **that device** got far enough to answer. It is not evidence the message is stored for every member, and not evidence an image rendered. `ReceiptTypeDelivered` explicitly allows “the user might not have noticed.”

Community Announcements are not given a separate receipt type. See the caveats below.

---

## History / own-message echo

`events.Message` is “emitted when receiving a new message.” If a from-you group stanza arrives, `IsFromMe` is set. That is a real inbound stanza.

`SendMessage` does not document emitting that event for the message it just sent. The encrypt loop skips this device’s own JID. Baileys `messages.upsert` is defined as messages received while online (`notify`) or appended (`append`). These files do not say the sending socket is given an echo of its own group send.

So an `isFromMe` echo is not a documented stronger “landed in the group” gate for the device that sent. It is unproven for this client until a log shows a matching inbound `message` for that id and chat. History sync is a later blob from the phone, not that gate.

---

## 8 Sep 2026: ack in ~500 ms, image not in the group

NMCAS observation, not a protocol spec: RDW 6.0 Starting Soon, 8 Sep 2026, accept-to-receipt 568 ms, row marked SENT, Announcements did not show the image. The handler marks SENT on any `message:receipt` whose ids match, and does not require `type` or `chat`. The type of that 568 ms receipt is not in the database. [[wiki/sources/2026-09-09-starting-soon-false-sent-rdw6]]

Protocol sources **do not** document “server ack, then the group drops the image.” They do document these adjacent facts:

- Ack and “visible” are different. `SendMessage` only waits for acknowledgement. The phash warning can follow a successful return.
- Media is a separate upload. `Upload` “uploads the given attachment” and says to copy the response fields onto the protobuf message that is sent later. A stanza ack is not a statement that clients can fetch the file. [upload.go](https://github.com/tulir/whatsmeow/blob/main/upload.go). Maintainer issues record “send returned success, recipient cannot download” and “missing `directPath`, download fails.” Those are download failures, not “no bubble.” [whatsmeow #344](https://github.com/tulir/whatsmeow/issues/344), [#1165](https://github.com/tulir/whatsmeow/issues/1165).
- Newsletters are a different server (`types.NewsletterServer`), with `Upload`’s newsletter flag and `UploadNewsletter` called out by maintainers for channel images. [whatsmeow #689](https://github.com/tulir/whatsmeow/issues/689). Community Announcements are not that server.
- Business Platform `failed` can mean send failure or delivery failure, with a red-triangle UI equivalent. That webhook is not what this client receives, and the page does not describe a silent drop after `sent`.

Silence: no whatsmeow, Baileys, Help Center, or Business Platform page cited here says WhatsApp accepts a group image stanza and then omits it from the chat.

---

## Recommended gate for a status bot

Say only what the signal’s own text allows.

| Wording | Wait for | Still unknown |
|---------|----------|----------------|
| Server accepted | `SendMessage` / whatsmeow-node `sendMessage` resolved (`id` + server timestamp, no ack error). | In the chat, any device, the image file. |
| A device sent a receipt | `message:receipt` with this id, `chat` equal to that group JID, and `type` one of `""`, `"inactive"`, `"sender"`, `"read"`. Name the type in the status text. `"sender"` means another of your devices got the from-me stanza. `""` / `"inactive"` means a device sent a delivery receipt. `"read"` means that user opened the chat and saw the message. | Every member, members online, image bytes rendered, the UI’s “everyone” ticks. |
| Unknown | No such typed receipt; receipt `chat` is not that group; `type` is `"retry"`, `"peer_msg"`, `"hist_sync"`, or `"server-error"`; or the Go process died. | Whether the post is in the group. A crash after ack can be a false miss. `"retry"` means decrypt failed, not “absent.” |

Do not say **arrived**. The 8 Sep receipt was fast and the image was still absent, and its `type` was not kept, so “any receipt” is already disproven as a visibility proof.

Do not wait for all-member delivered/read before speaking. The Help Center second check mark waits until everyone has received it. Offline members hold that open after a post can already be on screen for people who are online. whatsmeow does not document a stanza that means that aggregate by itself.

---

## Community Announcements vs normal groups

Help Center: creating a community also creates Community Announcements, “a space where community admins can send messages to all community members.” Non-admins cannot post or reply there. [How to create a community](https://faq.whatsapp.com/438859978317289); [How to reply to a group in a community](https://faq.whatsapp.com/1500671377419221). Those pages do not mention receipts.

whatsmeow:

- `GroupAnnounce.IsAnnounce`: “whether only admins can send messages in the group.” That flag is any admin-only group, not only communities. [types/group.go](https://github.com/tulir/whatsmeow/blob/main/types/group.go)
- The community announcements group is cached as `IsAnnounce && IsDefaultSubGroup`. `default_sub_group` sets `IsDefaultSubGroup`. `linked_parent` is separate. [group.go](https://github.com/tulir/whatsmeow/blob/main/group.go)
- Send path, only when that cache flag is set and `req.Meta != nil`: use the LID as the sender identity and set `addressing_mode` to PN. Comment: “hacky hack for announcement group messages.” [send.go](https://github.com/tulir/whatsmeow/blob/main/send.go). The comment does not say the server drops the message.
- `GroupParticipant.DisplayName`: “only present for anonymous users in announcement groups, it’s an obfuscated phone number.” Privacy of the participant list, not delivery.

Newsletter read receipts are special (`MarkRead` forces `read-self` on `NewsletterServer`). Announcement groups are `@g.us` groups. Sources above do not say announcement groups suppress delivered or read receipts.

Business Platform group docs describe per-participant delivered/read webhooks, and say pin/unpin gets only `sent`, not delivered or read. They do not describe WhatsApp Communities or Announcements channels.

---

## Telegram (secondary)

Yes. A bot posts into a group or supergroup with [`sendMessage`](https://core.telegram.org/bots/api#sendmessage): required `chat_id` is the “unique identifier for the target chat or username of the target bot, supergroup or channel,” and required `text` is 1–4096 characters. “On success, the sent Message is returned.” `Chat.type` is `"private"`, `"group"`, `"supergroup"`, or `"channel"`. [Bot API](https://core.telegram.org/bots/api#chat). That return is the Bot API’s success for the post the backend chose to send. It says nothing about WhatsApp.

---

## Open questions (sources silent)

- Which `receipt.type` was the RDW 6.0 568 ms event? Not recoverable from the row.
- Does this sending socket ever get `events.Message` with `IsFromMe` for an announcement-group send it just made? Not stated.
- Can a `"sender"` or `""` receipt still fire when the image never renders? The 8 Sep type is unknown, so the sources do not answer it.
