# Raw source: Telegram alert when WhatsApp disconnects (2026-10-12)

**Type:** Session record (operator asked for a raw file of this chat, then asked to ingest it)  
**Date recorded:** 2026-10-12  
**Author of this note:** wiki maintainer, from the same chat. The operator did not paste a separate source text.  
**Scope:** A Telegram group message when a warm WhatsApp session is down. This is not the withdrawn idea of telling Telegram that a post arrived inside a community.

---

## 1. What the operator asked for

The operator first confirmed the existing 8:00 AM Malaysia-time WhatsApp daily digest, then asked for one more feature: a Telegram bot that messages a Telegram group when WhatsApp is not connected or disconnects.

They chose this rule:

- One message if a warm session is still not send-ready after about 3 minutes.
- An immediate message if WhatsApp logged out and needs a new QR.
- One short message when that same session can send again.
- A blip that reconnects by itself stays silent. An on-screen QR is not an outage.

The 8:00 AM digest stays unchanged.

## 2. Bot and group (no secrets in this note)

The operator created the bot in Telegram with BotFather. The username shown in `getUpdates` was `@nmcas_status_bot`. The group title was **NMCAS Status Update**. `getUpdates` was empty until they opened a private `/start` with the bot and then mentioned the bot in the group.

The group `chat.id` is negative. The private chat id is positive and must not be used. The bot token and the numeric chat id are stored only in the droplet `.env`. They are not in git and are not repeated here.

Phase 0 was a PowerShell `sendMessage` from the operator's PC. They said that phase was done.

## 3. What was built

Commit `e04313e` on `main`, pushed to `origin` (`4450312..e04313e`). Message: `feat: alert a Telegram group when WhatsApp stays disconnected`.

- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Empty values do not stop the API from starting. The loop logs once and sends nothing.
- `NMCAS_TELEGRAM_WA_ALERT_ENABLED` defaults on. `NMCAS_WA_DOWN_GRACE_MS` defaults to `180000`.
- Logout and a last error containing "client outdated" alert on the first check. Any other not-ready state waits for the grace period, then sends once.
- A QR on screen pauses the clock. "Connected again" is sent only after Telegram accepted the down message. A failed send is retried on the next tick.
- The loop starts next to the daily digest, about 10 seconds after boot and then every 30 seconds. It only watches sessions the pool has already started.
- No new npm package, database migration, or Telegram webhook.
- `npm test` in `apps/api` passed (114 tests, 0 failed) before the commit.

The wiki plan and catalog notes from this chat were left uncommitted. Only the API, `.env.example`, and `DEPLOY.md` are in `e04313e`.

## 4. Production

The live API is the DigitalOcean droplet at `https://nmcas-server.nmmedia.app`. The operator can SSH to run `npm run update-server`. That pulls `main`, builds, and restarts PM2. It does **not** copy `.env`. `.env` is gitignored.

The operator first put the token and chat id in the `.env` on their PC (`community-auto-scheduler/.env`). A server-side test then returned `send failed: Telegram token or chat id is empty`. That PC file is not the file the droplet reads. The API reads `/root/community-auto-scheduler/.env`.

From outside this chat, `/health` returned `ok: true` with `waWarmClients: 1`. That count means a session is loaded, not that the phone link is up. `GET /wa/status` returned `401` with `Missing Authorization Bearer token`.

The operator was told to append the two lines in the SSH session, with no `#` in front, then run `npm run update-server`. They later asked for a real WhatsApp status check and a Telegram message, and said they believed WhatsApp was disconnected. After that check they said: **it now runs correctly.**

This chat did not see the Telegram message or the `pm2` log lines. The operator's confirmation is the production evidence.

## 5. Still distinct from other alerts

- The 8:00 AM WhatsApp daily digest is unchanged.
- The post-update WhatsApp DM (`4450312`) is unchanged.
- A Telegram message here means the linked session is down or back. It does not mean a scheduled post is visible in a community.
