// db.js — PostgreSQL connection + schema.
// Uses a connection pool. DATABASE_URL is provided by DigitalOcean's Managed Database
// (Settings → Connection string). SSL is required for DO managed DBs.
import pg from "pg";

const { Pool } = pg;

const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  console.warn("[db] DATABASE_URL is not set. Set it to your Postgres connection string.");
}

const connectionString = rawConnectionString
  ? rawConnectionString.replace(/([?&])sslmode=[^&]*(&|$)/, (_m, p1, p2) => (p2 === "&" ? p1 : "")).replace(/[?&]$/, "")
  : rawConnectionString;

const isLocal = connectionString && connectionString.includes("localhost");

export const pool = new Pool({connectionString,

ssl: isLocal ? false : { rejectUnauthorized: false },
});

// query helper: q(text, params) -> rows; q1(...) -> first row or null
export const q = async (text, params = []) => (await pool.query(text, params)).rows;
export const q1 = async (text, params = []) => (await pool.query(text, params)).rows[0] || null;

export async function initSchema() {
  await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    role          TEXT NOT NULL CHECK (role IN ('patient','provider','admin','pharmacy','lab')),
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS patients (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    county       TEXT, subcounty TEXT, ward TEXT, location TEXT, sublocation TEXT,
    current_meds JSONB DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS providers (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specialty    TEXT NOT NULL,
    price        INTEGER NOT NULL DEFAULT 3000,
    bio          TEXT DEFAULT '',
    county       TEXT, subcounty TEXT,
    modes        JSONB DEFAULT '["Telehealth"]',
    availability JSONB DEFAULT '[]',
    rating       REAL DEFAULT 0,
    reviews      INTEGER DEFAULT 0,
    verified     BOOLEAN DEFAULT false,
    rejected     BOOLEAN DEFAULT false,
    license_no   TEXT,
    license_body TEXT
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES users(id),
    patient_id  TEXT NOT NULL REFERENCES users(id),
    slot        TEXT NOT NULL,
    mode        TEXT NOT NULL,
    location    TEXT,
    price       INTEGER NOT NULL,
    fee_rate    REAL NOT NULL DEFAULT 0.20,
    status      TEXT NOT NULL DEFAULT 'upcoming',
    rating      INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS prescriptions (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES users(id),
    patient_id  TEXT NOT NULL REFERENCES users(id),
    pharmacy    JSONB,
    meds        JSONB NOT NULL,
    note        TEXT DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'Sent to pharmacy',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lab_orders (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES users(id),
    patient_id  TEXT NOT NULL REFERENCES users(id),
    lab         JSONB,
    tests       JSONB NOT NULL,
    note        TEXT DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'Awaiting sample',
    results     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES users(id),
    patient_id  TEXT NOT NULL REFERENCES users(id),
    from_role   TEXT NOT NULL,
    text        TEXT NOT NULL,
    redacted    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT PRIMARY KEY,
    to_user     TEXT NOT NULL,
    text        TEXT NOT NULL,
    read        BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_appt_provider ON appointments(provider_id);
  CREATE INDEX IF NOT EXISTS idx_appt_patient  ON appointments(patient_id);
  CREATE INDEX IF NOT EXISTS idx_rx_patient     ON prescriptions(patient_id);
  CREATE INDEX IF NOT EXISTS idx_lab_patient    ON lab_orders(patient_id);
  CREATE INDEX IF NOT EXISTS idx_msg_pair       ON messages(provider_id, patient_id);
  CREATE INDEX IF NOT EXISTS idx_notif_to       ON notifications(to_user);
  `);
}
