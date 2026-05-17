import type { Database } from 'better-sqlite3';

export interface WatchlistItem {
  code: string;
  name: string;
  type: string | null;
  added_at: number;
  sort_order: number;
}

export interface NavRow {
  nav_date: string;
  unit_nav: number;
  acc_nav: number | null;
  daily_pct: number | null;
}

export interface MetaInput {
  code: string;
  name: string;
  type: string | null;
}
export interface NavInput {
  navDate: string;
  unitNav: number;
  accNav: number | null;
  dailyPct: number | null;
}

export function createQueries(db: Database) {
  const upsertMetaStmt = db.prepare(`
    INSERT INTO fund_meta (code, name, type, meta_updated_at)
    VALUES (@code, @name, @type, @ts)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      meta_updated_at = excluded.meta_updated_at
  `);
  const addWatchStmt = db.prepare(
    `INSERT INTO watchlist (code, added_at, sort_order) VALUES (?, ?, ?)`,
  );
  const removeWatchStmt = db.prepare(`DELETE FROM watchlist WHERE code = ?`);
  const listWatchStmt = db.prepare(`
    SELECT w.code, m.name, m.type, w.added_at, w.sort_order
    FROM watchlist w
    JOIN fund_meta m USING (code)
    ORDER BY w.sort_order ASC, w.added_at ASC
  `);
  const insertNavStmt = db.prepare(`
    INSERT INTO fund_nav (code, nav_date, unit_nav, acc_nav, daily_pct)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code, nav_date) DO UPDATE SET
      unit_nav = excluded.unit_nav,
      acc_nav = excluded.acc_nav,
      daily_pct = excluded.daily_pct
  `);
  const listNavStmt = db.prepare(`
    SELECT nav_date, unit_nav, acc_nav, daily_pct FROM (
      SELECT nav_date, unit_nav, acc_nav, daily_pct
      FROM fund_nav WHERE code = ?
      ORDER BY nav_date DESC LIMIT ?
    ) ORDER BY nav_date ASC
  `);
  const latestNavStmt = db.prepare(`
    SELECT nav_date, unit_nav, acc_nav, daily_pct FROM fund_nav
    WHERE code = ? ORDER BY nav_date DESC LIMIT 1
  `);
  const getMetaStmt = db.prepare(`SELECT code, name, type FROM fund_meta WHERE code = ?`);
  const countWatchStmt = db.prepare(`SELECT COUNT(*) AS n FROM watchlist`);
  const countNavStmt = db.prepare(`SELECT COUNT(*) AS n FROM fund_nav WHERE code = ?`);

  return {
    upsertMeta(input: MetaInput) {
      upsertMetaStmt.run({ ...input, ts: Date.now() });
    },
    addToWatchlist(code: string) {
      const { n } = countWatchStmt.get() as { n: number };
      addWatchStmt.run(code, Date.now(), n);
    },
    removeFromWatchlist(code: string) {
      removeWatchStmt.run(code);
    },
    listWatchlist(): WatchlistItem[] {
      return listWatchStmt.all() as WatchlistItem[];
    },
    upsertNavRows(code: string, rows: NavInput[]) {
      const tx = db.transaction((items: NavInput[]) => {
        for (const r of items) {
          insertNavStmt.run(code, r.navDate, r.unitNav, r.accNav, r.dailyPct);
        }
      });
      tx(rows);
    },
    listNav(code: string, limit: number): NavRow[] {
      return listNavStmt.all(code, limit) as NavRow[];
    },
    latestNav(code: string): NavRow | null {
      const row = latestNavStmt.get(code) as NavRow | undefined;
      return row ?? null;
    },
    countNav(code: string): number {
      const row = countNavStmt.get(code) as { n: number };
      return row.n;
    },
    getMeta(code: string): { code: string; name: string; type: string | null } | null {
      const row = getMetaStmt.get(code) as
        | { code: string; name: string; type: string | null }
        | undefined;
      return row ?? null;
    },
  };
}

export type Queries = ReturnType<typeof createQueries>;
