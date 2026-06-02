// seed.js — populate Postgres with demo accounts + data. Password for all demo users: demo1234.
// Safe to re-run: clears demo-scoped tables, upserts users.
import "dotenv/config";
import { pool, initSchema } from "./db.js";
import { uid, takeRateForCount } from "./lib.js";
import { hashPassword } from "./auth.js";

const PW = hashPassword("demo1234");
const S = (v) => JSON.stringify(v ?? null);

async function upsertUser(id, role, name, email) {
  await pool.query(
    `INSERT INTO users (id,role,name,email,password_hash) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name`,
    [id, role, name, email, PW]);
}

async function run() {
  await initSchema();
  console.log("Seeding demo data…");
  await pool.query("DELETE FROM appointments; DELETE FROM prescriptions; DELETE FROM lab_orders; DELETE FROM messages; DELETE FROM notifications;");

  await upsertUser("admin_1", "admin", "afya Admin", "admin@afya.co.ke");
  await upsertUser("pharm_1", "pharmacy", "Goodlife Pharmacy — Westlands", "pharmacy@afya.co.ke");
  await upsertUser("lab_1", "lab", "Lancet Labs — Westlands", "lab@afya.co.ke");

  const provs = [
    ["prov_1", "Dr. Amina Hassan", "amina@demo.com", "General Practice", 1500, "Nairobi", "Starehe", ["Telehealth", "Nairobi CBD"], true],
    ["prov_2", "Dr. James Mwangi", "james@demo.com", "Pediatrics", 2000, "Kiambu", "Kikuyu", ["Kikuyu"], true],
    ["prov_3", "Wanjiru Kamau", "wanjiru@demo.com", "Mental Health", 2500, "Nairobi", "Kasarani", ["Telehealth"], true],
    ["prov_4", "Dr. Faith Chebet", "faith@demo.com", "Gynecology", 4000, "Nairobi", "Langata", ["Telehealth", "Karen"], true],
    ["prov_5", "Nurse Mercy Wanjiku", "mercy@demo.com", "Nursing & Home Care", 1500, "Kiambu", "Ruiru", ["Home visits", "Ruiru"], true],
    ["prov_6", "Dr. Brian Ochieng", "brian@demo.com", "Optometry", 2200, "Nairobi", "Starehe", ["CBD"], false],
  ];
  const SLOTS = ["Today · 2:30 PM", "Tomorrow · 9:00 AM", "Tomorrow · 11:30 AM", "Thu · 10:00 AM", "Fri · 3:00 PM"];
  for (const [id, name, email, specialty, price, county, sub, modes, verified] of provs) {
    await upsertUser(id, "provider", name, email);
    await pool.query(
      `INSERT INTO providers (user_id,specialty,price,bio,county,subcounty,modes,availability,rating,reviews,verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(user_id) DO UPDATE SET specialty=EXCLUDED.specialty, price=EXCLUDED.price, verified=EXCLUDED.verified`,
      [id, specialty, price, name + " — verified afya provider.", county, sub, S(modes), S(SLOTS), verified ? 4.8 : 0, verified ? 60 : 0, verified]);
  }

  const pats = [
    ["pat_demo", "Mary Achieng", "mary@demo.com", "Nairobi", "Westlands", "Westlands Central", "Westlands Town", "Westlands Town A", ["Warfarin", "Simvastatin"]],
    ["pat_2", "John Kamau", "john@demo.com", "Nairobi", "Kasarani", "Kasarani Central", "Kasarani Town", "Kasarani Town A", []],
  ];
  for (const [id, name, email, county, sub, ward, loc, subloc, meds] of pats) {
    await upsertUser(id, "patient", name, email);
    await pool.query(
      `INSERT INTO patients (user_id,county,subcounty,ward,location,sublocation,current_meds)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(user_id) DO UPDATE SET county=EXCLUDED.county`,
      [id, county, sub, ward, loc, subloc, S(meds)]);
  }

  const ph = { id: "ph_x", name: "Goodlife Pharmacy — Westlands", place: "Westlands", county: "Nairobi", km: 0.6, hours: "Open till 9 PM", phone: "0700 123 456" };
  await pool.query(`INSERT INTO appointments (id,provider_id,patient_id,slot,mode,price,fee_rate,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uid("appt"), "prov_1", "pat_demo", "Mon · 9:00 AM", "video", 1500, takeRateForCount(0), "completed"]);
  await pool.query(`INSERT INTO appointments (id,provider_id,patient_id,slot,mode,price,fee_rate,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uid("appt"), "prov_3", "pat_demo", "Tomorrow · 11:30 AM", "video", 2500, takeRateForCount(0), "upcoming"]);
  await pool.query(`INSERT INTO prescriptions (id,provider_id,patient_id,pharmacy,meds,note,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uid("rx"), "prov_1", "pat_demo", S(ph), S([{ name: "Codeine", dose: "30 mg", instr: "1 tab every 6 hrs" }]), "Short course", "Ready for pickup"]);

  console.log("Done. Demo logins (password: demo1234):");
  console.log("  patient  → mary@demo.com");
  console.log("  provider → amina@demo.com");
  console.log("  admin    → admin@afya.co.ke");
  console.log("  pharmacy → pharmacy@afya.co.ke");
  console.log("  lab      → lab@afya.co.ke");
  await pool.end();
}
run().catch((e) => { console.error(e); process.exit(1); });
