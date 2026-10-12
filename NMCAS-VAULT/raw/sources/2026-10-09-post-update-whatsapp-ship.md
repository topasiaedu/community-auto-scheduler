# Raw source: WhatsApp post-update notification shipped (2026-10-09)

**Type:** Session record (operator request to file this chat)  
**Date recorded:** 2026-10-09  
**Author of this note:** wiki maintainer, from the same chat. The operator did not paste a separate source text.  
**Scope:** Ops WhatsApp DM when a scheduled post finishes. Telegram “arrived in every community” stays withdrawn.

---

## 1. What the operator asked for

After research showed NMCAS cannot prove a scheduled post is visible in each Community Announcements group, the operator dropped the Telegram status bot.

They asked for one WhatsApp message to the two numbers that already get the daily digest, once per scheduled post, when that post finishes, whether the Queue result is Sent or Failed. The message should say which post was posted. They approved the draft wording, then confirmed this notification **replaces** the immediate `[NMCAS] Failed to send scheduled message…` DM. The daily digest stays.

They then asked to implement it, run the compile check, commit, and push. After the push they asked how to restart the live droplet, were told to run `npm run update-server` on the server, and replied **“ok done.”**

## 2. What was built

Commit `4450312` on `main`, pushed to `origin` (`270bdeb..4450312`). Message: `feat: notify ops on WhatsApp when a scheduled post finishes`.

- Recipients stay `60139968817` and `60176782206` (`DEFAULT_NOTIFY_MSISDNS`). Env can add numbers; it cannot remove these two. Same private DMs as the digest, via the project’s linked account (`sendDirectText`).
- One message per `fanOutBatchId` after the rows settle. A Value fan-out shares one id. Each reminder or single row gets its own id. Re-queue writes a new id, so the retry gets its own update.
- `PostStatusNotice.batchId` is unique. `postedAt` stays null until at least one recipient accepts. A second sweep skips a fresh claim. A claim older than 2 minutes with `postedAt` still null can be retried.
- Sweep about every 60 seconds. Ready when no row is `PENDING` or `SENDING`, or when now is at least `scheduledAt + WA_RECEIPT_TIMEOUT_MS` (default 90s) + 30s. Rows still open after that buffer render as `Sending`.
- Cancelled and draft rows are omitted. If every row is cancelled or draft, nothing is sent.
- Footer: “Sent means WhatsApp acknowledged the send. Open the community to confirm the post is on screen.” The DM does not claim the post appeared in the group.
- `markFailedWithNotify` only writes `FAILED`. The immediate failure DM is removed, so a failure is not pinged twice.
- Migration: `packages/db/prisma/migrations/20261009120000_post_status_notice`. Adds `ScheduledMessage.fanOutBatchId` and table `PostStatusNotice`.

Before the commit, `npm run typecheck` exited 0. There is no ESLint script. API unit tests were already 97 passing, including the formatter samples. No live WhatsApp send was made from the coding session.

## 3. Production restart (operator-reported)

The live API is the DigitalOcean droplet, not a machine reboot. The documented path is SSH, then:

```bash
cd /root/community-auto-scheduler
npm run update-server
```

That pulls `main`, runs `npm ci`, builds the API, and `pm2 restart nmcas-api --update-env`. PM2 runs `npm start`, which applies pending Prisma migrations and then starts the API. WhatsApp session files under `data/` are not part of that script.

The operator said that step was done on 2026-10-09. This chat did **not** re-check `https://nmcas-server.nmmedia.app/health` or `/ready`, did **not** query the database for the new table, and did **not** see a post-update DM on either phone.

## 4. Still open

A real scheduled post has not been checked against both phones (plan phase 4). Until that happens, do not treat the notification as proven in production. Queue **Sent** is still only a WhatsApp acknowledgement.
