# AFYA — Backend Foundation

The persistence + auth + API layer for AFYA. This turns the prototype from an in-memory demo
into something where **accounts, bookings, prescriptions, lab orders, and messages actually persist**,
with **real authentication** (hashed passwords + JWT) and **role-based access** enforced on the server.

> Status: foundation. Real integrations (M-Pesa, lab/pharmacy APIs, licensed drug database, SHA, eTIMS)
> and regulatory steps are **not** included — they require your registered business, credentials, and
> approvals. See "What's intentionally not here" below.

## Stack
- **Node + Express** — API server
- **SQLite** (better-sqlite3) — zero-setup database; a single `afya.db` file. Swap to Postgres later.
- **bcrypt** — password hashing
- **JWT** — stateless sessions
- **zod** — request validation

## Run it (on your machine)
```bash
cd afya-backend
npm install
cp .env.example .env        # then edit JWT_SECRET
npm run seed                # creates demo accounts + data
npm start                   # API at http://localhost:4000
```
Health check: `curl http://localhost:4000/api/health`

### Demo logins (password: `demo1234`)
| Role | Email |
|------|-------|
| Patient | mary@demo.com |
| Provider | amina@demo.com |
| Admin | admin@afya.co.ke |
| Pharmacy | pharmacy@afya.co.ke |
| Lab | lab@afya.co.ke |

## API (all JSON; protected routes need `Authorization: Bearer <token>`)

**Auth**
- `POST /api/auth/signup` — `{role, name, email, password, agree, ...location/specialty}` → `{token, user}`
- `POST /api/auth/login` — `{email, password}` → `{token, user}`
- `GET  /api/auth/me`

**Providers**
- `GET  /api/providers` — verified only; names masked until you've booked them
- `GET  /api/providers/:id`
- `PATCH /api/providers/me` — provider edits price / availability / bio

**Appointments**
- `GET  /api/appointments` — scoped to the logged-in user (admin sees all)
- `POST /api/appointments` — patient books; **take-rate computed server-side**, slot removed from availability
- `POST /api/appointments/:id/complete | /noshow` — provider
- `POST /api/appointments/:id/cancel` — patient; slot returned to availability
- `POST /api/appointments/:id/rate` — patient; updates provider rating

**Prescriptions** — `GET /api/prescriptions`, `POST /api/prescriptions` (provider), `PATCH /api/prescriptions/:id/status` (pharmacy/admin)

**Lab orders** — `GET /api/labs`, `POST /api/labs` (provider), `PATCH /api/labs/:id/status` (lab/admin; attaches results)

**Messages** — `GET /api/messages?providerId=&patientId=`, `POST /api/messages`
(contact details are **redacted on the server** before storage — clients can't bypass it)

**Notifications** — `GET /api/notifications`, `POST /api/notifications/read`

**Admin** — `GET /api/admin/providers`, `POST /api/admin/providers/:id/verify | /reject`,
`GET /api/admin/controlled` (controlled-substance register + integrity metrics)

## Business rules enforced server-side (not trustable to the client)
- **Declining take-rate** — 20% first visit with a provider, 15% on visits 2–3, 10% after. Stored per appointment.
- **Contact redaction** — phone/email/off-platform-app patterns stripped from messages.
- **Name masking** — provider names show first-name + last-initial until the viewer has an appointment with them.
- **Role access** — every route checks the JWT role; e.g. only a provider can prescribe, only a pharmacy/admin can change Rx status.
- **Provider verification gate** — unverified providers never appear in browse and can't be booked.

## Connecting the existing front-end
The prototype (`afya-marketplace.jsx`) currently holds state in React. To use this API, replace the
in-memory handlers with `fetch` calls to the endpoints above, store the returned `token`, and send it
as a `Bearer` header. The data shapes match what the components already expect.

## What's intentionally NOT here (and why)
These need **your** real-world accounts, paid licences, or regulatory approval — they can't be coded into existence:
- **M-Pesa Daraja** — real Safaricom business credentials; money cannot move without them.
- **Licensed drug-interaction DB** — First Databank / Medi-Span / DrugBank under licence. The prototype's
  starter set is unsafe for real prescribing.
- **Lab / pharmacy integrations** — signed partner agreements + API keys (e.g. Cerba Lancet).
- **SHA, KRA eTIMS** — tied to your registered entity.
- **Regulatory clearance** — KMPDC provider verification, fund-holding via a CBK-licensed PSP,
  Data Protection Act / ODPC registration, Pharmacy & Poisons Board rules for controlled drugs.

`.env.example` has placeholders for each so the structure is ready when you have them.

## Security notes before any real use
- Set a strong `JWT_SECRET`; never commit `.env`.
- Add HTTPS (behind a reverse proxy), rate limiting, and audit logging.
- The controlled-substance register and patient data must be access-logged and restricted to authorised staff.
- Get the regulatory items above signed off **before** onboarding a single real patient.
