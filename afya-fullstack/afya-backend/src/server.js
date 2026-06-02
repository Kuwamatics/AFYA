// server.js — AFYA API. Express + SQLite. Enforces auth, roles, and the business rules
// (declining take-rate, message redaction, name masking) server-side so the client can't bypass them.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { db, initSchema } from "./db.js";
import { uid, j, takeRateForCount, scrubContact, maskedName } from "./lib.js";
import { hashPassword, verifyPassword, signToken, authenticate, requireAuth } from "./auth.js";

initSchema();
const app = express();
// In production set CORS_ORIGIN to your frontend URL (e.g. https://afya.netlify.app).
// Left unset, it allows all origins — fine for local dev only.
const corsOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(authenticate);

const ok = (res, data) => res.json(data);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

/* ---------- helpers that assemble full records from the tables ---------- */
const userRow = (id) => db.prepare("SELECT id, role, name, email FROM users WHERE id = ?").get(id);
function providerPublic(row) {
  // shape the client expects; full name only included where caller decides
  return {
    id: row.user_id, name: row.name, specialty: row.specialty, price: row.price, bio: row.bio,
    county: row.county, subcounty: row.subcounty, modes: j(row.modes, []),
    availability: j(row.availability, []), rating: row.rating, reviews: row.reviews,
    verified: !!row.verified, rejected: !!row.rejected,
  };
}
const providerJoin = () => db.prepare(
  `SELECT p.*, u.name, u.email FROM providers p JOIN users u ON u.id = p.user_id`
);
const completedCountFor = (patientId, providerId) =>
  db.prepare(`SELECT COUNT(*) n FROM appointments WHERE patient_id=? AND provider_id=? AND status IN ('completed','noshow')`)
    .get(patientId, providerId).n;
const notify = (toUser, text) =>
  db.prepare("INSERT INTO notifications (id,to_user,text) VALUES (?,?,?)").run(uid("ntf"), toUser, text);

/* ============================ AUTH ============================ */
const signupSchema = z.object({
  role: z.enum(["patient", "provider"]),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  // patient location / provider profile fields (optional, role-dependent)
  county: z.string().optional(), subcounty: z.string().optional(),
  ward: z.string().optional(), location: z.string().optional(), sublocation: z.string().optional(),
  specialty: z.string().optional(),
  agree: z.boolean().optional(),
});

app.post("/api/auth/signup", (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues[0].message);
  const b = parsed.data;
  if (!b.agree) return bad(res, "You must accept the non-circumvention terms");
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(b.email)) return bad(res, "Email already registered");

  const id = uid(b.role === "provider" ? "prov" : "pat");
  db.prepare("INSERT INTO users (id,role,name,email,password_hash) VALUES (?,?,?,?,?)")
    .run(id, b.role, b.name, b.email, hashPassword(b.password));

  if (b.role === "patient") {
    db.prepare(`INSERT INTO patients (user_id,county,subcounty,ward,location,sublocation) VALUES (?,?,?,?,?,?)`)
      .run(id, b.county || "", b.subcounty || "", b.ward || "", b.location || "", b.sublocation || "");
  } else {
    db.prepare(`INSERT INTO providers (user_id,specialty,county,subcounty,verified) VALUES (?,?,?,?,0)`)
      .run(id, b.specialty || "General Practice", b.county || "", b.subcounty || "");
  }
  const user = userRow(id);
  ok(res, { token: signToken(user), user });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email || "");
  if (!u || !verifyPassword(password || "", u.password_hash)) return bad(res, "Invalid email or password", 401);
  ok(res, { token: signToken(u), user: { id: u.id, role: u.role, name: u.name, email: u.email } });
});

app.get("/api/auth/me", requireAuth(), (req, res) => ok(res, { user: req.user }));

/* ============================ PROVIDERS (browse) ============================ */
// Public browse — only verified providers; names masked until the caller is a paying patient
// who has an appointment with that provider.
app.get("/api/providers", (req, res) => {
  const rows = providerJoin().all().filter((r) => r.verified);
  const viewerId = req.user?.id;
  const out = rows.map((r) => {
    const p = providerPublic(r);
    const hasRelationship = viewerId
      ? !!db.prepare("SELECT 1 FROM appointments WHERE patient_id=? AND provider_id=? LIMIT 1").get(viewerId, r.user_id)
      : false;
    p.name = hasRelationship ? r.name : maskedName(r.name); // full name only after booking
    return p;
  });
  ok(res, out);
});

app.get("/api/providers/:id", (req, res) => {
  const r = providerJoin().get ? null : null; // placeholder to keep shape; real query below
  const row = db.prepare(`SELECT p.*, u.name, u.email FROM providers p JOIN users u ON u.id=p.user_id WHERE p.user_id=?`).get(req.params.id);
  if (!row) return bad(res, "Not found", 404);
  const p = providerPublic(row);
  const viewerId = req.user?.id;
  const hasRelationship = viewerId
    ? !!db.prepare("SELECT 1 FROM appointments WHERE patient_id=? AND provider_id=? LIMIT 1").get(viewerId, row.user_id)
    : false;
  p.name = hasRelationship ? row.name : maskedName(row.name);
  ok(res, p);
});

// Provider edits own price / availability
app.patch("/api/providers/me", requireAuth("provider"), (req, res) => {
  const { price, availability, bio } = req.body || {};
  const cur = db.prepare("SELECT * FROM providers WHERE user_id=?").get(req.user.id);
  if (!cur) return bad(res, "Provider profile missing", 404);
  db.prepare("UPDATE providers SET price=?, availability=?, bio=? WHERE user_id=?")
    .run(price ?? cur.price, JSON.stringify(availability ?? j(cur.availability, [])), bio ?? cur.bio, req.user.id);
  ok(res, { updated: true });
});

/* ============================ APPOINTMENTS ============================ */
app.get("/api/appointments", requireAuth(), (req, res) => {
  const { id, role } = req.user;
  const rows = role === "provider"
    ? db.prepare("SELECT * FROM appointments WHERE provider_id=? ORDER BY created_at DESC").all(id)
    : role === "patient"
      ? db.prepare("SELECT * FROM appointments WHERE patient_id=? ORDER BY created_at DESC").all(id)
      : db.prepare("SELECT * FROM appointments ORDER BY created_at DESC").all(); // admin
  ok(res, rows);
});

app.post("/api/appointments", requireAuth("patient"), (req, res) => {
  const { providerId, slot, mode, location, price } = req.body || {};
  if (!providerId || !slot || !mode) return bad(res, "Missing booking details");
  const prov = db.prepare("SELECT * FROM providers WHERE user_id=?").get(providerId);
  if (!prov || !prov.verified) return bad(res, "Provider unavailable", 404);

  // declining take-rate computed server-side from prior completed visits
  const rate = takeRateForCount(completedCountFor(req.user.id, providerId));
  const id = uid("appt");
  db.prepare(`INSERT INTO appointments (id,provider_id,patient_id,slot,mode,location,price,fee_rate,status)
              VALUES (?,?,?,?,?,?,?,?,'upcoming')`)
    .run(id, providerId, req.user.id, slot, mode, location || null, price ?? prov.price, rate);

  // remove the slot from the provider's open availability
  const avail = j(prov.availability, []).filter((s) => s !== slot);
  db.prepare("UPDATE providers SET availability=? WHERE user_id=?").run(JSON.stringify(avail), providerId);

  notify(providerId, "New booking · " + slot);
  notify(req.user.id, "Booking confirmed · " + slot);
  ok(res, db.prepare("SELECT * FROM appointments WHERE id=?").get(id));
});

const setApptStatus = (id, status) => db.prepare("UPDATE appointments SET status=? WHERE id=?").run(status, id);

app.post("/api/appointments/:id/complete", requireAuth("provider"), (req, res) => {
  const a = db.prepare("SELECT * FROM appointments WHERE id=?").get(req.params.id);
  if (!a || a.provider_id !== req.user.id) return bad(res, "Not found", 404);
  setApptStatus(a.id, "completed");
  notify(a.patient_id, "Visit complete — please rate your provider");
  ok(res, { status: "completed" });
});

app.post("/api/appointments/:id/noshow", requireAuth("provider"), (req, res) => {
  const a = db.prepare("SELECT * FROM appointments WHERE id=?").get(req.params.id);
  if (!a || a.provider_id !== req.user.id) return bad(res, "Not found", 404);
  setApptStatus(a.id, "noshow");
  notify(a.patient_id, "You were marked as a no-show; a fee applied per policy");
  ok(res, { status: "noshow" });
});

app.post("/api/appointments/:id/cancel", requireAuth("patient"), (req, res) => {
  const a = db.prepare("SELECT * FROM appointments WHERE id=?").get(req.params.id);
  if (!a || a.patient_id !== req.user.id) return bad(res, "Not found", 404);
  setApptStatus(a.id, "cancelled");
  // return the slot to the provider's availability
  const prov = db.prepare("SELECT * FROM providers WHERE user_id=?").get(a.provider_id);
  if (prov) {
    const avail = j(prov.availability, []);
    if (!avail.includes(a.slot)) avail.push(a.slot);
    db.prepare("UPDATE providers SET availability=? WHERE user_id=?").run(JSON.stringify(avail), a.provider_id);
  }
  notify(a.provider_id, "A booking was cancelled · " + a.slot);
  ok(res, { status: "cancelled" });
});

app.post("/api/appointments/:id/rate", requireAuth("patient"), (req, res) => {
  const stars = Math.max(1, Math.min(5, Number(req.body?.stars) || 0));
  const a = db.prepare("SELECT * FROM appointments WHERE id=?").get(req.params.id);
  if (!a || a.patient_id !== req.user.id) return bad(res, "Not found", 404);
  db.prepare("UPDATE appointments SET rating=? WHERE id=?").run(stars, a.id);
  const prov = db.prepare("SELECT * FROM providers WHERE user_id=?").get(a.provider_id);
  const n = prov.reviews + 1;
  const avg = Math.round(((prov.rating * prov.reviews + stars) / n) * 10) / 10;
  db.prepare("UPDATE providers SET rating=?, reviews=? WHERE user_id=?").run(avg, n, a.provider_id);
  notify(a.provider_id, "You received a " + stars + "★ rating");
  ok(res, { rating: stars });
});

/* ============================ PRESCRIPTIONS ============================ */
app.get("/api/prescriptions", requireAuth(), (req, res) => {
  const { id, role } = req.user;
  const rows = role === "patient"
    ? db.prepare("SELECT * FROM prescriptions WHERE patient_id=? ORDER BY created_at DESC").all(id)
    : role === "provider"
      ? db.prepare("SELECT * FROM prescriptions WHERE provider_id=? ORDER BY created_at DESC").all(id)
      : db.prepare("SELECT * FROM prescriptions ORDER BY created_at DESC").all(); // admin/pharmacy
  ok(res, rows.map((r) => ({ ...r, pharmacy: j(r.pharmacy, null), meds: j(r.meds, []) })));
});

app.post("/api/prescriptions", requireAuth("provider"), (req, res) => {
  const { patientId, meds, note, pharmacy } = req.body || {};
  if (!patientId || !Array.isArray(meds) || !meds.length) return bad(res, "Missing prescription details");
  const id = uid("rx");
  db.prepare(`INSERT INTO prescriptions (id,provider_id,patient_id,pharmacy,meds,note,status)
              VALUES (?,?,?,?,?,?, 'Sent to pharmacy')`)
    .run(id, req.user.id, patientId, JSON.stringify(pharmacy || null), JSON.stringify(meds), note || "");
  notify(patientId, "New prescription sent to " + (pharmacy?.name || "a pharmacy"));
  notify("pharmacy", "New prescription received");
  ok(res, { id });
});

app.patch("/api/prescriptions/:id/status", requireAuth("pharmacy", "admin"), (req, res) => {
  const { status } = req.body || {};
  const r = db.prepare("SELECT * FROM prescriptions WHERE id=?").get(req.params.id);
  if (!r) return bad(res, "Not found", 404);
  db.prepare("UPDATE prescriptions SET status=? WHERE id=?").run(status, r.id);
  if (status === "Ready for pickup") notify(r.patient_id, "Your prescription is ready for pickup");
  ok(res, { status });
});

/* ============================ LAB ORDERS ============================ */
app.get("/api/labs", requireAuth(), (req, res) => {
  const { id, role } = req.user;
  const rows = role === "patient"
    ? db.prepare("SELECT * FROM lab_orders WHERE patient_id=? ORDER BY created_at DESC").all(id)
    : role === "provider"
      ? db.prepare("SELECT * FROM lab_orders WHERE provider_id=? ORDER BY created_at DESC").all(id)
      : db.prepare("SELECT * FROM lab_orders ORDER BY created_at DESC").all(); // admin/lab
  ok(res, rows.map((r) => ({ ...r, lab: j(r.lab, null), tests: j(r.tests, []), results: j(r.results, null) })));
});

app.post("/api/labs", requireAuth("provider"), (req, res) => {
  const { patientId, tests, note, lab } = req.body || {};
  if (!patientId || !Array.isArray(tests) || !tests.length) return bad(res, "Missing lab order details");
  const id = uid("lab");
  db.prepare(`INSERT INTO lab_orders (id,provider_id,patient_id,lab,tests,note,status)
              VALUES (?,?,?,?,?,?, 'Awaiting sample')`)
    .run(id, req.user.id, patientId, JSON.stringify(lab || null), JSON.stringify(tests), note || "");
  notify(patientId, "Lab order sent to " + (lab?.name || "a lab"));
  notify("lab", "New lab order received");
  ok(res, { id });
});

app.patch("/api/labs/:id/status", requireAuth("lab", "admin"), (req, res) => {
  const { status, results } = req.body || {};
  const o = db.prepare("SELECT * FROM lab_orders WHERE id=?").get(req.params.id);
  if (!o) return bad(res, "Not found", 404);
  db.prepare("UPDATE lab_orders SET status=?, results=? WHERE id=?")
    .run(status, results ? JSON.stringify(results) : o.results, o.id);
  if (status === "Results ready") {
    notify(o.patient_id, "Your lab results are ready");
    notify(o.provider_id, "Results are in for your patient");
  }
  ok(res, { status });
});

/* ============================ MESSAGES (redacted server-side) ============================ */
app.get("/api/messages", requireAuth(), (req, res) => {
  const { providerId, patientId } = req.query;
  if (!providerId || !patientId) return bad(res, "providerId and patientId required");
  // a user may only read their own threads
  if (req.user.role === "patient" && req.user.id !== patientId) return bad(res, "Forbidden", 403);
  if (req.user.role === "provider" && req.user.id !== providerId) return bad(res, "Forbidden", 403);
  const rows = db.prepare("SELECT * FROM messages WHERE provider_id=? AND patient_id=? ORDER BY created_at ASC")
    .all(providerId, patientId);
  ok(res, rows);
});

app.post("/api/messages", requireAuth("patient", "provider"), (req, res) => {
  const { providerId, patientId, text } = req.body || {};
  if (!providerId || !patientId || !text?.trim()) return bad(res, "Missing message");
  if (req.user.role === "patient" && req.user.id !== patientId) return bad(res, "Forbidden", 403);
  if (req.user.role === "provider" && req.user.id !== providerId) return bad(res, "Forbidden", 403);

  const { clean, blocked } = scrubContact(text.trim());   // redaction enforced on the server
  const id = uid("msg");
  db.prepare(`INSERT INTO messages (id,provider_id,patient_id,from_role,text,redacted) VALUES (?,?,?,?,?,?)`)
    .run(id, providerId, patientId, req.user.role, clean, blocked ? 1 : 0);
  if (!blocked) {
    const to = req.user.role === "provider" ? patientId : providerId;
    notify(to, "New secure message");
  }
  ok(res, { id, redacted: blocked, text: clean });
});

/* ============================ NOTIFICATIONS ============================ */
app.get("/api/notifications", requireAuth(), (req, res) => {
  const key = ["admin", "pharmacy", "lab"].includes(req.user.role) ? req.user.role : req.user.id;
  ok(res, db.prepare("SELECT * FROM notifications WHERE to_user=? ORDER BY created_at DESC LIMIT 50").all(key));
});
app.post("/api/notifications/read", requireAuth(), (req, res) => {
  const key = ["admin", "pharmacy", "lab"].includes(req.user.role) ? req.user.role : req.user.id;
  db.prepare("UPDATE notifications SET read=1 WHERE to_user=?").run(key);
  ok(res, { ok: true });
});

/* ============================ ADMIN ============================ */
app.get("/api/admin/providers", requireAuth("admin"), (_req, res) => {
  ok(res, providerJoin().all().map(providerPublic));
});
app.post("/api/admin/providers/:id/verify", requireAuth("admin"), (req, res) => {
  db.prepare("UPDATE providers SET verified=1, rejected=0 WHERE user_id=?").run(req.params.id);
  notify(req.params.id, "Your account has been verified — you're now live on afya");
  ok(res, { verified: true });
});
app.post("/api/admin/providers/:id/reject", requireAuth("admin"), (req, res) => {
  db.prepare("UPDATE providers SET verified=0, rejected=1 WHERE user_id=?").run(req.params.id);
  ok(res, { rejected: true });
});

// Controlled-substance register + integrity metrics (patient names masked for the register view)
app.get("/api/admin/controlled", requireAuth("admin"), (_req, res) => {
  const rows = db.prepare("SELECT * FROM prescriptions ORDER BY created_at DESC").all();
  const blocked = db.prepare("SELECT COUNT(*) n FROM messages WHERE redacted=1").get().n;
  const totalMsgs = db.prepare("SELECT COUNT(*) n FROM messages").get().n;
  ok(res, { prescriptions: rows.map((r) => ({ ...r, meds: j(r.meds, []), pharmacy: j(r.pharmacy, null) })),
            integrity: { blockedContactAttempts: blocked, totalMessages: totalMsgs } });
});

/* ---------- health check ---------- */
app.get("/api/health", (_req, res) => ok(res, { ok: true, ts: new Date().toISOString() }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`AFYA API listening on http://localhost:${PORT}`));

export default app;
