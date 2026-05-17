import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('queries.watchlist', () => {
  it('upsert + list + remove', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: '易方达中小盘混合', type: '混合型' });
    q.addToWatchlist('110011');
    q.upsertMeta({ code: '161725', name: '招商中证白酒', type: '指数型' });
    q.addToWatchlist('161725');
    const items = q.listWatchlist();
    expect(items.map((i) => i.code).sort()).toEqual(['110011', '161725']);
    q.removeFromWatchlist('110011');
    expect(q.listWatchlist().map((i) => i.code)).toEqual(['161725']);
  });

  it('重复加入抛 UNIQUE 错误', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'x', type: null });
    q.addToWatchlist('110011');
    expect(() => q.addToWatchlist('110011')).toThrow(/UNIQUE|PRIMARY/i);
  });
});

describe('queries.nav', () => {
  it('upsertMany + 范围查询', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'x', type: null });
    q.upsertNavRows('110011', [
      { navDate: '2026-05-13', unitNav: 1.0, accNav: 2.0, dailyPct: 0.1 },
      { navDate: '2026-05-14', unitNav: 1.1, accNav: 2.1, dailyPct: 10 },
    ]);
    q.upsertNavRows('110011', [
      { navDate: '2026-05-14', unitNav: 1.15, accNav: 2.15, dailyPct: 15 },
      { navDate: '2026-05-15', unitNav: 1.2, accNav: 2.2, dailyPct: 4.3 },
    ]);
    const rows = q.listNav('110011', 10);
    expect(rows.map((r) => r.nav_date)).toEqual(['2026-05-13', '2026-05-14', '2026-05-15']);
    expect(rows[1].unit_nav).toBeCloseTo(1.15, 4);
  });

  it('latestNav 返回最近一行或 null', () => {
    const q = createQueries(freshDb());
    expect(q.latestNav('110011')).toBeNull();
    q.upsertMeta({ code: '110011', name: 'x', type: null });
    q.upsertNavRows('110011', [{ navDate: '2026-05-15', unitNav: 1.2, accNav: null, dailyPct: null }]);
    const r = q.latestNav('110011');
    expect(r?.nav_date).toBe('2026-05-15');
  });
});
