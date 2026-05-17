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
import { POST } from '@/app/api/watchlist/[code]/tags/route';
import { DELETE } from '@/app/api/watchlist/[code]/tags/[tagId]/route';

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM fund_tags; DELETE FROM tags; DELETE FROM watchlist; DELETE FROM fund_meta;');
});

function postReq(body: unknown) {
  return new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function seedFund(code = '110011') {
  const q = createQueries(getDb());
  q.upsertMeta({ code, name: 'X', type: null });
  q.addToWatchlist(code);
  return q;
}

describe('POST /api/watchlist/[code]/tags', () => {
  it('成功添加返回 201', async () => {
    const q = seedFund();
    const t = q.createTag({ name: 'a', color: 'blue' });
    const res = await POST(postReq({ tag_id: t.id }), { params: { code: '110011' } });
    expect(res.status).toBe(201);
    expect(q.listTagsForFund('110011')).toHaveLength(1);
  });

  it('code 非法返回 400', async () => {
    const res = await POST(postReq({ tag_id: 1 }), { params: { code: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('tag 不存在返回 404', async () => {
    seedFund();
    const res = await POST(postReq({ tag_id: 9999 }), { params: { code: '110011' } });
    expect(res.status).toBe(404);
  });

  it('fund 不在 watchlist 返回 404', async () => {
    const q = createQueries(getDb());
    const t = q.createTag({ name: 'a', color: 'blue' });
    const res = await POST(postReq({ tag_id: t.id }), { params: { code: '110011' } });
    expect(res.status).toBe(404);
  });

  it('重复关联返回 409', async () => {
    const q = seedFund();
    const t = q.createTag({ name: 'a', color: 'blue' });
    await POST(postReq({ tag_id: t.id }), { params: { code: '110011' } });
    const res = await POST(postReq({ tag_id: t.id }), { params: { code: '110011' } });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/watchlist/[code]/tags/[tagId]', () => {
  it('删除已存在关联返回 204', async () => {
    const q = seedFund();
    const t = q.createTag({ name: 'a', color: 'blue' });
    q.addFundTag('110011', t.id);
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params: { code: '110011', tagId: String(t.id) },
    });
    expect(res.status).toBe(204);
    expect(q.listTagsForFund('110011')).toHaveLength(0);
  });

  it('code 非法返回 400', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params: { code: 'abc', tagId: '1' },
    });
    expect(res.status).toBe(400);
  });
});
