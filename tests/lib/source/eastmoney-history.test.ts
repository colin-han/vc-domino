import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fetchHistory } from '@/lib/source/eastmoney';

function readFixture(name: string) {
  return fs.readFileSync(path.resolve(__dirname, '../../../fixtures/eastmoney', name), 'utf8');
}

function mockFetchJson(body: string, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  }) as unknown as typeof fetch;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('fetchHistory', () => {
  it('解析历史净值并按日期升序返回', async () => {
    mockFetchJson(readFixture('history-110011.json'));
    const r = await fetchHistory('110011', 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.map((x) => x.navDate)).toEqual(['2026-05-13', '2026-05-14', '2026-05-15']);
      expect(r.data[2].unitNav).toBeCloseTo(3.708, 4);
      expect(r.data[2].dailyPct).toBeCloseTo(0.45, 4);
      expect(r.data[0].dailyPct).toBeNull(); // 空字符串
    }
  });

  it('非 2xx 返回 network', async () => {
    mockFetchJson('{}', false);
    const r = await fetchHistory('110011', 10);
    expect(r.ok).toBe(false);
  });
});
