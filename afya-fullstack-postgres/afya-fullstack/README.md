# AFYA — Full-Stack App (frontend + backend)

A working, runnable version of AFYA: a React front-end talking to a real Node/SQLite API with
genuine accounts, persistence, and role-based access. This is the demonstrable product you can
run locally, click through end-to-end, and show to partners while you pursue licensing.

```
afya/
  afya-backend/    Node + Express + SQLite API (auth, data, business rules)
  afya-frontend/   Vite + React client that calls the API
```

## Run it (two terminals)

**1) Backend**
```bash
cd afya-backend
npm install
cp .env.example .env        # edit JWT_SECRET
npm run seed                # demo accounts + data
npm start                   # http://localhost:4000
```

**2) Frontend**
```bash
cd afya-frontend
npm install
npm run dev                 # http://localhost:5173  (proxies /api → :4000)
```

Open http://localhost:5173 and sign in.

### Demo logins (password: demo1234)
- Patient → `mary@demo.com`
- Provider → `amina@demo.com`
- Admin → `admin@afya.co.ke`
- Pharmacy → `pharmacy@afya.co.ke`
- Lab → `lab@afya.co.ke`

Or create a brand-new patient/provider with **Create one** — it really registers in the database.

## What works end-to-end (real, persisted)
- **Auth** — signup/login with hashed passwords + JWT; refresh the page and you stay signed in.
- **Browse & book** — patient sees verified providers, books a slot; the take-rate is set server-side.
- **Visit lifecycle** — provider completes or marks no-show; patient cancels or rates.
- **Prescriptions & labs** — provider issues; pharmacy/lab advance status; lab publishes results.
- **Admin** — verify/decline providers; view the controlled-substance register + integrity metrics.
- **Server-enforced rules** — declining take-rate, message redaction, name masking, role guards.

## What is still NOT real (needs your accounts + approvals)
Same as the backend README: M-Pesa Daraja, a licensed drug-interaction database, lab/pharmacy
partner APIs, SHA, KRA eTIMS — and the regulatory clearances (KMPDC verification, fund-holding via a
CBK-licensed PSP, ODPC/Data Protection registration, Pharmacy & Poisons Board rules). The structure
is ready for them; the credentials and sign-offs are yours to obtain. **Do not put real patient data
in this until those are in place.**

See `AFYA-licensing-readiness.md` for exactly what each regulator expects and the order to tackle it.
