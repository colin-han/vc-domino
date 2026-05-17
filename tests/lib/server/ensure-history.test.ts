import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/source/eastmoney', () => ({ fetchHistory: vi.fn() }));

import { fetchHistory } from '@/lib/source/eastmoney';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';
import { ensureHistory } from '@/lib/server/ensure-history';

const mockedFetch = vi.mocked(fetchHistory);

function freshQ() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  const q = createQueries(db);
  q.upsertMeta({ code: '110011', name: 'X', type: null });
  return q;
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe('ensureHistory', () => {
  it('行数充足且数据新鲜时跳过 fetch', async () => {
    const q = freshQ();
    const rows = Array.from({ length: 100 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      return { navDate: d.toISOString().slice(0, 10), unitNav: 1, accNav: null, dailyPct: null };
    });
    q.upsertNavRows('110011', rows);
    await ensureHistory(q, '110011', 30);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('数据过期时触发 fetch', async () => {
    const q = freshQ();
    q.upsertNavRows('110011', [
      { navDate: '2020-01-01', unitNav: 1, accNav: null, dailyPct: null },
    ]);
    mockedFetch.mockResolvedValue({ ok: true, data: [] });
    await ensureHistory(q, '110011', 30);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('行数不足请求范围时触发 fetch', async () => {
    const q = freshQ();
    const today = new Date().toISOString().slice(0, 10);
    q.upsertNavRows('110011', [
      { navDate: today, unitNav: 1, accNav: null, dailyPct: null },
    ]);
    mockedFetch.mockResolvedValue({ ok: true, data: [] });
    await ensureHistory(q, '110011', 90);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
