import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('portfolios CRUD', () => {
  it('migration 后 listPortfolios 返回 [主账本]', () => {
    const q = createQueries(freshDb());
    const list = q.listPortfolios();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('主账本');
    expect(list[0].is_simulated).toBe(false);
  });

  it('createPortfolio 成功 + 重名抛 UNIQUE', () => {
    const q = createQueries(freshDb());
    const p = q.createPortfolio({ name: '模拟·A', is_simulated: true });
    expect(p.id).toBeGreaterThan(1);
    expect(p.is_simulated).toBe(true);
    expect(() => q.createPortfolio({ name: '模拟·A', is_simulated: false })).toThrow(/UNIQUE/i);
  });

  it('updatePortfolio 只更新提供字段', () => {
    const q = createQueries(freshDb());
    const p = q.createPortfolio({ name: 'X', is_simulated: false });
    q.updatePortfolio(p.id, { is_simulated: true });
    expect(q.getPortfolio(p.id)?.is_simulated).toBe(true);
    expect(q.getPortfolio(p.id)?.name).toBe('X');
    q.updatePortfolio(p.id, { name: 'Y' });
    expect(q.getPortfolio(p.id)?.name).toBe('Y');
  });

  it('deletePortfolio CASCADE 删交易', () => {
    const db = freshDb();
    const q = createQueries(db);
    q.upsertMeta({ code: '000001', name: 'X', type: null });
    const p = q.createPortfolio({ name: 'A', is_simulated: false });
    q.insertTransaction({
      portfolio_id: p.id, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    q.deletePortfolio(p.id);
    expect(q.getPortfolio(p.id)).toBeNull();
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM transactions`).get() as { n: number }).n;
    expect(n).toBe(0);
  });

  it('countPortfolios', () => {
    const q = createQueries(freshDb());
    expect(q.countPortfolios()).toBe(1);
    q.createPortfolio({ name: 'B', is_simulated: false });
    expect(q.countPortfolios()).toBe(2);
  });
});
