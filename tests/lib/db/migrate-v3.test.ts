import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('migration v3', () => {
  it('user_version 升到 3', () => {
    const db = freshDb();
    expect(db.pragma('user_version', { simple: true })).toBe(3);
  });

  it('portfolios / transactions / fund_fee_config 三表存在', () => {
    const db = freshDb();
    const names = (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['portfolios', 'transactions', 'fund_fee_config']),
    );
  });

  it('seed 出唯一一个「主账本」portfolio', () => {
    const db = freshDb();
    const rows = db.prepare(`SELECT id, name, is_simulated FROM portfolios`).all() as Array<{
      id: number;
      name: string;
      is_simulated: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('主账本');
    expect(rows[0].is_simulated).toBe(0);
  });

  it('transactions.portfolio_id 外键 ON DELETE CASCADE', () => {
    const db = freshDb();
    db.exec(`
      INSERT INTO transactions(portfolio_id, code, trade_date, side, shares, unit_nav, fee, created_at)
      VALUES (1,'000001','2026-05-01','BUY',100,1.0,0,0);
    `);
    db.exec(`DELETE FROM portfolios WHERE id = 1`);
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM transactions`).get() as { n: number }).n;
    expect(n).toBe(0);
  });

  it('transactions.side 仅允许 BUY/SELL', () => {
    const db = freshDb();
    expect(() =>
      db.exec(
        `INSERT INTO transactions(portfolio_id,code,trade_date,side,shares,unit_nav,fee,created_at) VALUES (1,'000001','2026-05-01','HOLD',1,1,0,0)`,
      ),
    ).toThrow();
  });

  it('transactions.shares <= 0 或 unit_nav <= 0 时被 CHECK 拒绝', () => {
    const db = freshDb();
    expect(() =>
      db.exec(
        `INSERT INTO transactions(portfolio_id,code,trade_date,side,shares,unit_nav,fee,created_at) VALUES (1,'000001','2026-05-01','BUY',-1,1.0,0,0)`,
      ),
    ).toThrow();
    expect(() =>
      db.exec(
        `INSERT INTO transactions(portfolio_id,code,trade_date,side,shares,unit_nav,fee,created_at) VALUES (1,'000001','2026-05-01','BUY',100,0,0,0)`,
      ),
    ).toThrow();
  });

  it('idempotent：跑两次不报错', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM portfolios`).get() as { n: number }).n,
    ).toBe(1);
  });
});
