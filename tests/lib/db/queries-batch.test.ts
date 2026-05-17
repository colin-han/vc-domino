import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('listWatchlistWithTags', () => {
  it('返回每只基金及其 tags 数组', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    q.upsertMeta({ code: '110012', name: 'Y', type: null });
    q.addToWatchlist('110011');
    q.addToWatchlist('110012');
    const t1 = q.createTag({ name: '核心', color: 'blue' });
    const t2 = q.createTag({ name: '高风险', color: 'red' });
    q.addFundTag('110011', t1.id);
    q.addFundTag('110011', t2.id);
    const items = q.listWatchlistWithTags();
    expect(items.map((i) => i.code).sort()).toEqual(['110011', '110012']);
    const x = items.find((i) => i.code === '110011');
    expect(x?.tags.map((t) => t.name).sort()).toEqual(['核心', '高风险']);
    const y = items.find((i) => i.code === '110012');
    expect(y?.tags).toEqual([]);
  });

  it('无 watchlist 时返回空数组', () => {
    const q = createQueries(freshDb());
    expect(q.listWatchlistWithTags()).toEqual([]);
  });
});

describe('listNavSeriesForCodes', () => {
  it('按 code 分组返回最近 N 行升序 nav', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    q.upsertMeta({ code: '110012', name: 'Y', type: null });
    q.upsertNavRows('110011', [
      { navDate: '2026-05-13', unitNav: 1.0, accNav: null, dailyPct: null },
      { navDate: '2026-05-14', unitNav: 1.1, accNav: null, dailyPct: null },
      { navDate: '2026-05-15', unitNav: 1.2, accNav: null, dailyPct: null },
    ]);
    q.upsertNavRows('110012', [
      { navDate: '2026-05-15', unitNav: 2.0, accNav: null, dailyPct: null },
    ]);
    const map = q.listNavSeriesForCodes(['110011', '110012'], 2);
    expect(map.get('110011')?.map((r) => r.nav_date)).toEqual(['2026-05-14', '2026-05-15']);
    expect(map.get('110012')?.map((r) => r.nav_date)).toEqual(['2026-05-15']);
  });

  it('空数组返回空 Map', () => {
    const q = createQueries(freshDb());
    const map = q.listNavSeriesForCodes([], 30);
    expect(map.size).toBe(0);
  });
});

describe('countNav 已存在', () => {
  it('countNav 返回行数', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    expect(q.countNav('110011')).toBe(0);
    q.upsertNavRows('110011', [
      { navDate: '2026-05-13', unitNav: 1, accNav: null, dailyPct: null },
      { navDate: '2026-05-14', unitNav: 1, accNav: null, dailyPct: null },
    ]);
    expect(q.countNav('110011')).toBe(2);
  });
});
