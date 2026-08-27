# Raw source: WhatsApp QR pairing failure on DO 512 MB (2026-08-26 — 2026-08-27)

**Type:** Engineering incident + fix session — production WhatsApp linking blocked; infinite Loading Groups.
**Date range:** 2026-08-26 through 2026-08-27
**Scope:** `apps/api/src/wa/` (`wa-manager.ts`, `wa-pool.ts`, `routes/wa.ts`), `apps/web/` (`useNmcasApp.ts`, `WhatsAppSection.tsx`), DigitalOcean API (`nmcas-server.nmmedia.app`)
**Operator context:** Dr Jasmine project (`cmresmpxn0000x1w6vet6i42z`); production web on Vercel; API on shared **512 MB** DO Droplet with swap

---

## 1. Incident summary

Operators could not link WhatsApp on the **Connect / WhatsApp** page:

| Symptom | User-visible behaviour |
|---------|------------------------|
| QR never appears | UI stuck on "Waiting for WhatsApp…" / "Generating QR…" |
| Phone scan fails | WhatsApp app shows "cannot connect" / connection failed |
| After partial fix | "QR channel timed out — tap Clear session or Refresh QR" loop |
| After login attempt | "Loading groups…" indefinitely on Schedule / Settings |

**Not caused by:** frontend QR renderer (`qrcode.react` never received payload). **`GET /wa/qr` returned `204 No Content`** — API had no QR string to serve.

---

## 2. Diagnostic snapshots (production)

### Phase A — boot hung before QR

```json
{
  "state": "connecting",
  "hasQr": false,
  "pairing": false,
  "hasClient": true,
  "startWorkInFlight": true,
  "lastError": null
}
```

Interpretation: Go subprocess exists; `boot()` blocked inside `client.init()` / reconnect (up to **120 s** IPC timeout). UI polls forever; Clear session waits behind hung op chain.

### Phase B — zombie connected + pairing

```json
{
  "state": "connected",
  "hasQr": false,
  "pairing": true,
  "hasClient": true,
  "startWorkInFlight": false,
  "lastError": null,
  "bootPhase": null
}
```

Interpretation: `ensureRunning()` returned early on `isConnected()` **without** verifying `isLoggedIn()`. `qrPairingActive` left true. `/wa/status` stopped re-kicking because `state === "connected"`.

### Phase C — channel open, no QR event (infinite loop)

Sequence observed in Diagnostics over ~2 minutes:

1. `bootPhase: "awaiting_scan"`, `pairing: true`, `hasQr: false`
2. `lastError: "QR timed out — retrying automatically…"`
3. Back to `awaiting_scan` after auto-repair

Interpretation: whatsmeow **QR channel opened** and `connect()` succeeded, but the **`qr` event never fired** before library `qr:timeout`. Root cause: Go process started **while other warm clients still held RAM**, then repair loop respawned under same pressure.

---

## 3. Root causes

| # | Cause | Mechanism |
|---|--------|-----------|
| 1 | **RAM pressure on 512 MB host** | Multiple warm whatsmeow Go processes (`WA_MAX_WARM_CLIENTS` default 4; always-on warms session blobs). Connect/hydrate spike ~700 MB ([[wiki/sources/2026-07-16-do-migration-oom-incident-session]]). QR handshake and first `qr` emission fail under OOM. |
| 2 | **`prepareForQrPairing` only on manual reset** | `POST /wa/session/reset` evicted peer clients; organic boot via `/wa/status` poll did **not** free RAM before `getQRChannel()`. |
| 3 | **Go spawned before RAM freed** | `boot()` called `createClient()` + `init()` first; `onBeforeQrPairing` ran only inside `beginQrPairing()` **after** init — too late. |
| 4 | **`isConnected()` treated as linked** | `ensureRunning()` set `uiState = "connected"` without `isLoggedIn()`. Blocked retries; `pairing` flag stuck. |
| 5 | **No timeout on `/wa/groups`** | `getJoinedGroups()` IPC up to 120 s; browser fetch had no `AbortController` → infinite "Loading groups…" after fresh link while WA syncs. |
| 6 | **Unbounded QR auto-repair** | After `qr:timeout`, repair wiped and rebooted indefinitely; operator saw repeating timeout with no escape hatch. |

---

## 4. Fixes shipped (git `main`, 2026-08-26 — 2026-08-27)

Commits (in order):

| Commit | Summary |
|--------|---------|
| (prior) | QR pairing repair for dead sessions (`waQrPairing.ts`), `prepareForQrPairing` on reset |
| `ca712be` | Groups: 25 s server timeout, 30 s client abort, generation counter; `/wa/groups` 503 |
| `f022040` | Boot phase diagnostics; 40 s `init` cap; force-close on reset; peer shutdown timeouts |
| `6bbc743` | Zombie state fix (`isLoggedIn` gate); auto QR repair; `shouldKickStartForQr()` |
| `460fc9c` | **`openFreshQrPairing()`** — free RAM **then** spawn Go; max 3 repair attempts; **`POST /wa/pair-code`** phone fallback; whatsmeow `log` events to API logs |

### 4.1 API — QR pairing sequence (correct order)

For **new link** (no stored JID):

1. `prepareForQrPairing(projectId)` — shut down **all other** warm `WaManager` instances; mark target as mid-pairing (pool must not evict).
2. Dispose any existing client for this project.
3. `sleep(500)` — allow Go process exit + RAM reclaim.
4. `createClient()` + `init()` — **only now** spawn Go subprocess.
5. `getQRChannel()` then `connect()` — whatsmeow emits `qr` events asynchronously.
6. On `qr:timeout` / `qr:error`: **immediately `client.close()`**, schedule repair (max **3** attempts), wipe SQLite + blob, repeat from step 1.

**Never** call `getQRChannel()` on a client that already `init()`'d a store that was subsequently wiped without recreating the client ([[wiki/sources/2026-07-27-wa-reliability-agent-prompts]] / `waQrPairing.ts` regression tests).

### 4.2 API — phone-number pairing fallback

When QR never emits (common on headless / low-RAM):

- **`POST /wa/pair-code`** body `{ "phone": "60123456789" }` (digits + country code, no `+`).
- Flow: free RAM → wipe store → `init()` → **`connect()` first** → `pairCode(phone)` (whatsmeow requirement).
- Operator enters 8-digit code in WhatsApp → Linked devices → Link with phone number.

### 4.3 API — status / send-ready semantics

- **`isSendReady()`** requires `isConnected()` **and** `isLoggedIn()` (not socket alone).
- **`getStatusSnapshot()`** includes `bootPhase`, `lastError`, `pairing`, `startWorkInFlight` for Diagnostics panel.
- **`shouldKickStartForQr()`** re-kicks `start()` when stuck (including zombie `connected` + `pairing`).

### 4.4 Web UI

- Groups fetch: 30 s abort; stale-response generation guard; user message when sync delayed.
- WhatsApp page: **"Or link with phone number"** section when QR fails.
- Diagnostics JSON includes `bootPhase`.

---

## 5. Operator runbook

### Deploy

```bash
npm run update-server   # on DO host — pull main, rebuild, PM2 restart
```

Hard-refresh Vercel web after deploy.

### Recommended server `.env`

```bash
WA_MAX_WARM_CLIENTS=1
```

On **512 MB + swap**, keep at most **one** warm Go whatsmeow process. Default `4` is unsafe for QR pairing on this host.

### Link WhatsApp — preferred order

1. Open **WhatsApp** tab → wait up to ~60 s for QR after deploy.
2. If QR still missing after 3 auto-retries, use **Get pairing code** (phone number path).
3. If stuck, **Clear session and start over** once, then retry phone path.
4. After connected, wait 30–60 s → **Refresh groups** (initial sync is not instant).

### Debug without SSH

- Expand **Diagnostics** on WhatsApp page — read `bootPhase`, `lastError`, `pairing`.
- Browser Network: `GET /wa/status`, `GET /wa/qr` (204 = no QR yet).
- Script: `node scripts/debug-wa-qr.mjs` with `NMCAS_DEBUG_TOKEN` + `NMCAS_DEBUG_PROJECT_ID`.

### Smoke checks

```bash
curl -s https://nmcas-server.nmmedia.app/health
# Expect ok: true, whatsappStoreExample, queue name
```

---

## 6. Files touched

| Path | Role |
|------|------|
| `apps/api/src/wa/wa-manager.ts` | Boot state machine, `openFreshQrPairing`, QR repair cap, pair code, event handlers |
| `apps/api/src/wa/wa-pool.ts` | `prepareForQrPairing`, inject `onBeforeQrPairing`, eviction guards |
| `apps/api/src/lib/waQrPairing.ts` | Pure pairing plan helpers + unit tests |
| `apps/api/src/routes/wa.ts` | `/wa/status`, `/wa/qr`, `/wa/groups`, `/wa/pair-code` |
| `apps/web/src/hooks/useNmcasApp.ts` | Groups timeout, pair-code UI state |
| `apps/web/src/components/WhatsAppSection.tsx` | Phone pairing UI, groups error hint |
| `scripts/debug-wa-qr.mjs` | Live API probe |

---

## 7. Relationship to prior wiki

- Extends [[wiki/sources/2026-07-16-do-migration-oom-incident-session]] — same 512 MB DO constraint; this incident is **QR-specific** under always-on / multi-warm-client pressure, not send-time OOM.
- Implements parts of [[wiki/sources/2026-07-27-wa-reliability-always-on-plan]] (supervised reconnect, status snapshots) but exposes conflict: **always-on + max warm > 1** breaks QR on small hosts.
- Supersedes implicit assumption that QR pairing works on same RAM budget as steady-state send.

---

## 8. Open questions / follow-up

- [ ] Confirm `WA_MAX_WARM_CLIENTS=1` set in production `.env` on DO.
- [ ] Consider dedicated 1–2 GB Droplet for NMCAS if shared box runs `ltfpdf` + NMCAS concurrently under load.
- [ ] Capture whatsmeow `[log]` lines from DO `pm2 logs` during failed QR for upstream bug report if phone pairing also fails.
- [ ] Document `POST /wa/pair-code` in operator-facing README (wiki only for now).

---

## 9. Key URLs

| Service | URL |
|---------|-----|
| API | `https://nmcas-server.nmmedia.app` |
| Web | `https://community-auto-scheduler-web.vercel.app` |
| Default project store key (health) | `wa_session_blob/nmcas_default_project` |

---

*End of raw source.*
