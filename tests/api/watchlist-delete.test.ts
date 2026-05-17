import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('@/lib/db/migrate');
  const db = new Database(':memory:');
  runMigrations(db);
  return { getDb: () => db };
});

import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { DELETE } from '@/app/api/watchlist/[code]/route';

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM watchlist; DELETE FROM fund_meta;');
});

function req() {
  return new Request('http://x', { method: 'DELETE' });
}

describe('DELETE /api/watchlist/[code]', () => {
  it('删除已存在条目返回 204', async () => {
    const q = createQueries(getDb());
    q.upsertMeta({ code: '110011', name: 'A', type: null });
    q.addToWatchlist('110011');
    const res = await DELETE(req(), { params: { code: '110011' } });
    expect(res.status).toBe(204);
    expect(q.listWatchlist()).toHaveLength(0);
  });

  it('code 非法返回 400', async () => {
    const res = await DELETE(req(), { params: { code: 'abc' } });
    expect(res.status).toBe(400);
  });
});
