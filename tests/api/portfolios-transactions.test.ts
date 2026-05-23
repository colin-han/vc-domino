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
import { GET, POST } from '@/app/api/portfolios/[id]/transactions/route';
import { createQueries } from '@/lib/db/queries';

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM portfolios; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO portfolios (id,name,is_simulated,sort_order,created_at) VALUES (1,'主账本',0,0,0)`);
  db.exec(`INSERT INTO fund_meta(code,name,type,meta_updated_at) VALUES ('000001','X',NULL,0)`);
});

function postReq(body: unknown) {
  return new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/portfolios/:id/transactions', () => {
  it('合法买入 201', async () => {
    const res = await POST(
      postReq({ code: '000001', trade_date: '2026-05-01', side: 'BUY', shares: 100, unit_nav: 1.0, fee: 1.5 }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(201);
  });

  it('超卖 400', async () => {
    const q = createQueries(getDb());
    q.insertTransaction({
      portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 10, unit_nav: 1.0, fee: 0, note: null,
    });
    const res = await POST(
      postReq({ code: '000001', trade_date: '2026-05-02', side: 'SELL', shares: 11, unit_nav: 1.5, fee: 0 }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('oversell');
  });

  it('portfolio 不存在 404', async () => {
    const res = await POST(
      postReq({ code: '000001', trade_date: '2026-05-01', side: 'BUY', shares: 1, unit_nav: 1, fee: 0 }),
      { params: { id: '99' } },
    );
    expect(res.status).toBe(404);
  });

  it('日期格式 400', async () => {
    const res = await POST(
      postReq({ code: '000001', trade_date: '2026/05/01', side: 'BUY', shares: 1, unit_nav: 1, fee: 0 }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/portfolios/:id/transactions', () => {
  it('?code= 过滤', async () => {
    const q = createQueries(getDb());
    q.insertTransaction({
      portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 10, unit_nav: 1.0, fee: 0, note: null,
    });
    const res = await GET(
      new Request('http://x/?code=000001'),
      { params: { id: '1' } },
    );
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});
