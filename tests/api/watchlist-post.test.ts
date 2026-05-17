import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/source/eastmoney', () => ({
  fetchQuote: vi.fn(),
  fetchHistory: vi.fn(),
}));
vi.mock('@/lib/db/client', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('@/lib/db/migrate');
  const db = new Database(':memory:');
  runMigrations(db);
  return { getDb: () => db };
});

import { fetchQuote, fetchHistory } from '@/lib/source/eastmoney';
import { POST } from '@/app/api/watchlist/route';

const mockedQuote = vi.mocked(fetchQuote);
const mockedHistory = vi.mocked(fetchHistory);

beforeEach(() => {
  mockedQuote.mockReset();
  mockedHistory.mockReset();
  mockedHistory.mockResolvedValue({ ok: true, data: [] });
});

function req(body: unknown) {
  return new Request('http://x/api/watchlist', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/watchlist', () => {
  it('成功添加返回 201', async () => {
    mockedQuote.mockResolvedValue({
      ok: true,
      data: { code: '110011', name: 'A', navDate: '2026-05-15', unitNav: 1, estNav: null, estPct: null, estTime: null },
    });
    const res = await POST(req({ code: '110011' }));
    expect(res.status).toBe(201);
  });

  it('参数非法返回 400', async () => {
    const res = await POST(req({ code: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('基金不存在返回 400', async () => {
    mockedQuote.mockResolvedValue({ ok: false, reason: 'not_found' });
    const res = await POST(req({ code: '999999' }));
    expect(res.status).toBe(400);
  });

  it('上游异常返回 502', async () => {
    mockedQuote.mockResolvedValue({ ok: false, reason: 'network' });
    const res = await POST(req({ code: '110011' }));
    expect(res.status).toBe(502);
  });

  it('重复添加返回 409', async () => {
    mockedQuote.mockResolvedValue({
      ok: true,
      data: { code: '110011', name: 'A', navDate: '2026-05-15', unitNav: 1, estNav: null, estPct: null, estTime: null },
    });
    await POST(req({ code: '110011' }));
    const res = await POST(req({ code: '110011' }));
    expect(res.status).toBe(409);
  });
});
