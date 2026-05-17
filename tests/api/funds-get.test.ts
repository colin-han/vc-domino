import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/source/eastmoney', () => ({ fetchHistory: vi.fn() }));
vi.mock('@/lib/db/client', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('@/lib/db/migrate');
  const db = new Database(':memory:');
  runMigrations(db);
  return { getDb: () => db };
});

import { fetchHistory } from '@/lib/source/eastmoney';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { GET } from '@/app/api/funds/[code]/route';

const mockedHistory = vi.mocked(fetchHistory);

beforeEach(() => {
  mockedHistory.mockReset();
  const db = getDb();
  db.exec('DELETE FROM fund_nav; DELETE FROM fund_meta;');
});

describe('GET /api/funds/[code]', () => {
  it('DB 已有最新数据且行数充足时直接返回，不调用上游', async () => {
    const q = createQueries(getDb());
    q.upsertMeta({ code: '110011', name: 'A', type: null });
    // 写入足够多的近期数据：最近一行为今天，向前回溯 60 天
    const today = new Date();
    const rows = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      return {
        navDate: d.toISOString().slice(0, 10),
        unitNav: 1 + i * 0.001,
        accNav: null,
        dailyPct: null,
      };
    });
    q.upsertNavRows('110011', rows);
    const res = await GET(new Request('http://x?range=30'), { params: { code: '110011' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta?.name).toBe('A');
    expect(body.rows.length).toBeGreaterThan(0);
    expect(mockedHistory).not.toHaveBeenCalled();
  });

  it('DB 数据陈旧时触发回填', async () => {
    const q = createQueries(getDb());
    q.upsertMeta({ code: '110011', name: 'A', type: null });
    mockedHistory.mockResolvedValue({
      ok: true,
      data: [{ navDate: '2026-05-15', unitNav: 1, accNav: null, dailyPct: null }],
    });
    const res = await GET(new Request('http://x?range=30'), { params: { code: '110011' } });
    expect(res.status).toBe(200);
    expect(mockedHistory).toHaveBeenCalledTimes(1);
  });

  it('行数不足请求范围时触发回填', async () => {
    const q = createQueries(getDb());
    q.upsertMeta({ code: '110011', name: 'A', type: null });
    const today = new Date().toISOString().slice(0, 10);
    q.upsertNavRows('110011', [{ navDate: today, unitNav: 1, accNav: null, dailyPct: null }]);
    mockedHistory.mockResolvedValue({ ok: true, data: [] });
    const res = await GET(new Request('http://x?range=90'), { params: { code: '110011' } });
    expect(res.status).toBe(200);
    expect(mockedHistory).toHaveBeenCalledTimes(1);
  });

  it('code 非法返回 400', async () => {
    const res = await GET(new Request('http://x'), { params: { code: 'x' } });
    expect(res.status).toBe(400);
  });
});
