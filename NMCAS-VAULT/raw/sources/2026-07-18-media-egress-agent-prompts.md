# Raw source: Agent prompts — media compress + download cache (2026-07-18)

**Type:** Copy-paste implementation briefs for coding agents (~200k context models).  
**Date:** 2026-07-18  
**Plan (read first):** `NMCAS-VAULT/raw/sources/2026-07-18-media-egress-cache-compress-plan.md`  
**Repo root:** `community-auto-scheduler`

## How to use

1. Run **Agent 1**, then **Agent 2** (recommended order).
2. Paste the entire prompt block for that agent into a **fresh** chat.
3. Each prompt is self-contained but assumes the agent can read the repo. Do not merge both agents into one chat unless the model has spare context after Agent 1 lands.
4. **Do not** commit, push, or merge unless the human says so.
5. **Do not** run `npm start` / long production builds — operator likely already has API running. Prefer `typecheck` + targeted `npm test` in `apps/api`.

### Sizing rationale

| Agent | Scope | Why split |
|-------|--------|-----------|
| 1 | `sharp` + upload compress + shared helper | Native dep + encode policy + upload path |
| 2 | In-memory cache + worker wiring + coalesce | Fan-out egress; depends on Agent 1 helper |

Together would fit a 200k window, but sequential chats keep each agent focused and leave room for test failures / retries.

---

## Agent 1 — Prompt (compress)

Copy everything between the `BEGIN_AGENT_1_PROMPT` / `END_AGENT_1_PROMPT` markers.

```
BEGIN_AGENT_1_PROMPT

# Task: Compress post/reminder images on upload (NMCAS)

## Context

NMCAS hit Supabase Storage `exceed_egress_quota` when the send worker downloaded a Value-post image for each fan-out community. We are reducing bytes stored and sent. Full design:

- Read: `NMCAS-VAULT/raw/sources/2026-07-18-media-egress-cache-compress-plan.md` (especially §4.2, §6–8)
- Current upload: `apps/api/src/routes/uploads.ts` — stores raw multipart up to 16 MB; kinds `post` | `reminder-image` | `sticker`
- Sticker rules already exist: WebP only + `apps/api/src/lib/animatedWebp.ts` rejects animated WebP
- Send worker still uses path-based `guessImageMimetype` — your helper must return an explicit `mimetype` for later Agent 2
- Host is a memory-tight DO droplet (see `NMCAS-VAULT/raw/sources/2026-07-16-do-migration-oom-incident-session.md`) — keep CPU work bounded; skip compress when already small

## Your job (Agent 1 only)

1. Add dependency `sharp` to `apps/api/package.json` and install via workspace from repo root.
2. Create `apps/api/src/lib/compressPostImage.ts` exporting something like:

   `compressPostImage(input: Buffer): Promise<{ buffer: Buffer; mimetype: string; skipped: boolean }>`

   Policy (defaults from the plan):
   - Skip if `input.byteLength <= 400 * 1024` AND longest edge ≤ 1600 (use sharp metadata; if metadata fails, treat as needing compress attempt or safe skip — document choice).
   - Else: `rotate()` for EXIF, `resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })`, encode **JPEG quality 80**.
   - If output size ≥ input size → return original buffer + best-effort original mimetype (sniff or `image/jpeg` fallback — document).
   - Never use `any`, non-null assertions `!`, or `as unknown as T`. Double-quoted strings. JSDoc on exports.

3. Wire into `POST /uploads/media` for `kind=post` and `kind=reminder-image` only:
   - Compress before Supabase upload.
   - Prefer object filename extension matching output (e.g. `.jpg` when encoding JPEG) so path guesses stay sane.
   - Set Storage `contentType` to the returned mimetype.
4. **Do not** compress stickers. **Do not** implement the download cache (Agent 2). **Do not** change web UI or Prisma.
5. Add unit tests `apps/api/src/lib/compressPostImage.test.ts` (node:test or existing pattern). Cover: small skip, large shrink, compressed-worse-keeps-original. Generate tiny fixtures in-test with sharp if needed.
6. Update `apps/api/package.json` `test` script to include the new compiled test file.
7. Run `npm run typecheck` and `npm test` in `apps/api`. Fix failures. Do not start the API server.

## Out of scope

- `mediaDownloadCache`, send-worker changes, GET `/uploads/media` caching
- Re-encoding objects already in Supabase
- Changing `MAX_BYTES` (16 MB) unless compress makes a clear bug

## Done when

- Helper + upload wiring + tests green
- Short summary of files changed and encode defaults used
- Note any follow-ups for Agent 2 (e.g. export shape)

## Coding rules reminder

Strict TypeScript; no `any`; no `!`; no `as unknown as T`; double quotes; JSDoc on new exports; full implementations no placeholders.

END_AGENT_1_PROMPT
```

---

## Agent 2 — Prompt (cache)

Copy everything between the `BEGIN_AGENT_2_PROMPT` / `END_AGENT_2_PROMPT` markers.

**Prerequisite:** Agent 1 merged locally (or at least `compressPostImage` exists and uploads use it). If Agent 1 is missing, implement a thin adapter that calls `compressPostImage` when present; do not re-implement sharp encode policy from scratch.

```
BEGIN_AGENT_2_PROMPT

# Task: In-process media download cache for scheduled sends (NMCAS)

## Context

Value fan-out creates N `ScheduledMessage` rows sharing one `imageUrl`. Each pg-boss job calls `downloadMediaAsset()` in `apps/api/src/worker/send-scheduled-message.ts`, so the same Supabase object is downloaded N times → Storage egress. We hit `exceed_egress_quota` in production.

Full design:

- Read: `NMCAS-VAULT/raw/sources/2026-07-18-media-egress-cache-compress-plan.md` (§4.1, §5–8)
- Compress helper from Agent 1: `apps/api/src/lib/compressPostImage.ts` — call it on cache miss after Storage download (legacy large objects) before putting into cache
- Worker entry: `downloadMediaAsset`, `sendPostRow`, `sendStickerRow` in `send-scheduled-message.ts`
- Memory: DO API is 512 MB + swap; WA connect already spikes — enforce hard cache caps (plan default: ≤32 entries, ≤32 MiB total, TTL 1h)
- Stickers: may cache raw sticker WebP buffers **without** JPEG recompress (do not run `compressPostImage` on stickers)

## Your job (Agent 2 only)

1. Create `apps/api/src/lib/mediaDownloadCache.ts`:
   - Key: object path string
   - Value: `{ buffer: Buffer; mimetype: string; storedAt: number; byteLength: number }`
   - API sketch (adjust names as needed):
     - `get(path): entry | undefined`
     - `set(path, buffer, mimetype): void` with LRU/FIFO eviction by max entries + max total bytes
     - `getOrLoad(path, loader): Promise<{ buffer; mimetype }>` with **in-flight Promise coalescing** for identical paths
   - Constants exported or documented at top of file.
   - JSDoc; strict TS; double quotes; no `any` / `!` / `as unknown as T`.

2. Refactor `downloadMediaAsset` (or replace with a richer helper) so callers get `{ buffer, mimetype }`:
   - Validate path with existing `isAllowedMediaPath` / `MEDIA_PREFIXES`.
   - `getOrLoad`: on miss → Supabase download (same as today) → if path is under `posts/` or `reminders/`, run `compressPostImage` → cache **compressed** result → return.
   - If path under `stickers/`, cache original bytes; mimetype `image/webp` (or sniff).
   - On Supabase error, throw the same clear `Storage download failed: …` style message (preserve egress errors for notify).
   - Update `guessImageMimetype` usage: prefer returned mimetype from download helper over path extension when sending.

3. Wire `sendPostRow` / `sendStickerRow` only as needed. Do not redesign P7 routing.

4. Unit tests `apps/api/src/lib/mediaDownloadCache.test.ts`:
   - Second getOrLoad same key does not call loader twice (sequential)
   - Parallel getOrLoad coalesces to one loader call
   - Eviction when over max entries or max bytes
   - TTL expiry forces reload (injectable clock or short TTL in test)

5. Optional: one worker-level test with mocked Supabase is nice but **not required** if cache tests are solid and download helper stays thin.

6. Update `apps/api` `test` script for the new file. Run typecheck + tests. Do **not** `npm start`.

7. Do **not** commit/push unless asked.

## Out of scope

- Changing upload route further (Agent 1)
- Caching `GET /uploads/media` (follow-up)
- Redis/disk cache, schema migrations, web UI
- Unblocking Supabase billing

## Done when

- Fan-out of identical `imageUrl` in one process → one Storage download (proven by tests with mock loader)
- Cache caps enforced
- Posts/reminders compressed on miss via Agent 1 helper; stickers not JPEG’d
- Brief summary + how to verify in DO logs (`cache hit` / `cache miss` lines)

END_AGENT_2_PROMPT
```

---

## After both agents

Human / ops:

1. Confirm Supabase egress restriction is lifted (upgrade or spend cap) — otherwise deploys won’t help sends.
2. Deploy API to DO (`nmcas-server.nmmedia.app`).
3. Smoke: schedule a 2+ community Value image post; confirm one download + cache hits in logs; confirm WhatsApp image quality acceptable.
4. Do not re-queue messages already sent manually during the outage.

---

## Optional single-agent mega-prompt (not preferred)

Only if you intentionally want one chat for both: concatenate Agent 1 then Agent 2 instructions, require compress module before cache wiring, and tell the model to finish Agent 1 tests before starting Agent 2. Prefer two chats for cleaner diffs and less context thrash.

---

*End of agent prompts source.*
