# Raw source: WhatsApp P2 API — Baileys stability and pairing (monorepo)

**Type:** Engineering capture (implementation + incident post-mortem).  
**Date:** 2026-04-17  
**Repo paths:** `apps/api/src/wa/wa-manager.ts`, `apps/api/src/routes/wa.ts`, `packages/wa-session-storage/src/supabase-multi-file-auth-state.ts`

## Context

P2 adds a single-process Baileys socket in the Fastify API (`WaManager`) with HTTP endpoints for status, QR, and groups. The web UI polls `/wa/status` and `/wa/qr` every few seconds.

## Symptoms observed

- UI showed **Connecting…** indefinitely even when a QR image appeared.
- API logs repeated **`WhatsApp connection closed`** with **`code: 428`** (`connectionClosed`) in tight loops, or **`code: 515`** (`restartRequired` / stream error) during pairing, sometimes followed by Baileys **`failed to commit mutations`** retries (signal key store writes to Supabase).

## Root causes (confirmed)

1. **HTTP polling restarted the socket every poll**  
   `GET /wa/status` and `GET /wa/qr` each called `wa.start()`, which unconditionally ran **tear down + boot** on every invocation. That closed the live WebSocket on every poll and produced **428** loops and never-stable sessions.

2. **Sequential `keys.set` writes to Supabase Storage**  
   A change made `keys.set` await each key file one-by-one. During QR pairing Baileys persists **many** signal keys (including large pre-key batches). Sequential remote writes took **tens of seconds**, so the WebSocket timed out or closed before the normal **515 → reconnect with saved creds** pairing flow could complete.

3. **Minor latency / fingerprint issues**  
   - Calling **`fetchLatestBaileysVersion()`** on every boot added an extra HTTP round-trip on every reconnect.  
   - **`browser`** tuple used a non-semver third segment (`"P2"`), which is atypical versus Baileys defaults.

## Fixes applied (summary)

- **`ensureRunning()`:** `start()` only tears down and boots when there is **no** live WebSocket (`socket` missing or `ws` closed). Polling no longer kills the session.
- **`credsSaveChain` + `flushCredSaves()`:** Serialize `saveCreds` and await the chain before disconnect recovery and before loading auth from Storage on the next boot (aligns with community practice on Baileys v7 pairing / cred races).
- **Reconnect backoff:** e.g. longer delay for **428**, short delay for **515** (`restartRequired`), long delay for **440** (`connectionReplaced`).
- **`makeWASocket`:** `syncFullHistory: false`, `markOnlineOnConnect: false` for a lighter headless-style session.
- **`keys.set`:** Restored **parallel** writes with `Promise.all` (same pattern as Baileys `useMultiFileAuthState`); per-file mutexes still prevent corrupt concurrent writes to the same object.
- **Cached WA version tuple** after first `fetchLatestBaileysVersion()` for the process lifetime.
- **`browser`:** `["NMCAS", "Chrome", "1.0.0"]` (semver-style third segment).

## External reference (for maintainers)

OpenClaw’s tracker documents Baileys v7 pain around **515 restart**, **`lastDisconnect` shape**, and **flushing cred writes before reconnect** (e.g. GitHub issue discussion on QR pairing and `restartRequired`). NMCAS does not depend on OpenClaw code; this is cited as parallel industry context only.

## Non-goals of this note

- Does not prescribe P4 multi-socket pool API details beyond “singleton today, pool later.”
- Does not replace `p0-spike/` runbook; spike remains the minimal Storage + Baileys reference.

---

*Immutable raw capture; wiki digest lives under `wiki/sources/`.*
