// server.js — AFYA API. Express + PostgreSQL. Enforces auth, roles, and business rules
// (declining take-rate, message redaction, name masking) server-side.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { pool, q, q1, initSchema } from "./db.js";
import { uid, takeRateForCount, scrubContact, maskedName } from "./lib.js";
import { hashPassword, verifyPassword, signToken, authenticate, requireAuth } from "./auth.js";

const app = express();
const corsOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(authenticate);

const ok = (res, data) => res.json(data);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
// wrap async handlers so thrown errors become clean 500s instead of crashing
const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e); if (!res.headersSent) bad(res, "Server error", 500);
});
const S = (v) => JSON.stringify(v ?? null);  // for JSONB inserts

/* ---------- shaping helpers ---------- */
function providerPublic(row) {
  return {
    id: row.user_id, name: row.name, specialty: row.specialty, price: row.price, bio: row.bio,
    county: row.county, subcounty: row.subcounty, modes: row.modes || [],
    availability: row.availability || [], rating: row.rating, reviews: row.reviews,
    verified: !!row.verified, rejected: !!row.rejected,
  };
}
const completedCountFor = async (patientId, providerId) =>
  Number((await q1(
    `SELECT COUNT(*)::int AS n FROM appointments WHERE patient_id=$1 AND provider_id=$2 AND status IN ('completed','noshow')`,
    [patientId, providerId])).n);
const notify = (toUser, text) =>
  pool.query("INSERT INTO notifications (id,to_user,text) VALUES ($1,$2,$3)", [uid("ntf"), toUser, text]);

/* ============================ AUTH ============================ */
const signupSchema = z.object({
  role: z.enum(["patient", "provider"]),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  county: z.string().optional(), subcounty: z.string().optional(),
  ward: z.string().optional(), location: z.string().optional(), sublocation: z.string().optional(),
  specialty: z.string().optional(),
  agree: z.boolean().optional(),
});

app.post("/api/auth/signup", h(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const b = parsed.data;
  if (!b.agree) return bad(res, "You must accept the non-circumvention terms");
  if (await q1("SELECT 1 FROM users WHERE email=$1", [b.email])) return bad(res, "Email already registered");

  const id = uid(b.role === "provider" ? "prov" : "pat");
  await pool.query("INSERT INTO users (id,role,name,email,password_hash) VALUES ($1,$2,$3,$4,$5)",
    [id, b.role, b.name, b.email, hashPassword(b.password)]);

  if (b.role === "patient") {
    await pool.query(
      `INSERT INTO patients (user_id,county,subcounty,ward,location,sublocation) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, b.county || "", b.subcounty || "", b.ward || "", b.location || "", b.sublocation || ""]);
  } else {
    await pool.query(
      `INSERT INTO providers (user_id,specialty,county,subcounty,verified) VALUES ($1,$2,$3,$4,false)`,
      [id, b.specialty || "General Practice", b.county || "", b.subcounty || ""]);
  }
  const user = await q1("SELECT id,role,name,email FROM users WHERE id=$1", [id]);
  ok(res, { token: signToken(user), user });
}));

app.post("/api/auth/login", h(async (req, res) => {
  const { email, password } = req.body || {};
  const u = await q1("SELECT * FROM users WHERE email=$1", [email || ""]);
  if (!u || !verifyPassword(password || "", u.password_hash)) return bad(res, "Invalid email or password", 401);
  ok(res, { token: signToken(u), user: { id: u.id, role: u.role, name: u.name, email: u.email } });
}));

app.get("/api/auth/me", requireAuth(), (req, res) => ok(res, { user: req.user }));

/* ============================ PROVIDERS ============================ */
app.get("/api/providers", h(async (req, res) => {
  const rows = (await q(`SELECT p.*, u.name, u.email FROM providers p JOIN users u ON u.id=p.user_id WHERE p.verified=true`));
  const viewerId = req.user?.id;
  const out = [];
  for (const r of rows) {
    const p = providerPublic(r);
    const rel = viewerId
      ? await q1("SELECT 1 FROM appointments WHERE patient_id=$1 AND provider_id=$2 LIMIT 1", [viewerId, r.user_id])
      : null;
    p.name = rel ? r.name : maskedName(r.name);
    out.push(p);
  }
  ok(res, out);
}));

app.get("/api/providers/:id", h(async (req, res) => {
  const row = await q1(`SELECT p.*, u.name, u.email FROM providers p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1`, [req.params.id]);
  if (!row) return bad(res, "Not found", 404);
  const p = providerPublic(row);
  const viewerId = req.user?.id;
  const rel = viewerId ? await q1("SELECT 1 FROM appointments WHERE patient_id=$1 AND provider_id=$2 LIMIT 1", [viewerId, row.user_id]) : null;
  p.name = rel ? row.name : maskedName(row.name);
  ok(res, p);
}));

app.patch("/api/providers/me", requireAuth("provider"), h(async (req, res) => {
  const { price, availability, bio } = req.body || {};
  const cur = await q1("SELECT * FROM providers WHERE user_id=$1", [req.user.id]);
  if (!cur) return bad(res, "Provider profile missing", 404);
  await pool.query("UPDATE providers SET price=$1, availability=$2, bio=$3 WHERE user_id=$4",
    [price ?? cur.price, S(availability ?? cur.availability), bio ?? cur.bio, req.user.id]);
  ok(res, { updated: true });
}));

/* ============================ APPOINTMENTS ============================ */
app.get("/api/appointments", requireAuth(), h(async (req, res) => {
  const { id, role } = req.user;
  const rows = role === "provider"
    ? await q("SELECT * FROM appointments WHERE provider_id=$1 ORDER BY created_at DESC", [id])
    : role === "patient"
      ? await q("SELECT * FROM appointments WHERE patient_id=$1 ORDER BY created_at DESC", [id])
      : await q("SELECT * FROM appointments ORDER BY created_at DESC");
  ok(res, rows);
}));

app.post("/api/appointments", requireAuth("patient"), h(async (req, res) => {
  const { providerId, slot, mode, location, price } = req.body || {};
  if (!providerId || !slot || !mode) return bad(res, "Missing booking details");
  const prov = await q1("SELECT * FROM providers WHERE user_id=$1", [providerId]);
  if (!prov || !prov.verified) return bad(res, "Provider unavailable", 404);

  const rate = takeRateForCount(await completedCountFor(req.user.id, providerId));
  const id = uid("appt");
  await pool.query(
    `INSERT INTO appointments (id,provider_id,patient_id,slot,mode,location,price,fee_rate,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'upcoming')`,
    [id, providerId, req.user.id, slot, mode, location || null, price ?? prov.price, rate]);

  const avail = (prov.availability || []).filter((s) => s !== slot);
  await pool.query("UPDATE providers SET availability=$1 WHERE user_id=$2", [S(avail), providerId]);

  await notify(providerId, "New booking · " + slot);
  await notify(req.user.id, "Booking confirmed · " + slot);
  ok(res, await q1("SELECT * FROM appointments WHERE id=$1", [id]));
}));

const setStatus = (id, status) => pool.query("UPDATE appointments SET status=$1 WHERE id=$2", [status, id]);

app.post("/api/appointments/:id/complete", requireAuth("provider"), h(async (req, res) => {
  const a = await q1("SELECT * FROM appointments WHERE id=$1", [req.params.id]);
  if (!a || a.provider_id !== req.user.id) return bad(res, "Not found", 404);
  await setStatus(a.id, "completed");
  await notify(a.patient_id, "Visit complete — please rate your provider");
  ok(res, { status: "completed" });
}));

app.post("/api/appointments/:id/noshow", requireAuth("provider"), h(async (req, res) => {
  const a = await q1("SELECT * FROM appointments WHERE id=$1", [req.params.id]);
  if (!a || a.provider_id !== req.user.id) return bad(res, "Not found", 404);
  await setStatus(a.id, "noshow");
  await notify(a.patient_id, "You were marked as a no-show; a fee applied per policy");
  ok(res, { status: "noshow" });
}));

app.post("/api/appointments/:id/cancel", requireAuth("patient"), h(async (req, res) => {
  const a = await q1("SELECT * FROM appointments WHERE id=$1", [req.params.id]);
  if (!a || a.patient_id !== req.user.id) return bad(res, "Not found", 404);
  await setStatus(a.id, "cancelled");
  const prov = await q1("SELECT * FROM providers WHERE user_id=$1", [a.provider_id]);
  if (prov) {
    const avail = prov.availability || [];
    if (!avail.includes(a.slot)) avail.push(a.slot);
    await pool.query("UPDATE providers SET availability=$1 WHERE user_id=$2", [S(avail), a.provider_id]);
  }
  await notify(a.provider_id, "A booking was cancelled · " + a.slot);
  ok(res, { status: "cancelled" });
}));

app.post("/api/appointments/:id/rate", requireAuth("patient"), h(async (req, res) => {
  const stars = Math.max(1, Math.min(5, Number(req.body?.stars) || 0));
  const a = await q1("SELECT * FROM appointments WHERE id=$1", [req.params.id]);
  if (!a || a.patient_id !== req.user.id) return bad(res, "Not found", 404);
  await pool.query("UPDATE appointments SET rating=$1 WHERE id=$2", [stars, a.id]);
  const prov = await q1("SELECT * FROM providers WHERE user_id=$1", [a.provider_id]);
  const n = prov.reviews + 1;
  const avg = Math.round(((prov.rating * prov.reviews + stars) / n) * 10) / 10;
  await pool.query("UPDATE providers SET rating=$1, reviews=$2 WHERE user_id=$3", [avg, n, a.provider_id]);
  await notify(a.provider_id, "You received a " + stars + "-star rating");
  ok(res, { rating: stars });
}));

/* ============================ PRESCRIPTIONS ============================ */
app.get("/api/prescriptions", requireAuth(), h(async (req, res) => {
  const { id, role } = req.user;
  const rows = role === "patient"
    ? await q("SELECT * FROM prescriptions WHERE patient_id=$1 ORDER BY created_at DESC", [id])
    : role === "provider"
      ? await q("SELECT * FROM prescriptions WHERE provider_id=$1 ORDER BY created_at DESC", [id])
      : await q("SELECT * FROM prescriptions ORDER BY created_at DESC");
  ok(res, rows); // JSONB columns already parsed
}));

app.post("/api/prescriptions", requireAuth("provider"), h(async (req, res) => {
  const { patientId, meds, note, pharmacy } = req.body || {};
  if (!patientId || !Array.isArray(meds) || !meds.length) return bad(res, "Missing prescription details");
  const id = uid("rx");
  await pool.query(
    `INSERT INTO prescriptions (id,provider_id,patient_id,pharmacy,meds,note,status)
     VALUES ($1,$2,$3,$4,$5,$6,'Sent to pharmacy')`,
    [id, req.user.id, patientId, S(pharmacy), S(meds), note || ""]);
  await notify(patientId, "New prescription sent to " + (pharmacy?.name || "a pharmacy"));
  await notify("pharmacy", "New prescription received");
  ok(res, { id });
}));

app.patch("/api/prescriptions/:id/status", requireAuth("pharmacy", "admin"), h(async (req, res) => {
  const { status } = req.body || {};
  const r = await q1("SELECT * FROM prescriptions WHERE id=$1", [req.params.id]);
  if (!r) return bad(res, "Not found", 404);
  await pool.query("UPDATE prescriptions SET status=$1 WHERE id=$2", [status, r.id]);
  if (status === "Ready for pickup") await notify(r.patient_id, "Your prescription is ready for pickup");
  ok(res, { status });
}));

/* ============================ LAB ORDERS ============================ */
app.get("/api/labs", requireAuth(), h(async (req, res) => {
  const { id, role } = req.user;
  const rows = role === "patient"
    ? await q("SELECT * FROM lab_orders WHERE patient_id=$1 ORDER BY created_at DESC", [id])
    : role === "provider"
      ? await q("SELECT * FROM lab_orders WHERE provider_id=$1 ORDER BY created_at DESC", [id])
      : await q("SELECT * FROM lab_orders ORDER BY created_at DESC");
  ok(res, rows);
}));

app.post("/api/labs", requireAuth("provider"), h(async (req, res) => {
  const { patientId, tests, note, lab } = req.body || {};
  if (!patientId || !Array.isArray(tests) || !tests.length) return bad(res, "Missing lab order details");
  const id = uid("lab");
  await pool.query(
    `INSERT INTO lab_orders (id,provider_id,patient_id,lab,tests,note,status)
     VALUES ($1,$2,$3,$4,$5,$6,'Awaiting sample')`,
    [id, req.user.id, patientId, S(lab), S(tests), note || ""]);
  await notify(patientId, "Lab order sent to " + (lab?.name || "a lab"));
  await notify("lab", "New lab order received");
  ok(res, { id });
}));

app.patch("/api/labs/:id/status", requireAuth("lab", "admin"), h(async (req, res) => {
  const { status, results } = req.body || {};
  const o = await q1("SELECT * FROM lab_orders WHERE id=$1", [req.params.id]);
  if (!o) return bad(res, "Not found", 404);
  await pool.query("UPDATE lab_orders SET status=$1, results=$2 WHERE id=$3",
    [status, results ? S(results) : (o.results ? S(o.results) : null), o.id]);
  if (status === "Results ready") {
    await notify(o.patient_id, "Your lab results are ready");
    await notify(o.provider_id, "Results are in for your patient");
  }
  ok(res, { status });
}));

/* ============================ MESSAGES ============================ */
app.get("/api/messages", requireAuth(), h(async (req, res) => {
  const { providerId, patientId } = req.query;
  if (!providerId || !patientId) return bad(res, "providerId and patientId required");
  if (req.user.role === "patient" && req.user.id !== patientId) return bad(res, "Forbidden", 403);
  if (req.user.role === "provider" && req.user.id !== providerId) return bad(res, "Forbidden", 403);
  ok(res, await q("SELECT * FROM messages WHERE provider_id=$1 AND patient_id=$2 ORDER BY created_at ASC", [providerId, patientId]));
}));

app.post("/api/messages", requireAuth("patient", "provider"), h(async (req, res) => {
  const { providerId, patientId, text } = req.body || {};
  if (!providerId || !patientId || !text?.trim()) return bad(res, "Missing message");
  if (req.user.role === "patient" && req.user.id !== patientId) return bad(res, "Forbidden", 403);
  if (req.user.role === "provider" && req.user.id !== providerId) return bad(res, "Forbidden", 403);

  const { clean, blocked } = scrubContact(text.trim());
  const id = uid("msg");
  await pool.query(`INSERT INTO messages (id,provider_id,patient_id,from_role,text,redacted) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, providerId, patientId, req.user.role, clean, blocked]);
  if (!blocked) await notify(req.user.role === "provider" ? patientId : providerId, "New secure message");
  ok(res, { id, redacted: blocked, text: clean });
}));

/* ============================ NOTIFICATIONS ============================ */
const notifKey = (u) => (["admin", "pharmacy", "lab"].includes(u.role) ? u.role : u.id);
app.get("/api/notifications", requireAuth(), h(async (req, res) =>
  ok(res, await q("SELECT * FROM notifications WHERE to_user=$1 ORDER BY created_at DESC LIMIT 50", [notifKey(req.user)]))));
app.post("/api/notifications/read", requireAuth(), h(async (req, res) => {
  await pool.query("UPDATE notifications SET read=true WHERE to_user=$1", [notifKey(req.user)]);
  ok(res, { ok: true });
}));

/* ============================ ADMIN ============================ */
app.get("/api/admin/providers", requireAuth("admin"), h(async (_req, res) =>
  ok(res, (await q(`SELECT p.*, u.name, u.email FROM providers p JOIN users u ON u.id=p.user_id`)).map(providerPublic))));

app.post("/api/admin/providers/:id/verify", requireAuth("admin"), h(async (req, res) => {
  await pool.query("UPDATE providers SET verified=true, rejected=false WHERE user_id=$1", [req.params.id]);
  await notify(req.params.id, "Your account has been verified — you're now live on afya");
  ok(res, { verified: true });
}));
app.post("/api/admin/providers/:id/reject", requireAuth("admin"), h(async (req, res) => {
  await pool.query("UPDATE providers SET verified=false, rejected=true WHERE user_id=$1", [req.params.id]);
  ok(res, { rejected: true });
}));

app.get("/api/admin/controlled", requireAuth("admin"), h(async (_req, res) => {
  const rows = await q("SELECT * FROM prescriptions ORDER BY created_at DESC");
  const blocked = Number((await q1("SELECT COUNT(*)::int AS n FROM messages WHERE redacted=true")).n);
  const totalMsgs = Number((await q1("SELECT COUNT(*)::int AS n FROM messages")).n);
  ok(res, { prescriptions: rows, integrity: { blockedContactAttempts: blocked, totalMessages: totalMsgs } });
}));

/* ---------- health check ---------- */
app.get("/api/health", (_req, res) => ok(res, { ok: true, ts: new Date().toISOString() }));

const PORT = process.env.PORT || 4000;
initSchema()
  .then(() => app.listen(PORT, () => console.log(`AFYA API listening on http://localhost:${PORT}`)))
  .catch((e) => { console.error("Failed to init schema:", e); process.exit(1); });

export default app;
