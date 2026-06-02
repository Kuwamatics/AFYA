// seed.js — populate the DB with demo accounts so you can log in and see it work end-to-end.
// All demo passwords are "demo1234". Safe to re-run: it resets the demo rows.
import { db, initSchema } from "./db.js";
import { uid, takeRateForCount } from "./lib.js";
import { hashPassword } from "./auth.js";

initSchema();

const PW = hashPassword("demo1234");
const upsertUser = (id, role, name, email) =>
  db.prepare(`INSERT INTO users (id,role,name,email,password_hash) VALUES (?,?,?,?,?)
              ON CONFLICT(email) DO UPDATE SET name=excluded.name`).run(id, role, name, email, PW);

console.log("Seeding demo data…");

// wipe demo-scoped rows (keep schema)
db.exec("DELETE FROM appointments; DELETE FROM prescriptions; DELETE FROM lab_orders; DELETE FROM messages; DELETE FROM notifications;");

// --- staff (admin / pharmacy / lab) ---
upsertUser("admin_1", "admin", "afya Admin", "admin@afya.co.ke");
upsertUser("pharm_1", "pharmacy", "Goodlife Pharmacy — Westlands", "pharmacy@afya.co.ke");
upsertUser("lab_1", "lab", "Lancet Labs — Westlands", "lab@afya.co.ke");

// --- providers ---
const provs = [
  ["prov_1", "Dr. Amina Hassan", "amina@demo.com", "General Practice", 1500, "Nairobi", "Starehe", ["Telehealth", "Nairobi CBD"], 1],
  ["prov_2", "Dr. James Mwangi", "james@demo.com", "Pediatrics", 2000, "Kiambu", "Kikuyu", ["Kikuyu"], 1],
  ["prov_3", "Wanjiru Kamau", "wanjiru@demo.com", "Mental Health", 2500, "Nairobi", "Kasarani", ["Telehealth"], 1],
  ["prov_4", "Dr. Faith Chebet", "faith@demo.com", "Gynecology", 4000, "Nairobi", "Langata", ["Telehealth", "Karen"], 1],
  ["prov_5", "Nurse Mercy Wanjiku", "mercy@demo.com", "Nursing & Home Care", 1500, "Kiambu", "Ruiru", ["Home visits", "Ruiru"], 1],
  ["prov_6", "Dr. Brian Ochieng", "brian@demo.com", "Optometry", 2200, "Nairobi", "Starehe", ["CBD"], 0], // pending verification
];
const SLOTS = ["Today · 2:30 PM", "Tomorrow · 9:00 AM", "Tomorrow · 11:30 AM", "Thu · 10:00 AM", "Fri · 3:00 PM"];
for (const [id, name, email, specialty, price, county, sub, modes, verified] of provs) {
  upsertUser(id, "provider", name, email);
  db.prepare(`INSERT INTO providers (user_id,specialty,price,bio,county,subcounty,modes,availability,rating,reviews,verified)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET specialty=excluded.specialty, price=excluded.price, verified=excluded.verified`)
    .run(id, specialty, price, name + " — verified afya provider.", county, sub,
         JSON.stringify(modes), JSON.stringify(SLOTS), verified ? 4.8 : 0, verified ? 60 : 0, verified);
}

// --- patients ---
const pats = [
  ["pat_demo", "Mary Achieng", "mary@demo.com", "Nairobi", "Westlands", "Westlands Central", "Westlands Town", "Westlands Town A", ["Warfarin", "Simvastatin"]],
  ["pat_2", "John Kamau", "john@demo.com", "Nairobi", "Kasarani", "Kasarani Central", "Kasarani Town", "Kasarani Town A", []],
];
for (const [id, name, email, county, sub, ward, loc, subloc, meds] of pats) {
  upsertUser(id, "patient", name, email);
  db.prepare(`INSERT INTO patients (user_id,county,subcounty,ward,location,sublocation,current_meds)
              VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET county=excluded.county`)
    .run(id, county, sub, ward, loc, subloc, JSON.stringify(meds));
}

// --- a couple of appointments (one completed so take-rate + ratings have something to act on) ---
const ph = { id: "ph_x", name: "Goodlife Pharmacy — Westlands", place: "Westlands", county: "Nairobi", km: 0.6, hours: "Open till 9 PM", phone: "0700 123 456" };
db.prepare(`INSERT INTO appointments (id,provider_id,patient_id,slot,mode,price,fee_rate,status)
            VALUES (?,?,?,?,?,?,?,?)`)
  .run(uid("appt"), "prov_1", "pat_demo", "Mon · 9:00 AM", "video", 1500, takeRateForCount(0), "completed");
db.prepare(`INSERT INTO appointments (id,provider_id,patient_id,slot,mode,price,fee_rate,status)
            VALUES (?,?,?,?,?,?,?,?)`)
  .run(uid("appt"), "prov_3", "pat_demo", "Tomorrow · 11:30 AM", "video", 2500, takeRateForCount(0), "upcoming");

// --- a prescription incl. a controlled drug so the admin register isn't empty ---
db.prepare(`INSERT INTO prescriptions (id,provider_id,patient_id,pharmacy,meds,note,status)
            VALUES (?,?,?,?,?,?,?)`)
  .run(uid("rx"), "prov_1", "pat_demo", JSON.stringify(ph),
       JSON.stringify([{ name: "Codeine", dose: "30 mg", instr: "1 tab every 6 hrs" }]), "Short course", "Ready for pickup");

console.log("Done. Demo logins (password: demo1234):");
console.log("  patient  → mary@demo.com");
console.log("  provider → amina@demo.com");
console.log("  admin    → admin@afya.co.ke");
console.log("  pharmacy → pharmacy@afya.co.ke");
console.log("  lab      → lab@afya.co.ke");
