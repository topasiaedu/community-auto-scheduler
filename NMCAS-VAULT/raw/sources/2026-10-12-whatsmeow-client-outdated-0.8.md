# Raw source: WhatsApp client outdated — whatsmeow-node 0.7.0 → 0.8.0 (2026-10-12)

**Type:** Engineering incident + repo fix — WhatsApp rejected the bundled client version; upgrade planned and shipped to `main`.  
**Date:** 2026-10-12  
**Scope:** Production API on DigitalOcean (`nmcas-server.nmmedia.app`, PM2 `nmcas-api`); `@whatsmeow-node/whatsmeow-node`; `apps/api/src/wa/wa-manager.ts`; lockfile deploy via `npm run update-server`  
**Operator context:** Same class of failure as 2026-08-27 (`err-client-outdated` / HTTP 405). Operator saw the UI `lastError` that tells them to update whatsmeow-node and Clear session.

---

## 1. Incident summary

The operator reported the WhatsApp Connect UI error:

> WhatsApp rejected this app version (client outdated). Update @whatsmeow-node/whatsmeow-node on the server, then Clear session.

That string is set only in `WaManager` when the Go process reports `qr:error` with `event=err-client-outdated` (and, after this fix, also on the 0.8+ `client_outdated` event).

Public check of the live API the same day:

```
GET https://nmcas-server.nmmedia.app/health
→ ok: true, waWarmClients: 1, rssMb ~85–130
```

Healthy RAM + one warm client matches the **27 Aug client-outdated** shape, not the morning-of-27-Aug **512 MB QR spawn** failure. This chat did **not** SSH into the droplet, so PM2 was not read directly. The UI string plus `/health` was enough to classify the failure.

**Do not Clear session while still on 0.7.0.** A wipe cannot get a QR from an expired client binary. Upgrade the engine first, then scan (or clear only if no QR appears after the new binary is running).

---

## 2. Version evidence

| Layer | Value |
|-------|--------|
| Repo before fix | `apps/api/package.json` `^0.7.0`; `package-lock.json` resolved **exactly 0.7.0** |
| whatsmeow inside 0.7.0 | `v0.0.0-20260611094716-089932318bc2` (11 Jun 2026) |
| Advertised WA web version in 0.7.0 | **2.3000.1040847988** |
| npm latest at session time | **@whatsmeow-node/whatsmeow-node@0.8.0** (published 2026-09-28) |
| whatsmeow inside 0.8.0 | `v0.0.0-20260927171547-45cfce066cd2` |
| Advertised WA web version in 0.8.0 | **2.3000.1047769893** (17 Sep 2026 proto bump) |
| Upstream whatsmeow tip (7 Oct 2026) | `v0.0.0-20261007111105-c386243a72ba` advertises **2.3000.1049558099** |

There was **no** published whatsmeow-node build of the 7 Oct upstream. Open watch issue on the binding: [nicastelo/whatsmeow-node#59](https://github.com/nicastelo/whatsmeow-node/issues/59) (bump toward 29 Sep only). `main` of that repo had no commit after the 0.8.0 release.

`npm ci` on the droplet always installs the **lockfile** version. A server-only `npm install` without committing the lockfile is overwritten by the next `update-server`.

---

## 3. Root cause (condensed)

1. Production stayed on **whatsmeow-node 0.7.0** after the Aug 27 hotfix. WhatsApp later rejected that June client version (405 / client outdated).
2. The Node package does **not** auto-refresh the advertised Web client version; only a newer binding (or a custom rebuild) bumps it.
3. Same operational class as [[wiki/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade]] (then 0.6.0 → 0.7.0).

---

## 4. Fix shipped in git

**Commit:** `73489da` on `main` (pushed 2026-10-12).  
**Message:** fix: upgrade whatsmeow-node to 0.8.0 for WhatsApp client version 405.

### Dependency

- `apps/api/package.json`: pin `"@whatsmeow-node/whatsmeow-node": "0.8.0"` (exact).
- `package-lock.json`: resolves 0.8.0 and platform binaries.

### `WaManager` behavior (0.8+ safety)

whatsmeow-node 0.8 adds a first-class `client_outdated` event (WhatsApp does not reconnect after 405). Node must not keep spawning Go on a 512 MB droplet.

Changes in `apps/api/src/wa/wa-manager.ts`:

- Flag `isClientOutdated`; cleared on `start()` so a post-upgrade boot can retry.
- Shared `markClientOutdated()` sets the same operator `lastError` string, caps QR repair attempts, cancels reconnect/QR repair timers.
- `qr:error` with `err-client-outdated` and the new `client_outdated` event both call that path.
- `scheduleReconnect` / `scheduleQrRepair` no-op while outdated.
- `exit` with non-zero code keeps the outdated message and does **not** schedule reconnect when the flag is set.

TypeScript surface used by NMCAS (`sendRawMessage`, `uploadMedia`, `sendPollCreation`, groups, `pairCode`) is compatible. Engagement reply parsing already accepts both `stanzaId` and `stanzaID`.

### Verification in this chat

- `npm run typecheck -w @nmcas/api` passed.
- `npm test -w @nmcas/api` — 114 tests passed.

---

## 5. Deploy / link (operator — still open at end of this chat)

This session **pushed** `73489da` but did **not** run `update-server` on the droplet (no SSH from the agent). Live `/health` after the push still reflected the **old** process until the operator restarts.

On the droplet:

```bash
cd /root/community-auto-scheduler
npm run update-server
pm2 logs nmcas-api --lines 80
```

Then interpret logs:

| Log / state | Action |
|-------------|--------|
| `loggedIn=true` or `connected` | Old session survived — **do not** Clear session |
| `qr event … codeLen=` | Scan that QR from the phone |
| Still `err-client-outdated` / `client_outdated` | 0.8.0’s 17 Sep version was also rejected — **stop**; wait for a newer whatsmeow-node release; clearing the session will not help |

Re-check `https://nmcas-server.nmmedia.app/health` after restart. Keep `WA_MAX_WARM_CLIENTS=1` on the 512 MB box; pairing is the memory spike.

`boot()` already wipes a stored session that fails `isLoggedIn`, then opens QR. If the operator already saw the outdated error, that wipe may have happened. Recovery is: new binary → successful QR (or reconnect of a still-valid session), not clear-before-upgrade.

---

## 6. Open / follow-up

- [ ] Operator runs `npm run update-server` and confirms QR or `loggedIn`.
- [ ] If 0.8.0 still 405s: wait for the next whatsmeow-node publish (upstream tip is already past 0.8.0’s embedded version).
- [ ] Expect this class of failure again whenever WhatsApp expires the next bundled version; keep the lockfile in git so `update-server` cannot drift.

---

## 7. Related

- Prior incident: `raw/sources/2026-08-27-wa-qr-client-outdated-whatsmeow-upgrade.md`
- Deploy path: `scripts/update-server.sh` (`git pull`, `npm ci`, `build:api`, `pm2 restart nmcas-api`)
- Telegram disconnect alert (same day): treats “client outdated” as an immediate down reason — `raw/sources/2026-10-12-telegram-wa-disconnect-alert.md`
