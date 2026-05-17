import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fetchQuote } from '@/lib/source/eastmoney';

function readFixture(name: string) {
  return fs.readFileSync(path.resolve(__dirname, '../../../fixtures/eastmoney', name), 'utf8');
}

function mockFetchText(body: string, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('fetchQuote', () => {
  it('成功解析 JSONP 响应', async () => {
    mockFetchText(readFixture('quote-110011.jsonp'));
    const r = await fetchQuote('110011');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.code).toBe('110011');
      expect(r.data.name).toBe('易方达中小盘混合');
      expect(r.data.unitNav).toBeCloseTo(3.708, 4);
      expect(r.data.estPct).toBeCloseTo(0.19, 4);
    }
  });

  it('空响应视为 not_found', async () => {
    mockFetchText(readFixture('quote-empty.txt'));
    const r = await fetchQuote('999999');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_found');
  });

  it('网络失败返回 network', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;
    const r = await fetchQuote('110011');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('network');
  });

  it('非 2xx 返回 network', async () => {
    mockFetchText('', false, 500);
    const r = await fetchQuote('110011');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('network');
  });
});
