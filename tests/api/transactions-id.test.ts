import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('@/lib/db/migrate');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return { getDb: () => db };
});

import { getDb } from '@/lib/db/client';
import { PATCH, DELETE } from '@/app/api/transactions/[id]/route';
import { createQueries } from '@/lib/db/queries';

let buyId: number;
let sellId: number;

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM portfolios; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO portfolios (id,name,is_simulated,sort_order,created_at) VALUES (1,'主账本',0,0,0)`);
  db.exec(`INSERT INTO fund_meta(code,name,type,meta_updated_at) VALUES ('000001','X',NULL,0)`);
  const q = createQueries(db);
  buyId = q.insertTransaction({
    portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
    side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
  });
  sellId = q.insertTransaction({
    portfolio_id: 1, code: '000001', trade_date: '2026-05-05',
    side: 'SELL', shares: 50, unit_nav: 1.5, fee: 0, note: null,
  });
});

function patch(body: unknown) {
  return new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

describe('PATCH /api/transactions/:id', () => {
  it('改 shares 致超卖 → 400', async () => {
    const res = await PATCH(patch({ shares: 40 }), { params: { id: String(buyId) } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('oversell');
  });

  it('合法改 fee → 200', async () => {
    const res = await PATCH(patch({ fee: 2.0 }), { params: { id: String(buyId) } });
    expect(res.status).toBe(200);
  });

  it('side 字段不允许 PATCH → 400', async () => {
    const res = await PATCH(patch({ side: 'SELL' }), { params: { id: String(buyId) } });
    expect(res.status).toBe(400);
  });

  it('不存在 404', async () => {
    const res = await PATCH(patch({ fee: 1 }), { params: { id: '99999' } });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/transactions/:id', () => {
  it('删卖出 → 204', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: String(sellId) } });
    expect(res.status).toBe(204);
  });

  it('删买入致超卖 → 400', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: String(buyId) } });
    expect(res.status).toBe(400);
  });
});
