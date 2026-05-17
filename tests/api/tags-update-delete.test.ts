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
import { createQueries } from '@/lib/db/queries';
import { PATCH, DELETE } from '@/app/api/tags/[id]/route';

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM fund_tags; DELETE FROM tags;');
});

function patchReq(body: unknown) {
  return new Request('http://x', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/tags/[id]', () => {
  it('改名 + 改色返回 200', async () => {
    const q = createQueries(getDb());
    const t = q.createTag({ name: 'a', color: 'blue' });
    const res = await PATCH(patchReq({ name: 'b', color: 'red' }), { params: { id: String(t.id) } });
    expect(res.status).toBe(200);
    expect(q.getTag(t.id)?.name).toBe('b');
    expect(q.getTag(t.id)?.color).toBe('red');
  });

  it('不存在的 id 返回 404', async () => {
    const res = await PATCH(patchReq({ name: 'b' }), { params: { id: '999' } });
    expect(res.status).toBe(404);
  });

  it('id 非数字返回 400', async () => {
    const res = await PATCH(patchReq({ name: 'b' }), { params: { id: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('改名重名返回 409', async () => {
    const q = createQueries(getDb());
    q.createTag({ name: 'a', color: 'blue' });
    const t = q.createTag({ name: 'b', color: 'red' });
    const res = await PATCH(patchReq({ name: 'a' }), { params: { id: String(t.id) } });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/tags/[id]', () => {
  it('删除返回 204', async () => {
    const q = createQueries(getDb());
    const t = q.createTag({ name: 'a', color: 'blue' });
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: String(t.id) } });
    expect(res.status).toBe(204);
    expect(q.getTag(t.id)).toBeNull();
  });

  it('不存在的 id 返回 404', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: '999' } });
    expect(res.status).toBe(404);
  });
});
