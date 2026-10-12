---
title: "Telegram alert when WhatsApp disconnects"
type: "analysis"
updated: "2026-10-12"
sources: 0
tags: ["nmcas", "telegram", "whatsapp", "implementation"]
---

# Telegram alert when WhatsApp disconnects

**Status:** On `main` as `e04313e` (2026-10-12). The operator said the live WhatsApp check and the Telegram send now run correctly. This chat did not see the group message. A separate "connected again" message was not confirmed. Ship note: [[wiki/sources/2026-10-12-telegram-wa-disconnect-alert]].  
**Not this feature:** the withdrawn idea of telling Telegram that a post arrived inside a WhatsApp community. That stays withdrawn. See [[wiki/analysis/telegram-post-status-implementation-plan]].

The 8:00 AM WhatsApp daily digest stays as it is. This is a separate message, in a Telegram group, only when a linked WhatsApp session is actually down.

---

## 1. What you will get

The API already holds the WhatsApp session. When that session is down, the API sends one message into a Telegram group you choose.

- If WhatsApp **logs out** (it needs a new QR scan), the group is told **immediately**.
- If the link **drops** and WhatsApp does not come back by itself, the group is told **once, after about 3 minutes**.
- When that same session is **send-ready again**, the group gets **one** short “connected again” message.
- A blip that reconnects in a few seconds stays silent. WhatsApp already retries on its own (about 1 second, then longer, up to 1 minute).
- While a QR code is on screen, the 3-minute clock waits. Scanning is not an outage.
- Only sessions the server has already started are watched (the default project, plus other projects that already have a saved session). A project that was never linked stays quiet.
- If the bot token or chat id is missing, the API still starts. It logs once and sends nothing.

Down:

```text
🔴 WhatsApp is not connected
Project: Dr Jasmine
Since: 12 Oct 2026, 14:22 MYT
Reason: WhatsApp rejected this app version (client outdated). Update @whatsmeow-node/whatsmeow-node on the server, then Clear session.
```

Back, only after the down message was delivered:

```text
🟢 WhatsApp is connected again
Project: Dr Jasmine
```

`Reason` is the session’s last error when there is one. Otherwise it says `still not connected`. A known dead state such as “client outdated” is sent immediately, the same way as a logout, because it will not fix itself.

---



## 2. Get the bot token

Do this in Telegram on your phone or in Telegram Desktop. You do not need the NMCAS code for this phase.

The token is a password. Anyone who has it can send messages as your bot. Do not commit it, do not paste it into chat, and do not put it in a screenshot.

1. Open Telegram and search for **BotFather**.
2. Open the official account. The username is `@BotFather`. It has a blue verification check. Ignore other accounts with similar names.
3. Tap **Start**, or send `/start`.
4. Send `/newbot`.
5. BotFather asks for a **display name**. This is what people see. Example: `NMCAS Alerts`.
6. BotFather asks for a **username**. Rules from BotFather:
  - It must end in `bot` (for example `nmcas_alerts_bot`).
  - It can use letters, numbers, and underscores.
  - It must be unique. If BotFather says it is taken, pick another username.
7. BotFather replies with a line like this (the example below is fake):
  ```text
   Use this token to access the HTTP API:
   7123456789:AAHxExampleTokenDoNotUseThisValue
  ```
8. Copy that whole token, including the numbers, the colon, and the rest. That value is `TELEGRAM_BOT_TOKEN`.
9. Store it in a password note until you paste it into the server `.env` in Phase 4. Do not save it in this wiki.

If you lose the chat with BotFather later, send `/mybots`, pick the bot, then **API Token**.

If the token is ever pasted somewhere public, open BotFather, send `/revoke`, pick the bot, and copy the new token. The old one stops working. Update the server `.env` and restart the API.

You do **not** need a webhook, a Telegram login, or a privacy-mode change for NMCAS to send messages. Privacy mode only affects which group messages the bot can *read*. This feature only *sends*.

---



## 3. Get the group chat id

The chat id tells the bot *which* group to post in. A group id is a **negative** number. A supergroup id usually starts with `-100`. A positive number is a private chat with one person. Use the group id, not your personal id.

### 3.1 Create the group and add the bot

1. In Telegram, create a group, or pick the ops group that should receive these alerts.
2. Group name example: `NMCAS alerts`.
3. Add the bot by its username (the one that ends in `bot`).
4. If the group only lets admins send messages, make the bot an admin and allow it to post messages. Otherwise the test in section 4 fails even when the chat id is correct.



### 3.2 Make Telegram show the group to the bot

By default a group bot only *receives* commands and @mentions. A plain “hello” may not show up when you ask Telegram for updates.

1. In the group, send a message that mentions the bot, for example `@nmcas_alerts_bot hello` (use your real username).
2. Or send `/start@nmcas_alerts_bot`.

Send this **after** the bot has joined. An older message does not count.

### 3.3 Read the id in a browser

1. Open this address in the browser. Replace `YOUR_TOKEN` with the token from section 2. Do not share the page after it loads. It contains the token.
  ```text
   https://api.telegram.org/botYOUR_TOKEN/getUpdates
  ```
2. You want a result that includes the group, like this (ids here are fake):
  ```json
   {
     "ok": true,
     "result": [
       {
         "update_id": 1001,
         "message": {
           "chat": {
             "id": -1001234567890,
             "title": "NMCAS alerts",
             "type": "supergroup"
           }
         }
       }
     ]
   }
  ```
3. Copy `chat.id` **with the minus sign**. That value is `TELEGRAM_CHAT_ID`. Example: `-1001234567890`.
4. Match `title` to your group. If you also messaged the bot in private, the page lists that too. Skip any chat whose `type` is `private` (that id is positive and would DM you, not the group).



### 3.4 If `getUpdates` is `{"ok":true,"result":[]}`

`ok: true` means the token is valid. `result: []` means the bot has not received a message, so there is no `chat.id` yet. Opening the page before you mention the bot produces this. A normal “hello” in the group also produces this, because a new bot does not receive ordinary group text.

Do this in order.

1. In Telegram, search for your bot’s username and open the **private** chat with the bot, not the group. Press **Start** or send `/start`.
2. Reload `getUpdates`. You should now see one result. Its `chat.type` is `private` and its `id` is positive. That proves the token URL matches the bot. Do **not** use this positive id as `TELEGRAM_CHAT_ID`.
3. If this private chat is still `result: []`, the token in the browser is not the bot you just started. Copy the token again from BotFather (`/mybots`, pick the bot, **API Token**) and rebuild the URL. Do not keep the old tab.
4. Go back to the **group**. Type `@`, pick your bot from the list so the mention is a real link, then send `hello`. A hand-typed name that is not a mention does not count.
5. Reload `getUpdates`. Use the `chat.id` whose `type` is `group` or `supergroup`. Keep the minus sign.

If step 2 works but step 5 is still empty, privacy mode ate the group message:

1. In BotFather send `/setprivacy`, choose the bot, choose **Disable**.
2. Remove the bot from the group, then add it again. This re-add is required.
3. Send a plain `hello` in the group.
4. Reload `getUpdates`.



### 3.5 Read the id from Telegram Web instead

Use this when `getUpdates` stays empty. The bot does not have to receive a message.

1. On the PC, open [https://web.telegram.org/a/](https://web.telegram.org/a/) and log in.
2. Open the alert group.
3. Look at the address bar. The number after `#` is the chat id. A group looks like `-1001234567890`. Copy it with the minus sign.
4. If the address bar has no minus number, stay on the group and use section 3.4.



### 3.6 Other `getUpdates` errors


| What you see                                                    | What to do                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Conflict: can't use getUpdates method while webhook is active` | Open `https://api.telegram.org/botYOUR_TOKEN/deleteWebhook` once, then reload `getUpdates`. NMCAS does not use a webhook.                                     |
| `Unauthorized`                                                  | The token is wrong or was revoked. Copy it again from BotFather.                                                                                              |
| The id changed later                                            | Telegram sometimes upgrades a basic group into a supergroup and issues a new id. If alerts stop after that, repeat section 3.3 and update `TELEGRAM_CHAT_ID`. |


---



## 4. Prove the bot can post before any NMCAS code

Do this from your own PC once, so a bad token or a wrong chat id is caught before the droplet is involved.

In PowerShell, paste your real token and chat id only in that window. Close the window when you are done so the values are not left on screen.

```powershell
$token = "PASTE_TOKEN_HERE"
$chatId = "PASTE_CHAT_ID_HERE"
$body = @{ chat_id = $chatId; text = "NMCAS test. You can ignore this." } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/sendMessage" -ContentType "application/json" -Body $body
```

**Done when:** the group shows `NMCAS test. You can ignore this.` and PowerShell prints `ok : True`.

If Telegram returns `chat not found`, the bot is not in that group, or the id is your private chat id. If it returns `have no rights to send a message`, make the bot an admin with permission to post.

---



## 5. Where the values go later

They belong in the API `.env` on the droplet, the same file PM2 already loads for `nmcas-api`. They do not go in git.

```text
TELEGRAM_BOT_TOKEN=paste-the-token-from-botfather
TELEGRAM_CHAT_ID=paste-the-negative-group-id
```

Use the group id from `getUpdates` for **NMCAS Status Update**. Keep the minus sign. That id does not start with `-100`, and that is correct for this group. Do not use the positive private-chat id.

Optional, only if you need to change the defaults:

```text
NMCAS_TELEGRAM_WA_ALERT_ENABLED=true
NMCAS_WA_DOWN_GRACE_MS=180000
```

`180000` is 3 minutes. Leave these unset to keep the defaults (alerts on, 3 minutes).

After the code is on the droplet, restart so PM2 picks up the new lines:

```bash
pm2 restart nmcas-api --update-env
```

`npm run update-server` also restarts with `--update-env`, but only after the code is on `main`. Putting the two lines in `.env` before the code exists is safe: the current API ignores unknown variables.

---



## 6. Phases

Tick a box only when that line is actually done. Each phase has its own definition of done. Do not start Phase 4 until Phase 3’s definition of done is met. Phase 0 can be done before or while the code is written. Phase 4 needs both.

### Phase 0 — You create the bot and the group

No repo changes.

- [x] Opened `@BotFather` and created the bot with `/newbot`.
- [x] Copied `TELEGRAM_BOT_TOKEN` into a private note, not into git or this wiki.
- [x] Created or chose the Telegram group.
- [x] Added the bot to that group.
- [x] If the group restricts sending, made the bot an admin that can post.
- [x] Sent a mention or `/start@your_bot` in the group after the bot joined.
- [x] Opened `getUpdates` and copied the **negative** `chat.id` whose `title` is that group.
- [x] Ran the PowerShell test in section 4.
- [x] The group received `NMCAS test. You can ignore this.`

**Definition of done:** met on 2026-10-12. The group **NMCAS Status Update** received the PowerShell test. The chat id to use is the negative group id from `getUpdates`, not the positive private-chat id. It does not have to start with `-100`.

### Phase 1 — Code can send a Telegram message

- [x] `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are read in [apps/api/src/env.ts](../../../apps/api/src/env.ts).
- [x] `NMCAS_TELEGRAM_WA_ALERT_ENABLED` defaults on. `NMCAS_WA_DOWN_GRACE_MS` defaults to `180000`.
- [x] Empty token or empty chat id does not crash startup.
- [x] New helper posts `sendMessage` to `https://api.telegram.org/bot<token>/sendMessage` with `fetch`.
- [x] The request has a timeout. Logs never print the token.
- [x] A failed Telegram response is returned as a failure the caller can retry. It does not throw out of the process.

**Definition of done:** met. Empty env does not throw. `sendTelegramText` reports success or failure and strips the token from errors.

### Phase 2 — Code decides when WhatsApp is down

- [x] [apps/api/src/wa/wa-manager.ts](../../../apps/api/src/wa/wa-manager.ts) status snapshot includes `loggedOut`.
- [x] [apps/api/src/wa/wa-pool.ts](../../../apps/api/src/wa/wa-pool.ts) can list warm project ids without starting a new session.
- [x] A pure function decides: wait, alert down, alert back, or do nothing.
- [x] Logout and “client outdated” alert on the first check.
- [x] Any other not-ready state alerts once after the grace period.
- [x] An on-screen QR pauses the grace clock.
- [x] A second check while still down does not send a second down message.
- [x] “Connected again” is sent only if the down message was actually delivered.
- [x] A failed send stays unsent and is tried again on the next tick.
- [x] The loop starts beside the daily digest in [apps/api/src/index.ts](../../../apps/api/src/index.ts) and stops on shutdown.
- [x] The loop checks about every 30 seconds. It only looks at sessions the pool has already started.

**Definition of done:** met. The 8:00 AM digest text was not changed.

### Phase 3 — Tests and the env notes in the repo

- [x] Tests cover: still inside the 3 minutes, alert at 3 minutes, logout immediate, client-outdated immediate, QR pauses the clock, no repeat while down, recovery only after a delivered down alert, failed send is not treated as delivered.
- [x] The test command for those tests passes.
- [x] [.env.example](../../../.env.example) lists the four variables with empty or commented examples. No real token.
- [x] [DEPLOY.md](../../../DEPLOY.md) lists the same variables and points to this page for the BotFather steps.

**Definition of done:** met. `npm test` in `apps/api` passed (114 tests, 0 failed).

### Phase 4 — The live group receives a real outage message

Do this on the droplet after Phase 3 is on `main` and you have run `npm run update-server` (or an equivalent restart that loads the new code).

- [x] The two required lines are in the droplet `.env`, not in git. The PC `.env` was not enough. The operator added them over SSH.
- [x] `npm run update-server` was run after `e04313e` was on `main`. The operator said the server had updated.
- [ ] `pm2 logs nmcas-api --lines 50` was not pasted here.
- [x] `https://nmcas-server.nmmedia.app/health` returned `ok: true` from this chat (`waWarmClients: 1`). That count is not proof the phone link is up.
- [x] The operator asked for a real WhatsApp status check while they believed the session was disconnected, then said it runs correctly.
- [x] Operator-confirmed: the Telegram send for that check worked. This chat did not see the message.
- [ ] A "connected again" message was not confirmed in this chat.
- [ ] A short reconnect that stays silent was not confirmed in this chat.

**Definition of done:** partly met. The operator confirmed the down-path send. The recovery message is still unchecked.

---



## 7. Overall definition of done

All of these are true:

1. Phase 0 through Phase 4 checklists are complete.
2. The group gets one down message for a logout immediately, and one down message for a drop that lasts about 3 minutes.
3. The group gets one back message only after a down message was delivered.
4. Brief reconnects and an in-progress QR scan do not post.
5. No bot token is in git, this wiki, or the logs.
6. The API still starts when the Telegram variables are missing.
7. The 8:00 AM WhatsApp digest is unchanged.

---



## 8. Files the build is expected to touch

- [apps/api/src/env.ts](../../../apps/api/src/env.ts) — the four variables.
- [apps/api/src/lib/telegramNotify.ts](../../../apps/api/src/lib/telegramNotify.ts) — new `sendMessage` helper.
- [apps/api/src/lib/waLinkAlert.ts](../../../apps/api/src/lib/waLinkAlert.ts) — new decision function and 30-second loop.
- [apps/api/src/lib/telegramNotify.test.ts](../../../apps/api/src/lib/telegramNotify.test.ts) — send success, rejection, and token redaction.
- [apps/api/src/lib/waLinkAlert.test.ts](../../../apps/api/src/lib/waLinkAlert.test.ts) — the Phase 3 cases.
- [apps/api/src/wa/wa-manager.ts](../../../apps/api/src/wa/wa-manager.ts) — `loggedOut` on the status snapshot.
- [apps/api/src/wa/wa-pool.ts](../../../apps/api/src/wa/wa-pool.ts) — list warm project ids.
- [apps/api/src/index.ts](../../../apps/api/src/index.ts) — start and stop the loop next to `startDailyDigest`.
- [.env.example](../../../.env.example) and [DEPLOY.md](../../../DEPLOY.md) — names only, plus a pointer here for the BotFather steps.

This build does not add an npm package, a database migration, or a Telegram webhook.