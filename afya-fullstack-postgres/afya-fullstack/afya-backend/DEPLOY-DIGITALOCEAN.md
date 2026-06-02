# Deploying AFYA on DigitalOcean (App Platform + Managed Postgres)

You'll create three things in DigitalOcean, all from your GitHub repo:
1. a **Managed Postgres** database
2. a **backend** service (the Node API)
3. a **static site** (the React frontend)

## Step 1 — Create the database
1. Left sidebar → **Databases** → **Create Database Cluster**.
2. Engine: **PostgreSQL**. Smallest plan is fine to start.
3. After it's created, open it → **Connection Details** → copy the **Connection String**
   (looks like `postgres://doadmin:...@...ondigitalocean.com:25060/defaultdb?sslmode=require`).
   You'll paste this into the backend as `DATABASE_URL`.

## Step 2 — Create the backend (App Platform)
1. Sidebar → **App Platform** → **Create App** → connect GitHub → pick the **AFYA** repo.
2. When it detects components, set the backend component's **Source Directory** = `afya-backend`.
3. **Build command:** `npm install`  ·  **Run command:** `npm start`
4. **Environment variables** (App-level or component-level):
   - `DATABASE_URL` = the connection string from Step 1
   - `JWT_SECRET`  = a long random string
   - `CORS_ORIGIN` = your frontend URL (fill after Step 3)
5. Resource type: **Web Service**. HTTP port: **4000** (or set `PORT` env var to match).
6. Deploy. Once live, open `https://<your-app>.ondigitalocean.app/api/health` → `{"ok":true}`.
7. **Seed demo data once:** App → **Console** tab → run `npm run seed`.

> The schema is created automatically on first boot (initSchema runs at startup).

## Step 3 — Create the frontend (Static Site)
1. In the same App → **Create / Add Resource** → **Static Site** → same repo.
2. **Source Directory** = `afya-frontend`  ·  **Build command** = `npm run build`  ·  **Output dir** = `dist`
3. Environment variable: `VITE_API_BASE` = your backend URL + `/api`
   (e.g. `https://<your-app>.ondigitalocean.app/api`)
4. Deploy.

## Step 4 — Connect them
Set the backend's `CORS_ORIGIN` to the frontend's URL, redeploy the backend. Open the frontend URL and sign in.

## Notes
- Postgres data **persists** across redeploys (unlike the old SQLite-on-disk approach).
- Keep `DATABASE_URL` and `JWT_SECRET` only in DigitalOcean's env settings — never in the repo.
- Before real patients: ODPC certificate, platform certification, provider verification, CBK-licensed
  payments, licensed drug DB. See AFYA-licensing-readiness.md. Demo data only until then.
