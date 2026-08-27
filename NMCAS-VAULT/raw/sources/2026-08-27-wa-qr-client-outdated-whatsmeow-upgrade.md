# Raw source: WhatsApp QR missing because whatsmeow client outdated (2026-08-27)

**Type:** Engineering incident + production hotfix — QR never shown; Clear session did not help.  
**Date:** 2026-08-27 (afternoon, after the same-day RAM-first pairing work)  
**Scope:** Production API on DigitalOcean (`nmcas-server.nmmedia.app`, PM2 `nmcas-api`); `@whatsmeow-node/whatsmeow-node`; `apps/api/src/wa/wa-manager.ts` pairing kick/repair  
**Operator context:** Dr Jasmine project (`cmresmpxn0000x1w6vet6i42z`); web on Vercel (`VITE_API_URL=https://nmcas-server.nmmedia.app`); API on shared **512 MB** Droplet + swap

---

## 1. Incident summary

Operators could not scan a WhatsApp QR on the Connect / WhatsApp page. **Clear session** did not help. Diagnostics flickered:

| Snapshot | Meaning in this incident |
|----------|--------------------------|
| `bootPhase: "awaiting_scan"`, `hasQr: false` | QR **channel** opened; **payload never stored** |
| Then `state: "connecting"`, `hasQr: false`, `hasClient: false`, `bootPhase: null` | Repair exhausted |
| `lastError`: "QR never arrived after several tries. Use Link with phone number below, or set WA_MAX_WARM_CLIENTS=1 on the server." | UI blamed RAM / warm-client cap; that was **misleading** this time |

**Not caused by:** frontend SVG renderer (no payload to draw). **`GET /wa/qr` stayed 204.** **Not caused by RAM this time:** `/health` showed `rssMb` ~122, `waWarmClients: 1`.

Earlier the same day, wiki recorded a **low-RAM** pairing failure with the **same UI signature** (`awaiting_scan` then timeout, `/wa/qr` 204). This session is a **different root cause** with overlapping symptoms.

---

## 2. Production evidence (PM2)

API process: `nmcas-api` on droplet hostname `ltfpdf`. Error log (repeating):

```
[WaManager] QR error projectId=cmresmpxn0000x1w6vet6i42z event=err-client-outdated
[WaManager] QR repair exhausted … reason=qr_error_err-client-outdated
[WaManager] QR channel timed out projectId=cmresmpxn0000x1w6vet6i42z
```

Stdout:

```
[WaManager] QR channel open projectId=…; waiting for qr event
GET /wa/qr → 204
```

There was **no** `[WaManager] qr event … codeLen=` line while on **0.6.0**.

`err-client-outdated` is whatsmeow’s QR-channel event when WhatsApp rejects the advertised **Web client version** (HTTP **405** / “Client outdated”). The Go binary bundled in **whatsmeow-node 0.6.0** (published **2026-04-24**, upstream `v0.0.0-20260416104156-3ff20cd3462a`) was expired. WhatsApp never sent a QR string, so `latestQr` stayed unset.

### Status-poll loop (secondary)

After repair attempts hit the cap of 3, `/wa/status` still called `shouldKickStartForQr()` → `start()` → new Go spawn. That produced a tight loop of `whatsmeow-node started` / `QR channel open` / timeout / `QR repair exhausted`, which matches operators seeing `awaiting_scan` then the “QR never arrived” banner.

---

## 3. Root cause (condensed)

1. **Pinned whatsmeow-node 0.6.0** in `apps/api/package.json` / lockfile while npm already had **0.7.0** (published **2026-06-20**, upstream `v0.0.0-20260611094716-089932318bc2`).
2. WhatsApp server-side version expiry — same class as tulir/whatsmeow issues on **405 Client outdated**; the Node binding does not auto-bump the Go client version.
3. **Local debug ingest** (`127.0.0.1`) captured nothing: Vercel web talks to the droplet, not a laptop API.
4. Operator message `WA_MAX_WARM_CLIENTS=1` was leftover from the RAM pairing incident and did **not** apply here.

---

## 4. Fix

### Production hotfix (droplet, 2026-08-27)

```
cd /root/community-auto-scheduler
npm install @whatsmeow-node/whatsmeow-node@0.7.0 -w @nmcas/api
pm2 restart nmcas-api --update-env
```

`apps/api/package.json` on the droplet then showed `"@whatsmeow-node/whatsmeow-node": "^0.7.0"`.

### Verification (PM2 out log after restart)

```
[WaManager] qr event projectId=cmresmpxn0000x1w6vet6i42z codeLen=277
```

Operator confirmed QR appeared and login succeeded.

### Repo / pairing-loop (local tree; deploy with `update-server` when convenient)

- Dependency: `@whatsmeow-node/whatsmeow-node` **^0.7.0** (`package-lock.json` resolved to 0.7.0).
- `shouldKickStartForQr()`: do **not** re-kick `start()` after `qrRepairAttempts >= MAX_QR_REPAIR_ATTEMPTS` (stops the HTTP poll spawn storm).
- `qr:error` with `event === "err-client-outdated"`: set `qrRepairAttempts` to max, set a **client outdated** `lastError`, skip useless auto-repair on the same binary.

---

## 5. Operator runbook

If QR is missing and `/wa/status` shows `awaiting_scan` + `hasQr: false`:

1. SSH / `pm2 logs nmcas-api` — look for **`qr event … codeLen=`** vs **`err-client-outdated`** vs **`qr:timeout` only**.
2. If **client outdated**: bump `@whatsmeow-node/whatsmeow-node` to the latest npm release, `npm ci` / `npm install`, **`pm2 restart nmcas-api`**. Phone pairing will fail the same way until the engine is current.
3. If **timeout only** and `waWarmClients` > 1 / RSS climbing: treat as RAM pairing — `WA_MAX_WARM_CLIENTS=1`, `openFreshQrPairing` path (see same-day DO 512 MB pairing note).
4. After engine upgrade: **Clear session once**, hard-refresh the Vercel WhatsApp page.
5. Keep the droplet lockfile in git so the next `git pull` + `npm run update-server` does not **downgrade** back to 0.6.0.

---

## 6. Open / follow-up

- Droplet was patched with `npm install` on the server; **commit + `update-server`** so git and production stay aligned.
- whatsmeow-node **0.7.0 is still 0.x** and will expire again; there is no in-app version bump. Plan periodic npm checks when QR/login suddenly dies for all projects.
- As of 2026-08-27, npm latest was **0.7.0** (no 0.8.x yet). If 0.7.0 later 405s, wait for a new binding release or rebuild against current `go.mau.fi/whatsmeow`.
