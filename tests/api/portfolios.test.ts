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
import { GET, POST } from '@/app/api/portfolios/route';

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM portfolios; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO portfolios (name, is_simulated, sort_order, created_at) VALUES ('主账本',0,0,0)`);
});

function reqJson(body: unknown) {
  return new Request('http://x/api/portfolios', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('GET /api/portfolios', () => {
  it('返回 items 含 summary（空组合时 summary 全为 0）', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('主账本');
    expect(body.items[0].summary.total_cost).toBe(0);
    expect(body.items[0].summary.total_market).toBe(0);
  });
});

describe('POST /api/portfolios', () => {
  it('合法参数返回 201', async () => {
    const res = await POST(reqJson({ name: '模拟·A', is_simulated: true }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('模拟·A');
    expect(body.is_simulated).toBe(true);
  });
  it('name 为空 400', async () => {
    const res = await POST(reqJson({ name: '', is_simulated: false }));
    expect(res.status).toBe(400);
  });
  it('重名 409', async () => {
    await POST(reqJson({ name: 'A', is_simulated: false }));
    const res = await POST(reqJson({ name: 'A', is_simulated: false }));
    expect(res.status).toBe(409);
  });
});
