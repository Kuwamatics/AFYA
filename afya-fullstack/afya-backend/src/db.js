// db.js — SQLite schema + connection.
// SQLite keeps the foundation dependency-free and runnable anywhere. To move to Postgres later,
// the schema below maps over directly; only this file and the query helpers change.
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "afya.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    role          TEXT NOT NULL CHECK (role IN ('patient','provider','admin','pharmacy','lab')),
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Patient profile (1:1 with a user of role 'patient')
  CREATE TABLE IF NOT EXISTS patients (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    county       TEXT, subcounty TEXT, ward TEXT, location TEXT, sublocation TEXT,
    current_meds TEXT DEFAULT '[]'        -- JSON array of strings
  );

  -- Provider profile (1:1 with a user of role 'provider')
  CREATE TABLE IF NOT EXISTS providers (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specialty    TEXT NOT NULL,
    price        INTEGER NOT NULL DEFAULT 3000,
    bio          TEXT DEFAULT '',
    county       TEXT, subcounty TEXT,
    modes        TEXT DEFAULT '["Telehealth"]', -- JSON array
    availability TEXT DEFAULT '[]',             -- JSON array of slot strings
    rating       REAL DEFAULT 0,
    reviews      INTEGER DEFAULT 0,
    verified     INTEGER DEFAULT 0,             -- 0 pending, 1 verified
    rejected     INTEGER DEFAULT 0,
    license_no   TEXT,                          -- KMPDC / Nursing Council etc. (verified offline)
    license_body TEXT
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES users(id),
    patient_id  TEXT NOT NULL REFERENCES users(id),
    slot        TEXT NOT NULL,
    mode        TEXT NOT NULL,                  -- video | inperson
    location    TEXT,
    price       INTEGER NOT NULL,
    fee_rate    REAL NOT NULL DEFAULT 0.20,     -- declining take-rate captured at booking
    status      TEXT NOT NULL DEFAULT 'upcoming', -- upcoming | completed | noshow | cancelled
    rating      INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prescriptions (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES users(id),
    patient_id  TEXT NOT NULL REFERENCES users(id),
    pharmacy    TEXT,                           -- JSON: chosen pharmacy snapshot
    meds        TEXT NOT NULL,                  -- JSON array of {name,dose,instr}
    note        TEXT DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'Sent to pharmacy',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lab_orders (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES users(id),
    patient_id  TEXT NOT NULL REFERENCES users(id),
    lab         TEXT,                           -- JSON: chosen lab snapshot
    tests       TEXT NOT NULL,                  -- JSON array of {name,price}
    note        TEXT DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'Awaiting sample',
    results     TEXT,                           -- JSON array once ready
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Secure in-app messages (anti-circumvention redaction applied server-side before insert)
  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES users(id),
    patient_id  TEXT NOT NULL REFERENCES users(id),
    from_role   TEXT NOT NULL,                  -- patient | provider
    text        TEXT NOT NULL,                  -- already redacted
    redacted    INTEGER NOT NULL DEFAULT 0,     -- 1 if contact info was stripped
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT PRIMARY KEY,
    to_user     TEXT NOT NULL,                  -- user id or role string (admin/pharmacy/lab)
    text        TEXT NOT NULL,
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_appt_provider ON appointments(provider_id);
  CREATE INDEX IF NOT EXISTS idx_appt_patient  ON appointments(patient_id);
  CREATE INDEX IF NOT EXISTS idx_rx_patient     ON prescriptions(patient_id);
  CREATE INDEX IF NOT EXISTS idx_lab_patient    ON lab_orders(patient_id);
  CREATE INDEX IF NOT EXISTS idx_msg_pair       ON messages(provider_id, patient_id);
  CREATE INDEX IF NOT EXISTS idx_notif_to       ON notifications(to_user);
  `);
}
