# AFYA — Deploying to a real URL

Your app is two pieces that deploy differently and then point at each other:

- **Backend** (`afya-backend`) — a long-running Node server with a SQLite file. Needs a host that keeps
  a process alive **and gives it a persistent disk**. Use **Render** or **Railway**. (Netlify/Vercel's
  default serverless model is wrong for this — it would wipe the database on every request/redeploy.)
- **Frontend** (`afya-frontend`) — static files after `npm run build`. Deploy to **Netlify** or **Vercel**.

---

## Step 1 — Put the code on GitHub
Create two repos (or one repo with both folders). Commit and push. `.gitignore` already excludes
`node_modules`, `.env`, and the `*.db` files.

## Step 2 — Deploy the backend (Render)
1. On Render → **New → Web Service** → connect the `afya-backend` repo.
2. Settings:
   - Build command: `npm install`
   - Start command: `npm start`
3. **Add a persistent disk** (Render → Disks): mount path e.g. `/data`, size 1 GB.
4. Environment variables:
   - `JWT_SECRET` = a long random string (`openssl rand -hex 32`)
   - `DB_PATH` = `/data/afya.db`   ← must live on the disk, or data is lost on redeploy
   - `CORS_ORIGIN` = your frontend URL (fill in after Step 3, e.g. `https://afya.netlify.app`)
5. Deploy. You'll get a URL like `https://afya-api.onrender.com`.
6. **Seed once** (optional, for demo data): in Render's Shell tab run `npm run seed`.
7. Check it: open `https://afya-api.onrender.com/api/health` — should return `{"ok":true,...}`.

> Note: free Render services sleep after inactivity, so the first request after idle is slow. Fine for
> a demo; use a paid tier for anything real.

## Step 3 — Deploy the frontend (Netlify or Vercel)
1. New site → connect the `afya-frontend` repo.
2. Build command: `npm run build` · Publish directory: `dist`
3. Environment variable:
   - `VITE_API_BASE` = `https://afya-api.onrender.com/api`   ← your backend URL + `/api`
4. Deploy. You'll get a URL like `https://afya.netlify.app`.

## Step 4 — Connect them
Go back to the backend's `CORS_ORIGIN` and set it to the exact frontend URL from Step 3, then redeploy
the backend. Now the browser is allowed to call the API.

Open the frontend URL and sign in. Done — it's live.

---

## Migrating off SQLite later
SQLite on a single disk is fine for a pilot. For real scale, move to **Postgres** (Render/Railway both
offer managed Postgres): swap `better-sqlite3` for a Postgres client in `db.js`, keep the same schema.
The rest of the code doesn't change.

## Before real users (not optional)
This deploys the *app*. It does **not** make you compliant. Per `AFYA-licensing-readiness.md`, you still
need: the legal entity, ODPC Certificate of Data Handler/Processor, Digital Health Agency platform
certification, real KMPDC provider verification, a CBK-licensed payment/escrow arrangement, a licensed
drug-interaction database, and HTTPS + rate limiting + audit logging. **Use only demo data until those
are in place.** Most hosts give HTTPS automatically; add rate limiting and logging before launch.
