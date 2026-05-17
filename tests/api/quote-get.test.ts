import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/source/eastmoney', () => ({ fetchQuote: vi.fn() }));
vi.mock('@/lib/cache', () => ({
  quoteCache: { get: vi.fn((_k: string, loader: () => Promise<unknown>) => loader()) },
}));

import { fetchQuote } from '@/lib/source/eastmoney';
import { GET } from '@/app/api/quote/[code]/route';

const mockedQuote = vi.mocked(fetchQuote);

beforeEach(() => { mockedQuote.mockReset(); });

describe('GET /api/quote/[code]', () => {
  it('成功返回估值', async () => {
    mockedQuote.mockResolvedValue({
      ok: true,
      data: { code: '110011', name: 'A', navDate: '2026-05-15', unitNav: 1, estNav: 1.01, estPct: 1, estTime: '2026-05-16 15:00' },
    });
    const res = await GET(new Request('http://x'), { params: { code: '110011' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.estPct).toBe(1);
  });

  it('上游失败返回 502', async () => {
    mockedQuote.mockResolvedValue({ ok: false, reason: 'network' });
    const res = await GET(new Request('http://x'), { params: { code: '110011' } });
    expect(res.status).toBe(502);
  });

  it('code 非法返回 400', async () => {
    const res = await GET(new Request('http://x'), { params: { code: 'x' } });
    expect(res.status).toBe(400);
  });
});
