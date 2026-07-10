# Raw source: P7 campaign scheduler shipped + UX harden (2026-07-08)

**Type:** Engineering + product session wrap-up (source of truth for wiki ingest).  
**Date:** 2026-07-08  
**Scope:** P7 end-to-end — schema, API, worker, Schedule/Settings/Queue UI, SOP caption lock, live deploy kickoff  
**Git:** commit `8f7d1c1` on `main` → `origin/main` (`feat: ship P7 campaign scheduler (Show Up reminders + Value/Reminder UX)`)  
**Related:** [[wiki/analysis/p7-implementation-plan]], [[wiki/analysis/p7-ux-spec]], `raw/sources/2026-07-07-whatsapp-community-sop-dr-jasmine-show-up-reference.md`

---

## 1. Session outcome

P7 (Value / Reminder + campaign scheduler) was **implemented, committed, and pushed** to `main` for production testing. Owner wraps session here; **full live E2E acceptance still pending** after Render migration + Vercel/API redeploy.

Local work earlier: unit tests / typecheck green (Phase 7 lint entry). Production was pre-P7 until this push.

---

## 2. What shipped in code

### Data / API / worker

- Prisma: `Campaign`, `ReminderTemplate`, `OperatorKind` / `ValueFormat` / `ReminderFormat`, `ScheduledMessage` extensions, `Project.sopUrl` / `campaignNote`
- Migration: `packages/db/prisma/migrations/20260708170000_p7_phase1_campaign_schema/`
- Routes: `GET/PATCH /templates`, `POST /campaigns/schedule`, uploads `post|reminder-image|sticker`, extended `GET /messages` (campaign webinar date + reminder slot)
- Worker: routes by `operatorKind` + formats; `sendGroupSticker`; legacy `POST`/`POLL` fallback
- Seed / ensure: six Reminder template slots; `ensureReminderTemplates` refreshes SOP `bodyTemplate` while preserving uploaded media

### Web

- Nav: **Queue / Schedule / WhatsApp / Settings** (`/compose` → `/schedule`, `/connect` → `/whatsapp`)
- **Schedule:** Campaign | Single message modes
- **Campaign wizard (final shape):** 4 steps — Campaign details → Reminder destination → Show Up review → Confirm  
  (Value posts **removed** from campaign flow — use Single message for fan-out Value posts)
- **Settings:** SOP URL, campaign note, Reminder template library
- **Queue:** campaign grouping, Reminder/Value badges, previews, kind filters, empty-state checklist

### Docs (vault)

- `wiki/analysis/p7-ux-spec.md` + reconciled concept/entity pages (earlier same day)

---

## 3. Product / UX decisions locked during testing (supersede earlier plan bullets where they conflict)

| Topic | Decision |
|-------|----------|
| Campaign purpose | **Show Up reminders only** (not Value posts in the wizard) |
| Value posts | Schedule via **Single message** — fan out to all community Announcements channels |
| Wizard steps | **4 steps** (not 5) — no Value step |
| Custom Values UI | Intern enters **webinar date + event start + Zoom link/ID/passcode** only; day/date/time/session strings **derived** for merge |
| Placeholders | Examples / placeholders for Zoom fields; derived preview line on Step 1 |
| SOP captions | Defaults transcribed from Dr Jasmine Show Up SOP PDF (`raw/assets/2026-07-06-dr-jasmine-show-up-whatsapp-community-sop.pdf`) into `packages/db/src/reminderTemplateDefaults.ts` — long Welcome / 2-Day / 1-Day / Starting Soon / LIVE NOW copy |
| Post-live sticker | **Optional** — no WebP required to schedule; skipped until sticker uploaded; Settings shows “Optional” |
| Vite env | `apps/web/vite.config.ts` `envDir` = monorepo root so root `.env` `VITE_SUPABASE_*` loads |
| Storage / DB | Localhost uploads using shared Supabase = **same** Storage + Postgres as prod (if `.env` matches Render) |

---

## 4. Show Up slots still in force (MYT)

| Slot | Trigger | Format | Asset required for campaign? |
|------|---------|--------|------------------------------|
| Welcome | webinarDate − 4d @ 15:00 | IMAGE + SOP caption | Yes |
| 2-Day Countdown | webinarDate − 2d @ 15:00 | IMAGE + SOP caption | Yes |
| 1-Day Countdown | webinarDate − 1d @ 20:00 | IMAGE + SOP caption | Yes |
| Starting Soon | webinarDate @ 11:00 | IMAGE + SOP caption | Yes |
| LIVE NOW | eventStart − 2 min | TEXT | Yes (body template) |
| Post-Live Sticker | eventStart + 18 min | STICKER | **No** (skipped if missing) |

Destination: all scheduled Show Up rows → **one** chosen community channel per campaign.  
Value posts (separately): fan out → **all** Announcements channels.

---

## 5. Local UX bugs fixed in session

1. Supabase “not configured” despite root `.env` → Vite `envDir` fix  
2. Show Up review infinite “Loading templates…” / flashing → unstable `vm` dep on template load; stabilize on `authorizedFetch`  
3. Redundant Custom Values vs date pickers → derive + Zoom-only form  
4. Value step confusion → remove from campaign; document Single message path  
5. Placeholder SOP copy ≠ real SOP → OCR/transcribe full captions into seed defaults + refresh on `/templates`  
6. Missing sticker WebP blocking campaign → sticker optional  

---

## 6. Deploy / live test checklist (owner next)

1. Wait for **Render** API deploy of `8f7d1c1`  
2. Confirm migration `20260708170000_p7_phase1_campaign_schema` applied (`db:deploy` / Render logs)  
3. Wait for **Vercel** web deploy  
4. On a **test** project: Settings → upload reminder images (sticker optional) → Schedule Show Up campaign → Queue  
5. Spot-check: merged SOP captions, times, Reminder destination, optional sticker skipped, Single message Value fan-out  

**Note:** Do not git push without explicit ask remains standing owner rule for future sessions; this session **explicitly** requested commit + push.

---

## 7. Explicitly not done / deferred

- Post-live sticker WebP library / in-app WA sticker picker parity (upload later)  
- Campaign Value post step / alternate-day Value UX in campaign wizard  
- Editable per-slot clock times  
- Bulk edit/delete campaign after confirm  
- Full production §11 acceptance matrix (pending after deploy)  
- Re-auth Render MCP for deploy tooling (optional)

---

## 8. Key code paths

| Area | Path |
|------|------|
| SOP seed captions | `packages/db/src/reminderTemplateDefaults.ts` |
| Campaign schedule API | `apps/api/src/routes/campaigns.ts` |
| Templates | `apps/api/src/routes/templates.ts` |
| Campaign wizard | `apps/web/src/components/schedule/CampaignWizard.tsx` |
| Derived Custom Values | `apps/web/src/lib/deriveCustomValues.ts` |
| Template readiness / optional sticker | `apps/web/src/lib/templateValidation.ts` |
| UX / API agent spec | `NMCAS-VAULT/wiki/analysis/p7-ux-spec.md` |

---

*Immutable raw capture; wiki digest under `wiki/sources/`.*
