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

describe('fund_fee_config', () => {
  it('未配置时 getFeeConfig 返回 null', () => {
    const q = createQueries(freshDb());
    expect(q.getFeeConfig('000001')).toBeNull();
  });

  it('upsertFeeConfig 写入再读取', () => {
    const q = createQueries(freshDb());
    q.upsertFeeConfig('000001', { buy_fee_rate: 0.0015, sell_fee_rate: 0.005 });
    const c = q.getFeeConfig('000001');
    expect(c?.buy_fee_rate).toBeCloseTo(0.0015);
    expect(c?.sell_fee_rate).toBeCloseTo(0.005);
  });

  it('upsertFeeConfig 只更新提供的字段', () => {
    const q = createQueries(freshDb());
    q.upsertFeeConfig('000001', { buy_fee_rate: 0.0015, sell_fee_rate: 0.005 });
    q.upsertFeeConfig('000001', { sell_fee_rate: 0.0 });
    const c = q.getFeeConfig('000001');
    expect(c?.buy_fee_rate).toBeCloseTo(0.0015);
    expect(c?.sell_fee_rate).toBe(0);
  });
});

describe('listTransactionsForCodes', () => {
  it('按 portfolio_id + 多 code 一次拉回，方便看板批量', () => {
    const db = freshDb();
    const q = createQueries(db);
    q.upsertMeta({ code: '000001', name: 'X', type: null });
    q.upsertMeta({ code: '000002', name: 'Y', type: null });
    q.insertTransaction({
      portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 10, unit_nav: 1, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: 1, code: '000002', trade_date: '2026-05-01',
      side: 'BUY', shares: 20, unit_nav: 2, fee: 0, note: null,
    });
    const map = q.listTransactionsForCodes(1, ['000001', '000002']);
    expect(map.get('000001')?.length).toBe(1);
    expect(map.get('000002')?.length).toBe(1);
  });

  it('portfolioId 传 null 时返回所有组合', () => {
    const db = freshDb();
    const q = createQueries(db);
    q.upsertMeta({ code: '000001', name: 'X', type: null });
    const p2 = q.createPortfolio({ name: '模拟', is_simulated: true });
    q.insertTransaction({
      portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 10, unit_nav: 1, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: p2.id, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 5, unit_nav: 2, fee: 0, note: null,
    });
    const all = q.listTransactionsForCodes(null, ['000001']).get('000001')!;
    expect(all.length).toBe(2);
  });
});
