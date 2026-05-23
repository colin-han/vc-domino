import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  const q = createQueries(db);
  q.upsertMeta({ code: '000001', name: 'X', type: null });
  return { db, q, portfolioId: 1 };
}

describe('transactions CRUD', () => {
  it('insertTransaction 写入成功并能列出', () => {
    const { q, portfolioId } = setup();
    const id = q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0.5, note: 'init',
    });
    expect(id).toBeGreaterThan(0);
    const list = q.listTransactions(portfolioId, '000001');
    expect(list).toHaveLength(1);
    expect(list[0].shares).toBe(100);
    expect(list[0].fee).toBeCloseTo(0.5);
    expect(list[0].note).toBe('init');
  });

  it('卖出超卖：写入前校验拒绝', () => {
    const { q, portfolioId } = setup();
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    expect(() =>
      q.insertTransaction({
        portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-02',
        side: 'SELL', shares: 101, unit_nav: 1.5, fee: 0, note: null,
      }),
    ).toThrow(/oversell/i);
  });

  it('编辑后致超卖：抛错并回滚', () => {
    const { q, db, portfolioId } = setup();
    const buyId = q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-02',
      side: 'SELL', shares: 50, unit_nav: 1.5, fee: 0, note: null,
    });
    expect(() => q.updateTransaction(buyId, { shares: 40 })).toThrow(/oversell/i);
    // 验证回滚：buyId 的 shares 仍是 100
    const row = db.prepare(`SELECT shares FROM transactions WHERE id = ?`).get(buyId) as { shares: number };
    expect(row.shares).toBe(100);
  });

  it('删除最后一笔买入致超卖：拒绝', () => {
    const { q, portfolioId } = setup();
    const buyId = q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-02',
      side: 'SELL', shares: 50, unit_nav: 1.5, fee: 0, note: null,
    });
    expect(() => q.deleteTransaction(buyId)).toThrow(/oversell/i);
  });

  it('getTransaction / deleteTransaction 正常路径', () => {
    const { q, portfolioId } = setup();
    const id = q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    expect(q.getTransaction(id)?.id).toBe(id);
    q.deleteTransaction(id);
    expect(q.getTransaction(id)).toBeNull();
  });

  it('listTransactions(portfolioId) 不传 code 列出整个组合', () => {
    const { q, portfolioId } = setup();
    q.upsertMeta({ code: '000002', name: 'Y', type: null });
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000002', trade_date: '2026-05-01',
      side: 'BUY', shares: 50, unit_nav: 2.0, fee: 0, note: null,
    });
    expect(q.listTransactions(portfolioId)).toHaveLength(2);
  });
});
