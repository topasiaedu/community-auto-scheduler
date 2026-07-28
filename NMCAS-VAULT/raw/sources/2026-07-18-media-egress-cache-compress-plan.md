# Raw source: Media egress plan — download cache + image compress (2026-07-18)

**Type:** Engineering design + product decision (not yet implemented).  
**Date:** 2026-07-18  
**Trigger:** Production failure — scheduled Value post for *Reversing Diabetes Workshop 5.0* at 15:00 MYT. Error:

`Storage download failed: … exceed_egress_quota. The project owner must upgrade their plan or remove spend caps to restore service.`

Operator manually sent the message. **Code cannot unblock Storage while the org is restricted**; this plan reduces *future* Supabase Storage egress so Free/spend-capped plans survive fan-out weeks.

**Repo:** `community-auto-scheduler`  
**Primary paths:** `apps/api/src/worker/send-scheduled-message.ts`, `apps/api/src/routes/uploads.ts`  
**Related:** [[wiki/concepts/wa-connection-pool]], `raw/sources/2026-07-16-do-migration-oom-incident-session.md` (RAM constraints on DO 512 MB + swap), `raw/sources/2026-07-10-p8b-value-fan-out-active-communities.md` (Value fan-out → N rows sharing one `imageUrl`)

**Companion:** Implementation agent prompts → `raw/sources/2026-07-18-media-egress-agent-prompts.md`

---

## 1. What “egress” means here

**Egress** = bytes leaving Supabase toward the API (or browser). Every `supabase.storage.from(bucket).download(path)` of a post/reminder/sticker object counts against the org’s unified egress quota.

NMCAS stores media in a **private** bucket (`NMCAS_POST_MEDIA_BUCKET`, typically `nmcas-post-media`) under:

- `posts/{projectId}/…`
- `reminders/{projectId}/…`
- `stickers/{projectId}/…`

The send worker loads bytes with `downloadMediaAsset()` then passes a `Buffer` into whatsmeow (`sendPost` / `sendSticker`). The UI preview path `GET /uploads/media?path=…` also downloads (same bucket).

**You cannot eliminate egress for image posts** while media lives in Supabase — at least one download per distinct object is required after process restart. You *can* stop paying N× for N communities and stop storing/sending oversized originals.

---

## 2. Why we burn quota today

Value fan-out creates **one `ScheduledMessage` row per community** with the **same** `imageUrl` object path. pg-boss runs **one job per row**. Each job independently calls `downloadMediaAsset` → **N full downloads of the same file**.

Example: 10 communities × 3 MB image ≈ **30 MB egress per blast**. Repeated reminder graphics and UI previews add more.

There is **no cache** today. There is **no compression** on upload (`uploads.ts` stores the raw multipart buffer up to 16 MB).

---

## 3. Goals

| Goal | Success signal |
|------|----------------|
| Cut fan-out egress | Same `imageUrl` downloaded **once per API process** during a send wave (then reused) |
| Smaller stored objects | New post/reminder uploads typically **≪ original** (JPEG/WebP, max edge capped) |
| Smaller WhatsApp payloads | Worker sends compressed buffers; WhatsApp would recompress anyway |
| Stay RAM-safe on DO | Hard caps on cache bytes/entries; no unbounded Map growth (host is 512 MB RAM + swap; WA connect already spikes) |
| No product UX change | Operators keep uploading as today; compression is transparent |

**Non-goals (this effort):**

- Moving media off Supabase (S3/DO Spaces/local disk) — larger migration
- Upgrading Supabase plan (ops-only unblock for *current* restriction)
- CDN / public buckets
- Re-encoding existing objects already in the bucket (optional follow-up)
- Changing sticker format rules (static WebP only; animated still rejected)

---

## 4. Design — two complementary changes

### 4.1 Process-local download cache (send worker)

**Where:** Shared helper used by `downloadMediaAsset` in `send-scheduled-message.ts` (and optionally later by `uploads.ts` GET — lower priority).

**Shape:**

```
key = objectPath (string, already project-scoped in path)
value = { buffer: Buffer, mimetype: string, storedAt: number }
```

**Behaviours:**

1. **Hit** → return cached buffer (copy or immutable treat-as-read-only; do not mutate in place).
2. **Miss** → download from Supabase once; optionally compress (see §4.2); store; return.
3. **In-flight coalesce** → concurrent misses for the same path share one Promise (fan-out jobs often fire close together).
4. **Eviction** — LRU or simple FIFO with hard limits, e.g.:
   - `MAX_ENTRIES = 32`
   - `MAX_TOTAL_BYTES = 32 * 1024 * 1024` (32 MiB)
   - `TTL_MS = 60 * 60 * 1000` (1 hour)
5. **Logging** — `console.warn` on cache hit/miss with path + sizes (helps verify egress savings in DO logs). Do not log full buffers.

**Why process-local (not Redis/disk):** Zero new infra; fan-out waves are same-process; API is a single Node instance on DO. Restart clears cache (acceptable — next wave pays one download per unique path again).

**Memory caution:** Prefer caching **after** compression. Never cache unbounded originals. Align with OOM lessons: media is not the main RSS spike, but a 16 MB × N Map would hurt.

### 4.2 Image compression

**Library:** `sharp` (add to `apps/api` dependencies). Native; already appears transitively in the monorepo lockfile via other packages, but **declare it explicitly** on `@nmcas/api`.

**Apply in two places (same helper):**

| Stage | Why |
|-------|-----|
| **Upload** (`POST /uploads/media` for `post` and `reminder-image`) | Smaller objects forever → less egress on every future download + less Storage size |
| **Send path** (after download, before cache put / WhatsApp send) | Helps **legacy** large objects already in the bucket; keeps cache lean |

**Do not compress stickers** in v1 (`kind=sticker`): keep static WebP validation (`isAnimatedWebP`); stickers have WhatsApp size constraints and are already WebP.

**Suggested encode policy (post / reminder images):**

1. If input is already small (e.g. ≤ 400 KiB) **and** longest edge ≤ 1600px → store/send as-is (skip CPU).
2. Else: `sharp(buffer).rotate()` (EXIF), `resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })`.
3. Output **JPEG** quality ~80 (mozjpeg if available) **or** WebP quality ~80 — pick **one** default for predictability. Recommendation: **JPEG** for posts/reminders (broad WhatsApp friendliness); preserve alpha only if needed → then WebP/PNG exception.
4. If compressed size ≥ original size → keep original.
5. Update `Content-Type` / mimetype passed to WhatsApp to match output (e.g. `image/jpeg`). Object **path extension** in Storage may still say `.png` for legacy paths — send path must trust **buffer mimetype**, not only path guess (`guessImageMimetype` today). After compress-on-send, return `{ buffer, mimetype }` from the download helper.

**Filename on upload:** After compress, prefer writing with a matching extension (e.g. `.jpg`) so path-based guesses stay accurate. Document the chosen convention in code comments.

**CPU:** Compress once on upload; send-path compress only when cache miss and object was not already small. Avoid double-compressing upload-fresh JPEG that already meets targets (size check above).

---

## 5. Recommended implementation order

Two agents, **sequential** (see companion prompts file):

1. **Agent 1 — Compress helper + upload wiring**  
   Shared `compressPostImage(buffer) → { buffer, mimetype }` + upload route. No cache yet.
2. **Agent 2 — Download cache + send-path wiring**  
   Cache module; `downloadMediaAsset` uses coalesce + cache; on miss download → compress helper → cache → return.

Either order works if contracts are stable; **compress first** means Agent 2 caches smaller buffers from day one.

**Ops note (unchanged):** Until Supabase lifts `exceed_egress_quota`, downloads still fail. After unblock, these changes reduce recurrence risk.

---

## 6. Files expected to change

| Area | Files |
|------|--------|
| Compress util | `apps/api/src/lib/compressPostImage.ts` (new) + unit tests |
| Upload | `apps/api/src/routes/uploads.ts` |
| Cache util | `apps/api/src/lib/mediaDownloadCache.ts` (new) + unit tests |
| Send worker | `apps/api/src/worker/send-scheduled-message.ts` |
| Deps | `apps/api/package.json` (`sharp`), lockfile via workspace install |
| Tests script | `apps/api/package.json` `test` script — include new `dist/lib/*.test.js` |

**Out of scope files:** web UI, Prisma schema, pg-boss queue shape, WA pool.

---

## 7. Acceptance criteria

### Compress

- [ ] New post/reminder uploads > ~400 KiB or > 1600px long edge are resized/re-encoded before Storage write.
- [ ] Stickers unchanged (WebP + animated rejection).
- [ ] Unit tests cover: already-small skip, oversized shrink, “compressed larger → keep original”, non-image / corrupt handling (clear error).
- [ ] `npm run typecheck` / `npm test` in `apps/api` pass (do **not** run long `npm start` / production build loops if operator already has API running).

### Cache

- [ ] Two sequential `downloadMediaAsset` calls for the same path → **one** Supabase download (mock storage in tests).
- [ ] Parallel calls coalesce to one download.
- [ ] Eviction respects max entries / max bytes.
- [ ] Expired TTL entries re-download.
- [ ] Worker still fails clearly when Storage returns egress errors (no silent empty send).

### Ops / safety

- [ ] Cache total byte cap ≤ 32 MiB (or documented constant).
- [ ] No secrets logged; paths OK.
- [ ] Coding standards: TypeScript strict, no `any`, no non-null `!`, no `as unknown as T`, double-quoted strings, JSDoc on exported helpers.

---

## 8. Open questions (defaults if agent must choose)

| Question | Default |
|----------|---------|
| JPEG vs WebP for posts? | **JPEG q80**, max edge **1600** |
| Also cache UI `GET /uploads/media`? | **No in v1** (worker only); note as follow-up |
| Disk cache under `/tmp`? | **No** — memory only |
| Backfill compress existing Storage objects? | **No** — send-path compress handles them on miss |
| Shared cache across projects? | **Yes** keyed by full object path (path already includes `projectId`) |

---

## 9. Operator checklist (outside code)

1. Unblock Supabase: upgrade Free→Pro **or** disable Spend Cap on Pro (immediate). Free wait-for-cycle may lag hours after reset.
2. Do **not** re-queue the manually sent Workshop 5.0 row (risk of double post once Storage works).
3. After deploy of cache+compress: schedule a small fan-out and confirm DO logs show one download + cache hits.

---

*End of plan source.*
