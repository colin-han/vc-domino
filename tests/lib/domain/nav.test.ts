import { describe, it, expect } from 'vitest';
import { pctChange, withinRange } from '@/lib/domain/nav';

describe('pctChange', () => {
  it('计算两个净值的百分比变化', () => {
    expect(pctChange(1.0, 1.1)).toBeCloseTo(10, 4);
    expect(pctChange(2.0, 1.8)).toBeCloseTo(-10, 4);
  });
  it('prev=0 时返回 null', () => {
    expect(pctChange(0, 1)).toBeNull();
  });
});

describe('withinRange', () => {
  const rows = [
    { nav_date: '2026-05-10', unit_nav: 1 },
    { nav_date: '2026-05-12', unit_nav: 1.1 },
    { nav_date: '2026-05-15', unit_nav: 1.2 },
  ];
  it('按天数范围过滤', () => {
    const out = withinRange(rows, '2026-05-15', 5);
    expect(out.map((r) => r.nav_date)).toEqual(['2026-05-10', '2026-05-12', '2026-05-15']);
  });
  it('范围更窄时排除更早的行', () => {
    const out = withinRange(rows, '2026-05-15', 3);
    expect(out.map((r) => r.nav_date)).toEqual(['2026-05-12', '2026-05-15']);
  });
});
