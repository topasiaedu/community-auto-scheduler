# Raw source: whatsmeow migration, production deploy, Value vs Reminder product model (2026-07-06)

**Type:** Engineering + product capture — session wrap-up for next implementation chat.
**Date:** 2026-07-06
**Scope:** `apps/api/` (whatsmeow-node, session blob, worker), `apps/web/` (Compose, Queue, Connect), `packages/db/`, Render + Vercel + Supabase production
**Related SOP reference:** WhatsApp Community SOP (example campaign: Dr Jasmine Show Up) — screenshot `nm-sop.vercel.app` (login required); user also provided PNG/PDF screencapture for ingest context. **Product decisions below are project-agnostic** (not Dr Jasmine–only).

---

## 1. Production deployment (achieved in session)

| Service | URL / role |
|---------|------------|
| **Render API** | `https://community-auto-scheduler.onrender.com` — Docker web service, whatsmeow-node + pg-boss |
| **Vercel web** | `https://community-auto-scheduler-web.vercel.app` — static Vite build; `VITE_API_URL` → Render API |
| **Supabase** | Postgres (pooler `DATABASE_URL`), Auth, Storage (`NMCAS_POST_MEDIA_BUCKET` for post images) |
| **GitHub** | `https://github.com/topasiaedu/community-auto-scheduler.git` |

### Deploy fixes encountered and resolved

- **`DATABASE_URL` on Render:** Must be valid `postgresql://` pooler URL. Malformed env caused Prisma P1012 at boot.
- **IPv6 / direct Supabase host:** Direct `db.*.supabase.co` unreachable from Render → use **session pooler**.
- **Pooler + `search_path`:** whatsmeow tables missing when session store pointed at pooler with wrong schema → moved WA session to **local SQLite + `WhatsAppSessionBlob` Postgres table** (commit `618c811`).
- **`WHATSAPP_STORE_URL`:** No longer required on Render; optional local override `file:./data/wa-sessions`.
- **Vercel:** `VITE_API_URL` must point at Render API origin for production API calls.
- **CORS:** `WEB_ORIGIN` must include exact Vercel preview/production origin.

### Render platform constraints (operational)

- Bind HTTP to `0.0.0.0:$PORT`.
- Ephemeral filesystem — WA sessions persist via **`WhatsAppSessionBlob`**, not local disk across deploys.
- Free tier spins down after ~15 min idle — scheduled sends need wake strategy (UptimeRobot or paid tier).
- Linux paths are case-sensitive.

---

## 2. whatsmeow-node migration (shipped)

Replaced **Baileys** with **`@whatsmeow-node/whatsmeow-node`** for community Announcements compatibility and **`messageSecret`** on sends (required for community reactions).

### Key files

| Area | Path |
|------|------|
| WA manager | `apps/api/src/wa/wa-manager.ts` |
| Sends | `apps/api/src/wa/wa-send.ts` |
| Session blob persist | `apps/api/src/wa/whatsapp-store.ts` |
| messageSecret helper | `apps/api/src/wa/message-secret.ts` |
| Worker | `apps/api/src/worker/send-scheduled-message.ts` |
| Migration | `packages/db/prisma/migrations/20260704090000_wa_session_blob/` |

### Session storage model (current)

- whatsmeow runs against **local SQLite** per project at runtime.
- SQLite bytes **hydrated from / persisted to** Postgres `WhatsAppSessionBlob` via Prisma + `DATABASE_URL`.
- Post images remain in Supabase Storage private bucket (unchanged).

### Post-migration operator notes

- Re-scan QR after migration — Baileys sessions do not carry over.
- Only **one API process** per project session; duplicate `npm run dev` or duplicate WA Web logins cause flaky status.
- P0 spike and `packages/wa-session-storage` are legacy Baileys only.

---

## 3. Web UI fixes shipped (Compose / Connect)

### QR code (commit `4c6f7d1`)

- Production API returned QR payload but UI stuck on "Generating QR…"
- Fix: **`qrcode.react` SVG** instead of `QRCode.toDataURL`.

### Community + Announcements picker (commits `9635092`, `9fa1e45`, `fbb0179`)

- Community detection via `getSubGroups` for likely parent JIDs.
- Compose: **Community** + **Channel** selects; `communityJid` as stable key.
- Hide channel row for standalone groups or single-channel communities.
- Duplicate community names get suffix `· …12345678` (last 8 digits of WhatsApp id).
- Layout: message type on own row (no overlap with Post/Poll toggle).

---

## 4. Product model decided (NOT yet implemented in code)

### 4.1 Two operator-facing message kinds

| Kind | Definition | Examples |
|------|------------|----------|
| **Value post** | **Fresh content written each campaign** — not from the SOP template library | Long teaching copy + custom image + caption; occasional **poll**; rare text-only |
| **Reminder** | **Anything predefined in the project SOP / asset pack** | Welcome graphic, **2-day / 1-day countdown graphics**, "starting soon", event-day **stickers**, other SOP slots |

**Critical rule (owner correction):** Countdown graphics (2 days, 1 day, starting soon) are **Reminders**, not Value posts. Value = you write new copy every time. Reminder = pick/upload the SOP asset.

**Intern one-liner:** "If it's in the SOP playbook → Reminder. If we're writing something new → Value."

### 4.2 Poll placement

- Poll is **not** a top-level sibling to Value/Reminder.
- Poll lives **under Value post** as a format option (alongside image+caption and text-only).
- Polls are used from time to time; **most Value posts are image + caption**.

### 4.3 Reminder media shapes

Reminders are defined by **SOP role**, not by file type:

| Reminder asset | Typical send | Caption |
|----------------|--------------|---------|
| **Sticker** (WebP, transparent) | `stickerMessage` | **None** (owner default) |
| **Countdown / welcome / SOP graphic** (PNG/JPEG) | `imageMessage` | **Usually none** — text baked into graphic |

**WhatsApp constraint:** One main media per announcement message. Do not combine sticker + caption in one message when SOP expects separate sends; schedule separate rows if text + link needed.

### 4.4 Multi-project (all campaigns)

- Each **Project** = own WA account, queue, communities, and **own SOP asset set**.
- No hardcoding for a single campaign (e.g. Dr Jasmine). Same flow, different content per project.
- Settings (planned): per-project **SOP URL**, campaign note, later **reminder template library**.

### 4.5 Current code vs decided model

**Still in repo today:**

```prisma
enum MessageType {
  POST
  POLL
}
```

- UI: top-level **Post | Poll** toggle.
- No **Reminder** type, no **sticker** upload/send, no Value/Reminder labels.
- Sticker send path researched but **not implemented** (session ended before build).

**Planned schema direction (implementation TBD):**

- Top-level: `VALUE` | `REMINDER` (or keep internal enums and map in UI).
- Value sub-format: `image_caption` | `poll` | `text_only`.
- Reminder: `stickerUrl` and/or `imageUrl` (SOP graphic), `copyText` null by default.
- Worker: `sendGroupSticker()` via whatsmeow `uploadMedia` + `sendRawMessage` with `stickerMessage` + `messageSecret` for communities.

---

## 5. UX / UI decisions (intern-friendly, minimal guidance)

**Target user (unchanged from PRD):** Any team member including interns — learnable with **minimal** (not zero) guidance.

### 5.1 Information architecture (proposed labels)

| Current nav | Proposed | Rationale |
|-------------|----------|-----------|
| Queue | Queue | Home — review what's going out |
| Compose | **Schedule** | Action verb |
| Connect | **WhatsApp** | Clear purpose |
| Settings | Settings | SOP link, campaign note |

### 5.2 Schedule screen — single page, four blocks

```
① Where     Community → Channel (usually Announcements)
② What kind [ Value post ] [ Reminder ]
③ Content   (progressive — see below)
④ When      MYT datetime + optional quick chips → Schedule / Save draft
```

Keep **one page** (not multi-step wizard). Sticky WhatsApp-style **preview** on the right (already exists).

### 5.3 Content by kind

**Value post** — format chips inside Value (not top-level):

- **Image + caption** (default, most common)
- **Poll** (nested fields — question + options)
- **Text only**

Validation in plain English (examples): "Add an image or switch to Text only." / "Caption required when image attached."

**Reminder** — no free-form caption by default:

- Upload or pick SOP asset (sticker or countdown image)
- Checkered preview for transparent stickers
- Helper: "Reminders send the asset only — no caption."

### 5.4 Safeguards for interns

- **Confirm modal** before Schedule: kind, destination, MYT time.
- Remember last community/channel per project (already implemented).
- Block past datetime; warn if WA disconnected (allow draft).
- Queue badges: `Value` + `Image|Poll|Text` or `Reminder` + `Sticker|Countdown`.
- Failed rows: one-sentence error + Re-queue (existing).
- Empty state checklist: Link WA → Schedule value → Add reminders → Check queue on send day.
- Per-project **SOP link** in Settings (external Notion/PDF/site — not in-app hardcoding).

### 5.5 Build order agreed for next session (not started)

1. UX rename + Value / Reminder structure; poll under Value
2. Reminder: sticker + SOP image send paths (usually no caption)
3. Confirm modal + queue badges
4. Settings: SOP URL + campaign note
5. Quick MYT time chips
6. Later: per-project reminder template library, event-relative scheduling

---

## 6. SOP workflow context (reference only)

Typical campaign **rhythm** (same across projects, different assets/copy):

| Phase | Operator kind | Notes |
|-------|---------------|-------|
| Day 0 welcome | Reminder | SOP welcome graphic/sticker |
| Mid-campaign teaching | Value | New long copy + custom image |
| Countdowns (2d, 1d, starting soon) | Reminder | SOP graphics |
| Event day nudges (1hr, 15min, live) | Reminder | Stickers (no caption) + sometimes separate text/link if needed |
| Occasional engagement | Value (poll) | Under Value format |

SOP operational notes observed: timing matters; verify Zoom/links on reminder slots; one image per announcement when posting to community channels.

---

## 7. Git / release notes

### Commits referenced (on `main` unless noted)

| Commit | Summary |
|--------|---------|
| `3ff5702` | whatsmeow-node migration |
| `4c6f7d1` | QR SVG fix |
| `618c811` | SQLite + `WhatsAppSessionBlob` session persist |
| `9635092` | Community + Announcements picker |
| `9fa1e45` | Dedupe by parent JID |
| `fbb0179` | Compose layout UX |

### Explicitly NOT pushed / NOT built (end of session)

- Sticker upload + `stickerMessage` send
- Value vs Reminder schema + UI overhaul
- Confirm modal, SOP template library, quick time chips

**Owner instruction:** Do not git push unless explicitly asked.

---

## 8. Local dev reminders

- `npm run dev` — API `:3001`, Vite `:5173` (do not run extra `npm start`/`build` if user already has dev servers).
- Migrations: `npm run db:deploy` from repo root.
- Test auth via `.env` `NMCAS_TEST_EMAIL` / `NMCAS_TEST_PASSWORD` when configured.

---

## 9. Open questions for next session

1. **Reminder v1:** Upload-only for SOP assets, or template picker per project in v1?
2. **Rare reminder with text:** Allow optional caption on Reminder, or always schedule a separate Value text row?
3. **API enum migration:** Rename `POST`/`POLL` to `VALUE`/`REMINDER` + `valueFormat`, or UI-only mapping first?
4. **Sticker bucket:** Same `NMCAS_POST_MEDIA_BUCKET` or separate bucket for WebP stickers?

---

*Immutable raw capture; wiki digest lives under `wiki/sources/`.*
