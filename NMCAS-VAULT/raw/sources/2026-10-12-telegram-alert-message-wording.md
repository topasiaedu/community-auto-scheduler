# Raw source: Telegram alert wording (2026-10-12)

**Type:** Session record (operator asked for this raw file after the wording change)  
**Date recorded:** 2026-10-12  
**Author of this note:** wiki maintainer, from the same chat. The operator did not paste a separate source text.  
**Scope:** The text of the Telegram WhatsApp link alert. Behavior is unchanged from `raw/sources/2026-10-12-telegram-wa-disconnect-alert.md`.

---

## 1. What the operator asked for

After the live alert was working, the operator asked for more meaningful wording.

The down message drops `[NMCAS]` and starts with a red mark:

```text
🔴 WhatsApp is not connected
Project: Dr Jasmine
Since: 12 Oct 2026, 14:22 MYT
Reason: WhatsApp rejected this app version (client outdated). Update @whatsmeow-node/whatsmeow-node on the server, then Clear session.
```

The project name, time, and reason still come from the live session. `Reason` is the session error when there is one, otherwise `still not connected`.

The recovery message, sent once after that down message was delivered, is:

```text
🟢 WhatsApp is connected again
Project: Dr Jasmine
```

## 2. What was committed

Commit `c7d5448` on `main`, pushed to `origin` (`73489da..c7d5448`). Message: `feat: mark Telegram WhatsApp alerts with red and green status`.

It changes only `apps/api/src/lib/waLinkAlert.ts` and `apps/api/src/lib/waLinkAlert.test.ts`. It sits on top of `73489da` (whatsmeow-node 0.8.0). The alert tests passed after the rebuild.

This chat did not restart the droplet. The live group keeps the old `[NMCAS]` text until `npm run update-server` runs on the server.
