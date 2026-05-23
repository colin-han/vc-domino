import type { Database } from 'better-sqlite3';
import type { TagColor } from '@/lib/domain/tag-palette';

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

export interface TagRow {
  id: number;
  name: string;
  color: TagColor;
  sort_order: number;
}
export interface TagWithCount extends TagRow {
  fund_count: number;
}

export interface PortfolioRow {
  id: number;
  name: string;
  is_simulated: boolean;
  sort_order: number;
  created_at: number;
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

  const insertTagStmt = db.prepare(
    `INSERT INTO tags (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)`,
  );
  const getTagStmt = db.prepare(
    `SELECT id, name, color, sort_order FROM tags WHERE id = ?`,
  );
  const listTagsStmt = db.prepare(`
    SELECT t.id, t.name, t.color, t.sort_order,
           COALESCE(f.cnt, 0) AS fund_count
    FROM tags t
    LEFT JOIN (
      SELECT tag_id, COUNT(*) AS cnt FROM fund_tags GROUP BY tag_id
    ) f ON f.tag_id = t.id
    ORDER BY t.sort_order ASC, t.name ASC
  `);
  const updateTagNameStmt = db.prepare(`UPDATE tags SET name = ? WHERE id = ?`);
  const updateTagColorStmt = db.prepare(`UPDATE tags SET color = ? WHERE id = ?`);
  const deleteTagStmt = db.prepare(`DELETE FROM tags WHERE id = ?`);
  const insertFundTagStmt = db.prepare(
    `INSERT INTO fund_tags (code, tag_id, added_at) VALUES (?, ?, ?)`,
  );
  const deleteFundTagStmt = db.prepare(
    `DELETE FROM fund_tags WHERE code = ? AND tag_id = ?`,
  );
  const listTagsForFundStmt = db.prepare(`
    SELECT t.id, t.name, t.color, t.sort_order
    FROM tags t
    JOIN fund_tags ft ON ft.tag_id = t.id
    WHERE ft.code = ?
    ORDER BY t.sort_order ASC, t.name ASC
  `);
  const countTagsStmt = db.prepare(`SELECT COUNT(*) AS n FROM tags`);

  const insertPortfolioStmt = db.prepare(
    `INSERT INTO portfolios (name, is_simulated, sort_order, created_at) VALUES (?, ?, ?, ?)`,
  );
  const updatePortfolioNameStmt = db.prepare(`UPDATE portfolios SET name = ? WHERE id = ?`);
  const updatePortfolioSimStmt = db.prepare(
    `UPDATE portfolios SET is_simulated = ? WHERE id = ?`,
  );
  const deletePortfolioStmt = db.prepare(`DELETE FROM portfolios WHERE id = ?`);
  const getPortfolioStmt = db.prepare(
    `SELECT id, name, is_simulated, sort_order, created_at FROM portfolios WHERE id = ?`,
  );
  const listPortfoliosStmt = db.prepare(
    `SELECT id, name, is_simulated, sort_order, created_at FROM portfolios
     ORDER BY sort_order ASC, created_at ASC`,
  );
  const countPortfoliosStmt = db.prepare(`SELECT COUNT(*) AS n FROM portfolios`);

  const insertTransactionStmt = db.prepare(`
    INSERT INTO transactions (portfolio_id, code, trade_date, side, shares, unit_nav, fee, note, created_at)
    VALUES (@portfolio_id, @code, @trade_date, @side, @shares, @unit_nav, @fee, @note, @created_at)
  `);

  function rowToPortfolio(r: {
    id: number; name: string; is_simulated: number; sort_order: number; created_at: number;
  }): PortfolioRow {
    return { ...r, is_simulated: r.is_simulated === 1 };
  }

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
    listTags(): TagWithCount[] {
      return listTagsStmt.all() as TagWithCount[];
    },
    getTag(id: number): TagRow | null {
      return (getTagStmt.get(id) as TagRow | undefined) ?? null;
    },
    createTag(input: { name: string; color: TagColor }): TagRow {
      const { n } = countTagsStmt.get() as { n: number };
      const result = insertTagStmt.run(input.name, input.color, n, Date.now());
      const id = Number(result.lastInsertRowid);
      return { id, name: input.name, color: input.color, sort_order: n };
    },
    updateTag(id: number, patch: { name?: string; color?: TagColor }): void {
      if (patch.name !== undefined) updateTagNameStmt.run(patch.name, id);
      if (patch.color !== undefined) updateTagColorStmt.run(patch.color, id);
    },
    deleteTag(id: number): void {
      deleteTagStmt.run(id);
    },
    addFundTag(code: string, tagId: number): void {
      insertFundTagStmt.run(code, tagId, Date.now());
    },
    removeFundTag(code: string, tagId: number): void {
      deleteFundTagStmt.run(code, tagId);
    },
    listTagsForFund(code: string): TagRow[] {
      return listTagsForFundStmt.all(code) as TagRow[];
    },
    listWatchlistWithTags(): Array<WatchlistItem & { tags: TagRow[] }> {
      const items = listWatchStmt.all() as WatchlistItem[];
      return items.map((it) => ({ ...it, tags: listTagsForFundStmt.all(it.code) as TagRow[] }));
    },
    listNavSeriesForCodes(codes: string[], range: number): Map<string, NavRow[]> {
      const result = new Map<string, NavRow[]>();
      for (const code of codes) {
        result.set(code, listNavStmt.all(code, range) as NavRow[]);
      }
      return result;
    },
    listPortfolios(): PortfolioRow[] {
      return (listPortfoliosStmt.all() as Array<{
        id: number; name: string; is_simulated: number; sort_order: number; created_at: number;
      }>).map(rowToPortfolio);
    },
    getPortfolio(id: number): PortfolioRow | null {
      const row = getPortfolioStmt.get(id) as
        | { id: number; name: string; is_simulated: number; sort_order: number; created_at: number; }
        | undefined;
      return row ? rowToPortfolio(row) : null;
    },
    countPortfolios(): number {
      return (countPortfoliosStmt.get() as { n: number }).n;
    },
    createPortfolio(input: { name: string; is_simulated: boolean }): PortfolioRow {
      const { n } = countPortfoliosStmt.get() as { n: number };
      const result = insertPortfolioStmt.run(
        input.name, input.is_simulated ? 1 : 0, n, Date.now(),
      );
      const id = Number(result.lastInsertRowid);
      return rowToPortfolio({
        id, name: input.name, is_simulated: input.is_simulated ? 1 : 0,
        sort_order: n, created_at: Date.now(),
      });
    },
    updatePortfolio(id: number, patch: { name?: string; is_simulated?: boolean }): void {
      if (patch.name !== undefined) updatePortfolioNameStmt.run(patch.name, id);
      if (patch.is_simulated !== undefined)
        updatePortfolioSimStmt.run(patch.is_simulated ? 1 : 0, id);
    },
    deletePortfolio(id: number): void {
      deletePortfolioStmt.run(id);
    },
    insertTransaction(input: {
      portfolio_id: number; code: string; trade_date: string;
      side: 'BUY' | 'SELL'; shares: number; unit_nav: number; fee: number; note: string | null;
    }): number {
      const r = insertTransactionStmt.run({ ...input, created_at: Date.now() });
      return Number(r.lastInsertRowid);
    },
  };
}

export type Queries = ReturnType<typeof createQueries>;
