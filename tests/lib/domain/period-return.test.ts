import { describe, it, expect } from 'vitest';
import { periodReturn } from '@/lib/domain/period-return';

describe('periodReturn', () => {
  it('计算首尾涨跌百分比', () => {
    const rows = [
      { nav_date: '2026-04-15', unit_nav: 1.0 },
      { nav_date: '2026-05-15', unit_nav: 1.1 },
    ];
    expect(periodReturn(rows)).toBeCloseTo(10, 4);
  });

  it('单行返回 0', () => {
    expect(periodReturn([{ nav_date: '2026-05-15', unit_nav: 1 }])).toBe(0);
  });

  it('空数组返回 null', () => {
    expect(periodReturn([])).toBeNull();
  });

  it('首值为 0 返回 null', () => {
    expect(periodReturn([
      { nav_date: '2026-04-15', unit_nav: 0 },
      { nav_date: '2026-05-15', unit_nav: 1 },
    ])).toBeNull();
  });
});
