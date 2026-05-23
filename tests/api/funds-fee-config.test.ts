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
import { GET, PUT } from '@/app/api/funds/[code]/fee-config/route';

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM fund_fee_config; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO fund_meta(code,name,type,meta_updated_at) VALUES ('000001','X',NULL,0)`);
});

function put(body: unknown) {
  return new Request('http://x', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('fund fee-config API', () => {
  it('未配置 GET 404', async () => {
    const res = await GET(new Request('http://x'), { params: { code: '000001' } });
    expect(res.status).toBe(404);
  });

  it('PUT 写入再 GET', async () => {
    const r1 = await PUT(put({ buy_fee_rate: 0.0015, sell_fee_rate: 0.005 }), { params: { code: '000001' } });
    expect(r1.status).toBe(200);
    const r2 = await GET(new Request('http://x'), { params: { code: '000001' } });
    const body = await r2.json();
    expect(body.buy_fee_rate).toBeCloseTo(0.0015);
    expect(body.sell_fee_rate).toBeCloseTo(0.005);
  });

  it('code 不在 fund_meta → 404', async () => {
    const res = await PUT(put({ buy_fee_rate: 0.001 }), { params: { code: '999999' } });
    expect(res.status).toBe(404);
  });

  it('rate 非数字 → 400', async () => {
    const res = await PUT(put({ buy_fee_rate: 'a' }), { params: { code: '000001' } });
    expect(res.status).toBe(400);
  });
});
