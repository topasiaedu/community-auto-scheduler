# Raw source: Render OOM incident, local failover, DO API migration (2026-07-13 — 2026-07-16)

**Type:** Engineering + operations session — production incident, memory investigation, hosting migration.
**Date range:** 2026-07-13 through 2026-07-16
**Scope:** `apps/api/` (whatsmeow-node, pg-boss, memory tuning), Render → DigitalOcean API, Vercel web unchanged, Supabase unchanged
**Operator context:** Dr Jasmine production project (`cmresmpxn0000x1w6vet6i42z`); test **NMCAS** project removed from DB during incident response

---

## 1. Incident summary

Scheduled WhatsApp reminders were **missed** on:

| Slot | MYT | Status in DB |
|------|-----|----------------|
| Starting Soon (11 AM) | 2026-07-13 11:00 | Stuck `SENDING` → manually `CANCELLED` to prevent catch-up blast |
| Starting Soon (8 PM prior day) | 2026-07-12 20:00 | Same |

**Root cause (Render):** API on **Render free tier (512 MB)** repeatedly **OOM-killed** (`Ran out of memory (used over 512MB)`). Process crash-looped; pg-boss jobs did not complete; messages stuck in `SENDING`.

**Not caused by:** media image size alone. Primary pressure is **whatsmeow Go subprocess + 8.4 MB session SQLite hydrate** on connect, not steady-state send load.

---

## 2. Memory findings (`apps/api/data/mem-usage.jsonl`)

Instrumentation added: periodic `[mem]` logs + JSONL file (`mem-sample.ts`), exposed on `GET /health` → `memory`.

| Phase | Node RSS | waWarm | Notes |
|-------|----------|--------|-------|
| API idle (no WA) | ~110–120 MB | 0 | Fine on any host |
| WA connected steady | ~175–265 MB | 1 | Fine on laptop / with headroom |
| **WA connect spike** | **up to ~700 MB** | 1 | Heap only ~23 MB — native/Go, not V8 |
| During sends (laptop) | ~90–135 MB steady | 1 | Two successful blasts on local Mac |

**Conclusion:** Render 512 MB fails on **startup/reconnect spikes**, not on normal operation. Optimizations help margin; **more RAM or swap** required for reliable production.

### Code optimizations shipped (commit `16b811a`, 2026-07-13)

| Change | File(s) | Purpose |
|--------|---------|---------|
| `NODE_OPTIONS=--max-old-space-size=256` | `Dockerfile` | Leave headroom for Go RSS on 512 MB boxes |
| Idle WA eviction (10 min) + max 1 warm client | `wa-pool.ts` | Drop Go process when dashboard closed |
| Session persist 60s → 5 min + skip unchanged blob | `wa-manager.ts`, `whatsapp-store.ts` | Fewer 8 MB buffer spikes |
| JSONL mem log | `mem-sample.ts`, `index.ts` | Ops visibility |

**Not committed at session end:** `countdown_1h` template slot + related test/UI changes (local only).

---

## 3. Incident response actions (2026-07-13)

1. Identified 6 overdue `SENDING` rows + active pg-boss jobs for missed Starting Soon slots.
2. Set messages **`CANCELLED`** + cancelled pg-boss jobs to **block catch-up re-send** on recovery.
3. Ran API **locally on operator laptop** (`npm run dev`) while Render suspended — successful manual re-sends for Starting Soon to workshops **1.0, 2.0, 4.0**.
4. Added **`countdown_1h`** reminder slot (1 hour before event start) with image + copy; scheduled 7 PM MYT blast for same three groups.
5. Deleted empty test **NMCAS** project + orphan `WhatsAppSessionBlob` rows to reduce multi-client RAM risk.

---

## 4. Hosting decisions

### Render free tier — rejected for production API

- 512 MB hard limit; no swap.
- Prior wiki claim ([[wiki/sources/2026-04-21-stability-hardening-session]]) that Render free + UptimeRobot is adequate is **superseded** for whatsmeow-node workloads after Jul 2026 incident.

### DigitalOcean shared Droplet — adopted (2026-07-16)

| Item | Choice |
|------|--------|
| Droplet | Existing **512 MB** box (already runs `ltfpdf` / `nm-zwds-server` on port **3001**) |
| NMCAS API port | **3002** (`PORT=3002` in `.env`) — avoids `EADDRINUSE` with other app |
| Process manager | **PM2** (`pm2 start npm --name nmcas-api -- start`) |
| Swap | **2 GB** (already present or added) — absorbs ~700 MB connect spike with brief lag |
| TLS / domain | **nginx** + Let's Encrypt |
| Public API URL | **`https://nmcas-server.nmmedia.app`** |
| Web | **Unchanged on Vercel** — `community-auto-scheduler-web.vercel.app` |
| DB / Auth / Storage | **Unchanged Supabase** |

### Why domain required (not raw IP)

Vercel web is HTTPS. Browser blocks mixed content to `http://IP:3002`. Production needs HTTPS API URL in `VITE_API_URL`.

### DO vs Render cost note

- DO **2 GB Droplet ~$12/mo** cleaner than 512 MB + swap; operator chose **reuse existing 512 MB Droplet + swap** for cost.

### Critical cutover rule

**Never run Render API and DO API simultaneously** — both share same Supabase + pg-boss; double workers → duplicate sends.

---

## 5. Production configuration (DO)

### DNS

`nmcas-server.nmmedia.app` → A record → Droplet public IP

### nginx

Reverse proxy `nmcas-server.nmmedia.app` → `127.0.0.1:3002`

### Environment (API)

Same vars as Render (`DATABASE_URL`, Supabase keys, `NMCAS_POST_MEDIA_BUCKET`, etc.) plus:

```
PORT=3002
WEB_ORIGIN=https://community-auto-scheduler-web.vercel.app
```

### Vercel

```
VITE_API_URL=https://nmcas-server.nmmedia.app
```

Redeploy required after env change.

### Render

Service **suspended** after DO verified.

---

## 6. Show Up slot update: `countdown_1h`

SOP gap discovered during incident: missing **1-hour-before-live** reminder.

| Slot | Trigger | Format |
|------|---------|--------|
| `countdown_1h` | event start − 60 min | IMAGE + caption |

Inserted between `starting_soon` (day 0 @ 11:00) and `live_now` (start − 2 min). Seeded in `reminderTemplateDefaults.ts`; image uploaded to Supabase Storage for Dr Jasmine project.

---

## 7. Open questions / follow-up

- [ ] Commit + push `countdown_1h` template code and mem-log changes if not already on `main`.
- [ ] Monitor DO RAM + swap over next campaign week (`mem-usage.jsonl` on server if deployed).
- [ ] Consider dedicated **1–2 GB Droplet** for NMCAS if shared 512 MB box thrashes under dual-app load.
- [ ] Update `DEPLOY.md` with DO instructions (still Render-centric as of session end).
- [ ] Revisit wiki [[wiki/concepts/wa-connection-pool]] free-tier Render note — superseded.

---

## 8. Key URLs (post-migration)

| Service | URL |
|---------|-----|
| API (production) | `https://nmcas-server.nmmedia.app` |
| Web (production) | `https://community-auto-scheduler-web.vercel.app` |
| API (retired) | `https://community-auto-scheduler.onrender.com` (suspended) |
| GitHub | `https://github.com/topasiaedu/community-auto-scheduler.git` |

---

## 9. Smoke checks used

```bash
curl https://nmcas-server.nmmedia.app/health
curl https://nmcas-server.nmmedia.app/ready
pm2 list
pm2 logs nmcas-api
free -h   # swap active
```

Web: sign in → Dr Jasmine → WhatsApp connected → schedule queue visible.
