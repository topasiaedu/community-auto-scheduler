---
title: "Source digest: WA P2 API stability (Baileys + Storage)"
type: "source-summary"
updated: "2026-04-17"
sources: 1
tags: ["nmcas", "p2", "baileys", "api", "supabase", "storage", "stability"]
---

# Source digest: `2026-04-17-wa-p2-api-stability.md`

**Raw path:** `raw/sources/2026-04-17-wa-p2-api-stability.md`

## One-line summary

P2 WhatsApp in **`apps/api`** stayed “connecting” because **every status/QR poll rebooted Baileys**; a secondary regression **serialized Storage `keys.set`** during pairing and blew pairing timeouts—fixed by **idempotent `start()`**, **parallel key writes**, **cred-save flush before reconnect**, and lighter **`makeWASocket`** options.

## Key claims (from source)

- **Poll storm:** `routes/wa.ts` called `await wa.start()` on each `GET /wa/status` and `GET /wa/qr`; old `start()` always ran tearDown + boot → **428** loops and no stable `connection === "open"`.
- **Pairing storm:** Sequential `keys.set` to Supabase made pairing take **20s+**; WA closed the socket before **515 restart** + cred reload could finish.
- **Hardening:** `credsSaveChain` + `flushCredSaves()` around disconnect and boot; reconnect delays tuned for **428 / 515 / 440**; cached **`fetchLatestBaileysVersion`**; **`browser`** tuple uses a semver-style third field.
- **Still P2 scope:** One `WaManager` / default project in-process; **P4** remains the formal multi-project pool described in [[wiki/concepts/wa-connection-pool]].

## Wiki integration

- [[wiki/overview]] — P2 slice: stable link path and QR/status polling behaviour
- [[wiki/concepts/wa-connection-pool]] — links to implemented singleton + operational pitfalls
- [[wiki/sources/2026-04-16-p0-spike-completion]] — spike vs API adapter continuity (Storage layout unchanged)

## Open questions (carried or new)

- **P4:** When promoting to a per-project `Map`, preserve **`ensureRunning`-style idempotency** on any HTTP or job entrypoint that touches the socket.
- **Observability:** Consider structured metrics for disconnect codes (428 vs 515 vs 440) instead of relying on Fastify logs alone.
