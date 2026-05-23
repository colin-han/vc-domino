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
import { PATCH, DELETE } from '@/app/api/portfolios/[id]/route';
import { createQueries } from '@/lib/db/queries';

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM portfolios; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO portfolios (id,name,is_simulated,sort_order,created_at) VALUES (1,'主账本',0,0,0)`);
});

function patch(body: unknown) {
  return new Request('http://x', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/portfolios/:id', () => {
  it('改名成功', async () => {
    const res = await PATCH(patch({ name: 'NewName' }), { params: { id: '1' } });
    expect(res.status).toBe(200);
    const q = createQueries(getDb());
    expect(q.getPortfolio(1)?.name).toBe('NewName');
  });

  it('不存在 404', async () => {
    const res = await PATCH(patch({ name: 'X' }), { params: { id: '999' } });
    expect(res.status).toBe(404);
  });

  it('重名 409', async () => {
    const q = createQueries(getDb());
    q.createPortfolio({ name: 'B', is_simulated: false });
    const res = await PATCH(patch({ name: '主账本' }), { params: { id: String(q.listPortfolios()[1].id) } });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/portfolios/:id', () => {
  it('删除非唯一 portfolio 成功', async () => {
    const q = createQueries(getDb());
    const p = q.createPortfolio({ name: 'B', is_simulated: false });
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: String(p.id) } });
    expect(res.status).toBe(204);
    expect(q.getPortfolio(p.id)).toBeNull();
  });

  it('唯一 portfolio 不可删 400', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: '1' } });
    expect(res.status).toBe(400);
  });
});
