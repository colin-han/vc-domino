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

function mockFetchSequence(bodies: string[]) {
  let i = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
      json: () => Promise.resolve(JSON.parse(body)),
    });
  }) as unknown as typeof fetch;
}

function makePage(rows: Array<{ date: string; nav: number }>): string {
  return JSON.stringify({
    Data: {
      LSJZList: rows.map((r) => ({
        FSRQ: r.date,
        DWJZ: r.nav.toFixed(4),
        LJJZ: r.nav.toFixed(4),
        JZZZL: '0',
      })),
    },
    ErrCode: 0,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchHistory', () => {
  it('解析单页历史净值并按日期升序返回', async () => {
    mockFetchJson(readFixture('history-110011.json'));
    const r = await fetchHistory('110011', 3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.map((x) => x.navDate)).toEqual(['2026-05-13', '2026-05-14', '2026-05-15']);
      expect(r.data[2].unitNav).toBeCloseTo(3.708, 4);
      expect(r.data[2].dailyPct).toBeCloseTo(0.45, 4);
      expect(r.data[0].dailyPct).toBeNull();
    }
  });

  it('单页不足 minRows 时停止（已取尽）', async () => {
    mockFetchJson(readFixture('history-110011.json'));
    const r = await fetchHistory('110011', 100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(3);
  });

  it('分页拉取直到累计达到 minRows', async () => {
    // 用 dayjs 风格手工制造连续工作日序列。上游降序返回。
    function makeDays(count: number, lastDateIso: string): string[] {
      const days: string[] = [];
      const d = new Date(lastDateIso + 'T00:00:00Z');
      for (let i = 0; i < count; i += 1) {
        days.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() - 1);
      }
      return days; // 降序
    }
    const page1Dates = makeDays(20, '2026-05-15'); // 2026-05-15 → 2026-04-26
    const page2Dates = makeDays(20, '2026-04-25'); // 2026-04-25 → 2026-04-06
    const page1Rows = page1Dates.map((d, i) => ({ date: d, nav: 1 + i * 0.01 }));
    const page2Rows = page2Dates.map((d, i) => ({ date: d, nav: 2 + i * 0.01 }));
    mockFetchSequence([makePage(page1Rows), makePage(page2Rows)]);
    const r = await fetchHistory('110011', 25);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(40);
      expect(r.data[0].navDate).toBe('2026-04-06'); // 最早
      expect(r.data[r.data.length - 1].navDate).toBe('2026-05-15'); // 最新
    }
  });

  it('达到 minRows 后不再请求下一页', async () => {
    const page1Rows = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-04-${String(30 - i).padStart(2, '0')}`,
      nav: 1 + i * 0.01,
    }));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(makePage(page1Rows))),
      text: () => Promise.resolve(makePage(page1Rows)),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const r = await fetchHistory('110011', 15);
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('Data 为 null 时返回空数组（上游"无数据"语义）', async () => {
    mockFetchJson(JSON.stringify({ Data: null, ErrCode: 0, TotalCount: 0 }));
    const r = await fetchHistory('110011', 10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
  });

  it('非 2xx 返回 network', async () => {
    mockFetchJson('{}', false);
    const r = await fetchHistory('110011', 10);
    expect(r.ok).toBe(false);
  });
});
