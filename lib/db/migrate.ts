import type { Database } from 'better-sqlite3';

const MIGRATIONS: Array<(db: Database) => void> = [
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        code        TEXT PRIMARY KEY,
        added_at    INTEGER NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS fund_meta (
        code            TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        type            TEXT,
        meta_updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fund_nav (
        code      TEXT NOT NULL,
        nav_date  TEXT NOT NULL,
        unit_nav  REAL NOT NULL,
        acc_nav   REAL,
        daily_pct REAL,
        PRIMARY KEY (code, nav_date)
      );
      CREATE INDEX IF NOT EXISTS idx_fund_nav_code_date ON fund_nav(code, nav_date DESC);
    `);
  },
];

export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
