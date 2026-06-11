import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  home_team TEXT,
  away_team TEXT,
  label TEXT NOT NULL,
  venue TEXT,
  city TEXT,
  kickoff_utc TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS event_mappings (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  site TEXT NOT NULL,
  site_event_id TEXT NOT NULL,
  site_url TEXT,
  raw_title TEXT,
  venue_name TEXT,
  match_confidence REAL,
  last_seen_at TEXT,
  last_polled_at TEXT,
  last_poll_note TEXT,
  UNIQUE(site, site_event_id)
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY,
  mapping_id INTEGER NOT NULL REFERENCES event_mappings(id),
  taken_at_utc TEXT NOT NULL,
  lowest_price REAL,
  highest_price REAL,
  average_price REAL,
  median_price REAL,
  listing_count INTEGER,
  decent_price REAL NOT NULL,
  decent_confidence TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots ON price_snapshots(mapping_id, taken_at_utc);
`;

declare global {
  // Reused across dev HMR reloads so we don't leak file handles.
  var __wcDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!globalThis.__wcDb) {
    const dbPath = path.resolve(process.env.DATABASE_PATH || "./data/app.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA);
    migrate(db);
    globalThis.__wcDb = db;
  }
  return globalThis.__wcDb;
}

// Databases created before these columns existed need them added in place.
function migrate(db: Database.Database): void {
  const cols = (db.prepare("PRAGMA table_info(event_mappings)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  if (!cols.includes("last_polled_at"))
    db.exec("ALTER TABLE event_mappings ADD COLUMN last_polled_at TEXT");
  if (!cols.includes("last_poll_note"))
    db.exec("ALTER TABLE event_mappings ADD COLUMN last_poll_note TEXT");
}

export function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
