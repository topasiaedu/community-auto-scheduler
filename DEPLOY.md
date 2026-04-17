# Deploy NMCAS (Render API + Vercel web)

Hosting matches [`NMCAS-VAULT/wiki/overview.md`](NMCAS-VAULT/wiki/overview.md): **Render** runs the Node API (Baileys + pg-boss); **Vercel** serves the static Vite app; **Supabase** stays the DB + Storage + Auth.

## Prerequisites

- GitHub repo connected to both platforms.
- **Supabase** project: Postgres **session** URL (port `5432`) for `DATABASE_URL`, Storage buckets, Auth keys.
- **Do not** commit `.env`; configure variables in each platform’s dashboard.

---

## 1. Render — API with **Docker** (no Blueprint)

The repo includes a root [`Dockerfile`](Dockerfile): it runs `npm ci`, `npm run build:api`, then at **container start** runs `prisma migrate deploy` and `node apps/api/dist/index.js`. You do **not** need a Render Blueprint file.

### Create the Web Service

1. Render → **New** → **Web Service** → connect this repository.
2. **Environment:** **Docker** (not native Node).
3. **Dockerfile path:** `Dockerfile` (repo root).
4. **Instance type:** **Free** is allowed; see limitations below.
5. Add **Environment** variables (same table as below) before or right after the first deploy.

Render sets **`PORT`**; the API already listens on `process.env.PORT`.

**Health check path:** `/health` (optional but recommended).

### Free tier limitations

- **Cold starts / sleep:** Free web services **spin down** after idle time. First request can be slow; **pg-boss** and **Baileys** need a process that is actually running—if the instance is asleep, scheduled jobs will not run until something wakes the service. For reliable scheduling and WA, use a **paid** instance or another always-on host when you outgrow free tier.
- **No Blueprint required:** You configure the Docker service manually as above.

### Render environment variables

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Supabase Postgres **session** connection string (`:5432`). |
| `PORT` | Usually injected by Render; only set manually if your dashboard requires it. |
| `WEB_ORIGIN` | Your Vercel origins, comma-separated, e.g. `https://your-app.vercel.app`. |
| `DEFAULT_PROJECT_ID` | Default `nmcas-default-project` if you use seed. |
| `SUPABASE_URL` | Project URL. |
| `SUPABASE_ANON_KEY` | `anon` `public` key (JWT verification). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** — Storage + Baileys server-side. |
| `NMCAS_SESSION_BUCKET` | Private bucket name. |
| `NMCAS_POST_MEDIA_BUCKET` | Private bucket name. |
| `NMCAS_FAILURE_NOTIFY_MSISDN` | Optional; digits-only MSISDN for failure alerts. |

Optional: `DIRECT_URL` only if you later add Prisma `directUrl` for migrations behind PgBouncer (not required for typical Supabase session URL).

After deploy, note the public URL, e.g. `https://nmcas-api.onrender.com`.

### Local Docker (optional)

From the repo root:

```bash
docker build -t nmcas-api .
docker run --rm -p 3001:3001 --env-file .env nmcas-api
```

Use a real `.env` with `DATABASE_URL` and other vars; `PORT` in the container should match what the app expects (Render sets this automatically).

---

## 2. Vercel — Web (`@nmcas/web`)

1. **Add New Project** → import the same Git repository.
2. **Root directory:** repository root (default).
3. **Framework preset:** Other, or let `vercel.json` drive the build.
4. **Install command:** `npm ci`
5. **Build command:** `npm run build:web`
6. **Output directory:** `apps/web/dist`

### Vercel environment variables (Production / Preview)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | **HTTPS** base URL of the Render API, **no trailing slash**, e.g. `https://nmcas-api.onrender.com`. |
| `VITE_SUPABASE_URL` | Same Supabase project URL as the API. |
| `VITE_SUPABASE_ANON_KEY` | Same `anon` key as in the web app env locally. |

Redeploy after changing env vars so Vite embeds them at build time.

---

## 3. Smoke checks

- `GET https://<render-host>/health` → JSON with `ok: true`.
- `GET https://<render-host>/ready` → database + pg-boss OK.
- Open the Vercel URL: sign in, pick a project, confirm schedules and WhatsApp flows against production env.

---

## 4. Common issues

- **CORS:** `WEB_ORIGIN` must include the exact Vercel origin (`https://…`).
- **Migrations:** Fail at **container start** if `DATABASE_URL` is wrong; check Render logs for `prisma migrate deploy` errors.
- **Free tier sleep:** Not suitable for dependable cron-like behaviour; upgrade when you need reliability.
- **Mixed content:** Vercel is HTTPS; `VITE_API_URL` must be `https://`, not `http://`.
